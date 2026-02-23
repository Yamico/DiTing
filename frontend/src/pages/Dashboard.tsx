import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { getVideos, getTasks, getTags, batchDeleteVideos, batchSetVideoTags, batchArchiveVideos } from '../api/client'
import type { Video, Task } from '../api/types'
import VideoCard from '../components/VideoCard'
import VideoListItem from '../components/VideoListItem'
import TagManager from '../components/TagManager'
import ConfirmModal from '../components/ConfirmModal'
import BatchTagEditor from '../components/BatchTagEditor'
import DetailPanel from '../components/DetailPanel'
import Pagination from '../components/Pagination'
import DashboardFilterBar from '../components/dashboard/DashboardFilterBar'
import DashboardDisplayToolbar from '../components/dashboard/DashboardDisplayToolbar'
import DashboardSelectionToolbar from '../components/dashboard/DashboardSelectionToolbar'
import DashboardActiveFilters from '../components/dashboard/DashboardActiveFilters'
import DashboardBatchActionBar from '../components/dashboard/DashboardBatchActionBar'
import { useState, useEffect, useRef } from 'react'

export default function Dashboard() {
    const { t } = useTranslation()
    const [searchParams, setSearchParams] = useSearchParams()

    // Batch Selection State
    const [selectionMode, setSelectionMode] = useState(false)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [batchThinking, setBatchThinking] = useState(false)
    const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false)
    const [showBatchTagEditor, setShowBatchTagEditor] = useState(false)

    // Separate UI state
    const [showTagManager, setShowTagManager] = useState(false)
    const [selectedVideo, setSelectedVideo] = useState<Video | null>(null)

    // Handle Escape key to cancel selection mode
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Only cancel selection if no other popups/modals are open
            if (e.key === 'Escape' && selectionMode && !showBatchDeleteConfirm && !showBatchTagEditor && !showTagManager && !selectedVideo) {
                setSelectionMode(false)
                setSelectedIds(new Set())
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [selectionMode, showBatchDeleteConfirm, showBatchTagEditor, showTagManager, selectedVideo])


    // Read State from URL Params (with defaults)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const sourceType = searchParams.get('source') || ''
    const status = searchParams.get('status') || ''
    const selectedTagId = searchParams.get('tag') ? Number(searchParams.get('tag')) : undefined
    const tagExclude = searchParams.get('tag_exclude') === '1'
    const sortBy = (searchParams.get('sort') || 'time') as 'time' | 'title' | 'segments'
    const viewMode = (searchParams.get('view') || 'grid') as 'grid' | 'list'

    // Quick Filters
    const parseQuick = (v: string | null) => v === '1' ? true : v === '0' ? false : undefined
    const hasSegments = parseQuick(searchParams.get('segments'))
    const hasAI = parseQuick(searchParams.get('ai'))
    const hasCached = parseQuick(searchParams.get('cached'))
    const isSubtitle = parseQuick(searchParams.get('subtitle'))

    // Archive Filter (None=hide, '1'=only archived, 'all'=show all)
    const includeArchived = searchParams.get('archived')

    // Search query from URL
    const searchQuery = searchParams.get('q') || ''

    // Helper to update params
    const updateParams = (updates: Record<string, string | null>) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev)
            Object.entries(updates).forEach(([key, value]) => {
                if (value === null) next.delete(key)
                else next.set(key, value)
            })
            return next
        })
    }

    // Helper specifically for page resets
    const updateFilter = (updates: Record<string, string | null>) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev)
            // Reset to page 1 for any filter change
            next.set('page', '1')
            Object.entries(updates).forEach(([key, value]) => {
                if (value === null) next.delete(key)
                else next.set(key, value)
            })
            return next
        })
    }

    const { data: tags } = useQuery({
        queryKey: ['tags'],
        queryFn: getTags
    })

    // Smart polling: Poll tasks to check for active jobs
    const { data: tasksData } = useQuery({
        queryKey: ['tasks'],
        queryFn: getTasks,
        refetchInterval: (query) => {
            const data = query.state.data as Record<string, Task> | undefined
            const hasActive = data ? Object.values(data).some(t => ['processing', 'pending'].includes(t.status)) : false
            return hasActive ? 3000 : 30000
        },
        refetchIntervalInBackground: false,
    })

    const queryClient = useQueryClient()
    const prevTasksRef = useRef<Record<string, Task>>()

    useEffect(() => {
        if (tasksData && prevTasksRef.current) {
            const hasNewlyFinished = Object.entries(tasksData).some(([id, task]) => {
                const prev = prevTasksRef.current?.[id]
                return prev && ['processing', 'pending'].includes(prev.status) && ['completed', 'failed', 'cancelled'].includes(task.status)
            })
            if (hasNewlyFinished) {
                queryClient.invalidateQueries({ queryKey: ['videos'] })
            }
        }
        prevTasksRef.current = tasksData
    }, [tasksData, queryClient])

    const hasActiveTasks = tasksData
        ? Object.values(tasksData).some(t => ['processing', 'pending'].includes(t.status))
        : false

    const { data, isLoading, refetch } = useQuery({
        // Include sort/filters in query key to trigger refetch
        queryKey: ['videos', page, limit, sourceType, status, selectedTagId, tagExclude, sortBy, hasSegments, hasAI, hasCached, isSubtitle, includeArchived, searchQuery],
        queryFn: () => getVideos({
            page,
            limit,
            sourceType: sourceType || undefined,
            status: status || undefined,
            tagId: tagExclude ? undefined : selectedTagId,
            excludeTagId: tagExclude ? selectedTagId : undefined,
            sortBy,
            hasSegments,
            hasAI,
            hasCached,
            isSubtitle,
            includeArchived: includeArchived || undefined,
            search: searchQuery || undefined
        }),
        refetchInterval: hasActiveTasks ? 5000 : 30000,
        refetchIntervalInBackground: false,
    })

    const totalPages = data ? Math.ceil(data.total / limit) : 0

    // --- Batch Operations ---

    const toggleSelectionMode = () => {
        setSelectionMode(!selectionMode)
        setSelectedIds(new Set())
    }

    const toggleSelect = (sourceId: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(sourceId)) next.delete(sourceId)
            else next.add(sourceId)
            return next
        })
    }

    const handleSelectAll = () => {
        const allIds = data?.items?.map(v => v.source_id) || []
        setSelectedIds(new Set(allIds))
    }

    const handleDeselectAll = () => {
        setSelectedIds(new Set())
    }

    const handleBatchDelete = async () => {
        if (selectedIds.size === 0) return
        setBatchThinking(true)
        setShowBatchDeleteConfirm(false)
        try {
            const idsToDelete = Array.from(selectedIds)
            await batchDeleteVideos(idsToDelete)
            setSelectedIds(new Set())
            setSelectionMode(false)
            refetch()
        } catch (e) {
            alert(t('dashboard.batch.deleteFailed') + ': ' + (e as Error).message)
        } finally {
            setBatchThinking(false)
        }
    }

    const handleBatchArchive = async (archived: boolean) => {
        if (selectedIds.size === 0) return
        setBatchThinking(true)
        try {
            const idsToUpdate = Array.from(selectedIds)
            await batchArchiveVideos(idsToUpdate, archived)
            setSelectedIds(new Set())
            setSelectionMode(false)
            refetch()
        } catch (e) {
            alert(t('common.error') + ': ' + (e as Error).message)
        } finally {
            setBatchThinking(false)
        }
    }

    const handleBatchTags = async (tagIds: number[]) => {
        if (selectedIds.size === 0) return
        setBatchThinking(true)
        setShowBatchTagEditor(false)
        try {
            const idsToUpdate = Array.from(selectedIds)
            await batchSetVideoTags(idsToUpdate, tagIds)
            setSelectedIds(new Set())
            setSelectionMode(false)
            refetch()
        } catch (e) {
            alert(t('dashboard.batch.tagFailed') + ': ' + (e as Error).message)
        } finally {
            setBatchThinking(false)
        }
    }

    return (
        <>
            {/* Filters Section */}
            <div className="w-full px-4 sm:px-6 lg:px-8 py-4 space-y-4">
                <DashboardFilterBar
                    sourceType={sourceType}
                    status={status}
                    selectedTagId={selectedTagId}
                    tagExclude={tagExclude}
                    hasSegments={hasSegments}
                    hasAI={hasAI}
                    hasCached={hasCached}
                    isSubtitle={isSubtitle}
                    includeArchived={includeArchived}
                    tags={tags}
                    onUpdateFilter={updateFilter}
                />

                <DashboardDisplayToolbar
                    sortBy={sortBy}
                    limit={limit}
                    viewMode={viewMode}
                    selectionMode={selectionMode}
                    onUpdateParams={updateParams}
                    onUpdateFilter={updateFilter}
                    onToggleSelectionMode={toggleSelectionMode}
                    onShowTagManager={() => setShowTagManager(true)}
                />

                {selectionMode && (
                    <DashboardSelectionToolbar
                        selectedCount={selectedIds.size}
                        onSelectAll={handleSelectAll}
                        onDeselectAll={handleDeselectAll}
                    />
                )}

                <DashboardActiveFilters
                    sourceType={sourceType}
                    status={status}
                    selectedTagId={selectedTagId}
                    tagExclude={tagExclude}
                    hasSegments={hasSegments}
                    hasAI={hasAI}
                    hasCached={hasCached}
                    isSubtitle={isSubtitle}
                    includeArchived={includeArchived}
                    searchQuery={searchQuery}
                    tags={tags}
                    onUpdateFilter={updateFilter}
                    onUpdateParams={updateParams}
                />
            </div>

            {/* Content Area */}
            <div className="w-full px-4 sm:px-6 lg:px-8 pb-8">
                {isLoading ? (
                    <div className="flex justify-center py-20">
                        <div className="animate-spin h-8 w-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full" />
                    </div>
                ) : data?.items?.length === 0 ? (
                    <div className="text-center py-20 text-[var(--color-text-muted)]">
                        {t('dashboard.display.empty')}
                    </div>
                ) : (
                    viewMode === 'grid' ? (
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
                            {(data?.items || []).map((video) => (
                                <VideoCard
                                    key={video.source_id}
                                    video={video}
                                    onRefresh={refetch}
                                    onOpenPanel={() => setSelectedVideo(video)}
                                    selectionMode={selectionMode}
                                    selected={selectedIds.has(video.source_id)}
                                    onToggleSelect={toggleSelect}
                                />
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {(data?.items || []).map((video) => (
                                <VideoListItem
                                    key={video.source_id}
                                    video={video}
                                    onRefresh={refetch}
                                    onOpenPanel={() => setSelectedVideo(video)}
                                    selectionMode={selectionMode}
                                    selected={selectedIds.has(video.source_id)}
                                    onToggleSelect={toggleSelect}
                                />
                            ))}
                        </div>
                    )
                )}

                {/* Pagination */}
                <Pagination
                    page={page}
                    totalPages={totalPages}
                    total={data?.total}
                    onPageChange={(p) => updateParams({ page: String(p) })}
                />
            </div>

            {selectedVideo && (
                <DetailPanel
                    video={selectedVideo}
                    onClose={() => setSelectedVideo(null)}
                    onRefresh={refetch}
                />
            )}

            {/* Tag Manager Modal */}
            {showTagManager && (
                <TagManager onClose={() => setShowTagManager(false)} />
            )}

            {/* Floating Batch Action Bar */}
            {selectionMode && (
                <DashboardBatchActionBar
                    selectedCount={selectedIds.size}
                    includeArchived={includeArchived}
                    onShowBatchTagEditor={() => setShowBatchTagEditor(true)}
                    onShowBatchDeleteConfirm={() => setShowBatchDeleteConfirm(true)}
                    onBatchArchive={handleBatchArchive}
                    onCancelSelection={toggleSelectionMode}
                />
            )}

            {/* Batch Delete Confirm */}
            {showBatchDeleteConfirm && (
                <ConfirmModal
                    isOpen={showBatchDeleteConfirm}
                    title={t('dashboard.batch.delete')}
                    message={t('dashboard.batch.deleteConfirm', { count: selectedIds.size })}
                    confirmText={batchThinking ? t('common.loading') : t('common.delete')}
                    cancelText={t('common.cancel')}
                    variant="danger"
                    onConfirm={handleBatchDelete}
                    onCancel={() => setShowBatchDeleteConfirm(false)}
                />
            )}

            {/* Batch Tag Editor */}
            {showBatchTagEditor && (
                <BatchTagEditor
                    count={selectedIds.size}
                    onConfirm={handleBatchTags}
                    onClose={() => setShowBatchTagEditor(false)}
                />
            )}
        </>
    )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getVideoSegments, deleteVideo, refreshMetadata, deleteVideoCache } from '../api'
import type { Video, Segment } from '../api/types'
import { useToast } from '../contexts/ToastContext'
import SegmentCard from './SegmentCard'
import type { RefineContext } from './SegmentCard'
import AISummaryModal from './AISummaryModal'
import ConfirmModal from './ConfirmModal'
import Icons from './ui/Icons'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useIsDesktop } from '../hooks/useIsDesktop'

interface DetailPanelProps {
    video: Video
    onClose: () => void
    onRefresh: () => void
}

export default function DetailPanel({ video, onClose, onRefresh }: DetailPanelProps) {
    useEscapeKey(onClose)
    const { t } = useTranslation()
    const isDesktop = useIsDesktop()
    const navigate = useNavigate()
    const [loading, setLoading] = useState(false)
    const [aiModalState, setAiModalState] = useState<{ segment: Segment; refineContext?: RefineContext } | null>(null)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [showCacheDeleteConfirm, setShowCacheDeleteConfirm] = useState(false)
    const { showToast } = useToast()
    const queryClient = useQueryClient()

    const { data: segments, isLoading, refetch } = useQuery({
        queryKey: ['panel-segments', video.source_id],
        queryFn: () => getVideoSegments(video.source_id),
        refetchInterval: 5000,
    })

    // Get origin link based on source type
    const getOriginLink = () => {
        if (video.original_source) return video.original_source

        switch (video.source_type) {
            case 'bilibili':
                return `https://www.bilibili.com/video/${video.source_id}`
            case 'youtube':
                return `https://www.youtube.com/watch?v=${video.source_id}`
            case 'douyin':
                return `https://www.douyin.com/video/${video.source_id.replace(/^dy_/, '')}`
            default:
                return null
        }
    }

    const handleBulkDelete = async () => {
        setShowDeleteConfirm(false)
        setLoading(true)
        try {
            await deleteVideo(video.source_id)
            showToast('success', t('detailPanel.deletedSuccess', { title: video.title }))
            onClose()
            onRefresh()
        } catch (e) {
            showToast('error', t('detailPanel.deleteFailed') + (e as Error).message)
        } finally {
            setLoading(false)
        }
    }

    const handleRefreshMetadata = async () => {
        setLoading(true)
        try {
            const result = await refreshMetadata(video.source_id)
            if (result && result.title) {
                // Update the video in React Query cache
                queryClient.setQueryData(['videos'], (old: any) => {
                    if (!old) return old
                    return {
                        ...old,
                        items: old.items?.map((v: Video) =>
                            v.source_id === video.source_id
                                ? { ...v, title: result.title, cover: result.cover }
                                : v
                        )
                    }
                })
                showToast('success', t('detailPanel.syncSuccess'))
                onRefresh()
            } else {
                showToast('error', t('detailPanel.syncFailedReason'))
            }
        } catch (e) {
            showToast('error', t('detailPanel.syncFailed') + (e as Error).message)
        } finally {
            setLoading(false)
        }
    }

    const handleDeleteCache = async () => {
        setShowCacheDeleteConfirm(false)
        setLoading(true)
        try {
            await deleteVideoCache(video.source_id)
            showToast('success', t('detailPanel.cacheDeleted'))
            handleRefreshMetadata() // Refresh metadata to update cache status if needed
        } catch (e) {
            showToast('error', t('detailPanel.deleteCacheFailed') + (e as Error).message)
        } finally {
            setLoading(false)
        }
    }

    const [isExpanded, setIsExpanded] = useState(false)
    const originLink = getOriginLink()

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm animate-fade-in"
                onClick={onClose}
            />

            {/* Panel */}
            <div
                className={`fixed z-50 flex flex-col bg-[var(--color-bg)] shadow-2xl custom-scrollbar ${isDesktop
                    ? 'animate-slide-up-fade rounded-xl border border-[var(--color-border)]'
                    : 'animate-slide-up-fade-mobile inset-0'
                    }`}
                style={isDesktop ? {
                    top: '5%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: '90%',
                    maxWidth: '900px',
                    height: '90vh',
                } : undefined}
            >
                {/* Header */}
                <div className="flex flex-col sm:flex-row gap-4 p-4 border-b border-[var(--color-border)] bg-[var(--color-bg)]/80 backdrop-blur-md z-10 rounded-t-xl shrink-0">
                    {/* Cover */}
                    {video.cover && (
                        <div className="shrink-0">
                            <img
                                src={video.cover}
                                alt=""
                                className="w-full sm:w-28 h-auto rounded-lg object-cover shadow-sm border border-[var(--color-border)]"
                            />
                        </div>
                    )}

                    {/* Content */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                        <div className="flex items-start justify-between gap-4">
                            <div
                                className="space-y-1 cursor-pointer group"
                                onClick={() => setIsExpanded(!isExpanded)}
                                title={isExpanded ? t('detailPanel.collapse') : t('detailPanel.expand')}
                            >
                                <h3 className={`text-lg font-medium leading-normal transition-all duration-200 ${!isExpanded && 'line-clamp-2'}`}>
                                    {video.title}
                                </h3>

                                <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] group-hover:text-[var(--color-primary)] transition-colors">
                                    <Icons.ChevronDown className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                                    <span>{isExpanded ? t('detailPanel.collapseDetails') : t('detailPanel.expandDetails')}</span>
                                    {originLink && (
                                        <>
                                            <span className="text-[var(--color-border)]">|</span>
                                            <a
                                                href={originLink}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1 hover:underline text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <Icons.ExternalLink className="w-3 h-3" />
                                                {t('detailPanel.sourceVideo')}
                                            </a>
                                        </>
                                    )}
                                </div>
                            </div>

                            <button
                                onClick={onClose}
                                className="shrink-0 p-1.5 rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-hover)] transition-colors"
                            >
                                <Icons.X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Actions Toolbar */}
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                            <button
                                onClick={handleRefreshMetadata}
                                disabled={loading}
                                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[var(--color-text-muted)] bg-[var(--color-bg-hover)] hover:bg-[var(--color-border)]/50 rounded-md disabled:opacity-50 transition-colors"
                            >
                                <Icons.Refresh className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                                {t('detailPanel.syncTitleCover')}
                            </button>
                            <div className="w-px h-3 bg-[var(--color-border)] mx-1" />
                            {video.media_available && (
                                <>
                                    <button
                                        onClick={() => setShowCacheDeleteConfirm(true)}
                                        disabled={loading}
                                        className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-amber-500/80 hover:text-amber-600 hover:bg-amber-500/10 rounded-md disabled:opacity-50 transition-colors"
                                        title={t('detailPanel.cacheOccupied') + ((video.media_path?.length || 0) > 0 ? t('detailPanel.occupied') : t('detailPanel.unknown'))}
                                    >
                                        <Icons.Trash className="w-3.5 h-3.5" />
                                        {t('detailPanel.clearCache')}
                                    </button>
                                    <div className="w-px h-3 bg-[var(--color-border)] mx-1" />
                                </>
                            )}
                            <button
                                onClick={() => {
                                    onClose()
                                    navigate(`/detail/${encodeURIComponent(video.source_id)}`)
                                }}
                                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-[var(--color-primary)] bg-[var(--color-primary)]/10 hover:bg-[var(--color-primary)]/20 rounded-md transition-colors"
                            >
                                <Icons.ExternalLink className="w-3.5 h-3.5" />
                                {t('detailPanel.viewFullDetail')}
                            </button>
                            <div className="w-px h-3 bg-[var(--color-border)] mx-1" />
                            <button
                                onClick={() => setShowDeleteConfirm(true)}
                                disabled={loading}
                                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-red-500/80 hover:text-red-600 hover:bg-red-500/10 rounded-md disabled:opacity-50 transition-colors"
                            >
                                <Icons.Trash className="w-3.5 h-3.5" />
                                {t('detailPanel.deleteRecord')}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Segments List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {isLoading ? (
                        <div className="flex justify-center py-10">
                            <div className="animate-spin h-6 w-6 border-4 border-[var(--color-primary)] border-t-transparent rounded-full" />
                        </div>
                    ) : segments?.length === 0 ? (
                        <div className="text-center py-10 text-[var(--color-text-muted)]">
                            {t('detailPanel.noSegments')}
                        </div>
                    ) : (
                        segments?.map((segment, index) => (
                            <SegmentCard
                                key={segment.id}
                                segment={segment}
                                onRefresh={refetch}
                                isExpandedDefault={index === 0}
                                onOpenAiModal={(seg, refineCtx) => setAiModalState({ segment: seg, refineContext: refineCtx })}
                            />
                        ))
                    )}
                </div>
            </div>

            {/* AI Summary Modal */}
            <AISummaryModal
                isOpen={!!aiModalState}
                onClose={() => setAiModalState(null)}
                segment={aiModalState?.segment ?? null}
                refineContext={aiModalState?.refineContext ?? null}
                onSuccess={() => {
                    refetch()
                    onRefresh()
                }}
            />

            {/* Delete Confirmation Modal */}
            <ConfirmModal
                isOpen={showDeleteConfirm}
                title={t('detailPanel.deleteConfirmTitle')}
                message={t('detailPanel.deleteConfirmMsg', { title: video.title })}
                confirmText={t('detailPanel.deleteBtn')}
                cancelText={t('common.cancel')}
                variant="danger"
                onConfirm={handleBulkDelete}
                onCancel={() => setShowDeleteConfirm(false)}
            />

            {/* Clear Cache Confirmation Modal */}
            <ConfirmModal
                isOpen={showCacheDeleteConfirm}
                title={t('detailPanel.clearCacheTitle')}
                message={t('detailPanel.clearCacheMsg', { title: video.title })}
                confirmText={t('detailPanel.clearBtn')}
                cancelText={t('common.cancel')}
                variant="warning"
                onConfirm={handleDeleteCache}
                onCancel={() => setShowCacheDeleteConfirm(false)}
            />
        </>
    )
}

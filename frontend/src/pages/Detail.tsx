import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
    batchCache,
    deleteVideoCache,
    getVideo,
    getVideoSegments,
    updateVideoCachePolicy,
    updateVideoNotes,
    type CacheEntry,
    type Segment,
    type Video
} from '../api'
import ReactMarkdown from 'react-markdown'
import AISummaryModal from '../components/AISummaryModal'
import ConfirmModal from '../components/ConfirmModal'
import ImmersiveView from '../components/ImmersiveView'
import SegmentCard, { type RefineContext } from '../components/SegmentCard'
import Icons from '../components/ui/Icons'
import { useToast } from '../contexts/ToastContext'
import { useIsDesktop } from '../hooks/useIsDesktop'
import remarkGfm from 'remark-gfm'
import VideoPlayer from '../components/VideoPlayer'

export default function Detail() {
    const { t } = useTranslation()
    const { showToast } = useToast()
    const isDesktop = useIsDesktop()
    const { sourceId } = useParams<{ sourceId: string }>()
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const highlightQuery = searchParams.get('highlight') || ''
    const queryClient = useQueryClient()

    // Player State
    const [activeTab, setActiveTab] = useState<'local' | 'stream' | 'embed'>('local')
    const [contentTab, setContentTab] = useState<'segments' | 'immersive'>('segments')
    const [currentTime, setCurrentTime] = useState(0)
    const playerRef = useRef<HTMLVideoElement | HTMLAudioElement>(null)
    const lastTimeRef = useRef(0)
    const [showPolicyMenu, setShowPolicyMenu] = useState(false)
    const [showDeleteCacheConfirm, setShowDeleteCacheConfirm] = useState(false)
    const [aiModalState, setAiModalState] = useState<{ segment: Segment; refineContext?: RefineContext } | null>(null)
    const [selectedVersion, setSelectedVersion] = useState<CacheEntry | null>(null)
    const [showAppendCacheMenu, setShowAppendCacheMenu] = useState(false)

    // Resizable split pane state
    const [leftPanelWidth, setLeftPanelWidth] = useState(40) // percentage
    const isDraggingRef = useRef(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const leftColumnRef = useRef<HTMLDivElement>(null)
    const [stickyHeight, setStickyHeight] = useState(0)

    const handleDividerMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        isDraggingRef.current = true
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'

        const handleMouseMove = (e: MouseEvent) => {
            if (!isDraggingRef.current || !containerRef.current) return
            const rect = containerRef.current.getBoundingClientRect()
            const newWidth = ((e.clientX - rect.left) / rect.width) * 100
            // Clamp between 25% and 65%
            setLeftPanelWidth(Math.min(65, Math.max(25, newWidth)))
        }

        const handleMouseUp = () => {
            isDraggingRef.current = false
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
            window.removeEventListener('mousemove', handleMouseMove)
            window.removeEventListener('mouseup', handleMouseUp)
        }

        window.addEventListener('mousemove', handleMouseMove)
        window.addEventListener('mouseup', handleMouseUp)
    }, [])

    const handleDividerTouchStart = useCallback(() => {
        isDraggingRef.current = true
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'

        const handleTouchMove = (e: TouchEvent) => {
            if (!isDraggingRef.current || !containerRef.current) return
            const rect = containerRef.current.getBoundingClientRect()
            const touch = e.touches[0]
            if (!touch) return
            const newWidth = ((touch.clientX - rect.left) / rect.width) * 100
            setLeftPanelWidth(Math.min(65, Math.max(25, newWidth)))
        }

        const handleTouchEnd = () => {
            isDraggingRef.current = false
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
            window.removeEventListener('touchmove', handleTouchMove)
            window.removeEventListener('touchend', handleTouchEnd)
            window.removeEventListener('touchcancel', handleTouchEnd)
        }

        // Use { passive: false } to allow preventDefault if needed, though we didn't add it to e.preventDefault above to avoid passive listener warnings
        window.addEventListener('touchmove', handleTouchMove, { passive: true })
        window.addEventListener('touchend', handleTouchEnd)
        window.addEventListener('touchcancel', handleTouchEnd)
    }, [])



    const { data: video, isLoading: isVideoLoading } = useQuery({
        queryKey: ['video', sourceId],
        queryFn: () => getVideo(sourceId!),
        enabled: !!sourceId,
        refetchInterval: (query) => {
            const v = query.state.data as Video | undefined
            const isActive = v?.latest_status === 'processing' || v?.latest_status === 'pending'
            return isActive ? 5000 : 30000
        },
    })

    const isActive = video?.latest_status === 'processing' || video?.latest_status === 'pending'

    const { data: segments, isLoading: isSegmentsLoading, refetch: refetchSegments } = useQuery({
        queryKey: ['segments', sourceId],
        queryFn: () => getVideoSegments(sourceId!),
        enabled: !!sourceId,
        refetchInterval: isActive ? 5000 : 30000,
    })



    // Mobile Layout State
    const [mobileLayout, setMobileLayout] = useState<'scroll' | 'split'>(() => {
        return (localStorage.getItem('detail-mobile-layout') as 'scroll' | 'split') || 'split'
    })

    const toggleMobileLayout = () => {
        const next = mobileLayout === 'scroll' ? 'split' : 'scroll'
        setMobileLayout(next)
        localStorage.setItem('detail-mobile-layout', next)
    }

    // Measure sticky left column height for split-screen bounded scroll
    useEffect(() => {
        if (mobileLayout !== 'split' || !leftColumnRef.current) return
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                setStickyHeight(entry.contentRect.height + 8) // +8 for border/padding
            }
        })
        observer.observe(leftColumnRef.current)
        return () => observer.disconnect()
    }, [mobileLayout])

    // Notes State
    const [isEditingNotes, setIsEditingNotes] = useState(false)
    const [notesContent, setNotesContent] = useState('')

    // Retranscribe State
    const [retranscribeConfirm, setRetranscribeConfirm] = useState(false)

    const handleRetranscribe = async () => {
        if (!video) return
        if (video.source_type !== 'bilibili' && video.source_type !== 'youtube' && video.source_type !== 'douyin') {
            showToast('error', t('videoCard.retranscribeUnsupported'))
            return
        }
        setRetranscribeConfirm(false)
        try {
            if (video.source_type === 'bilibili') {
                const url = video.original_source || `https://www.bilibili.com/video/${video.source_id}`
                const { transcribeBilibili } = await import('../api')
                await transcribeBilibili({ url })
            } else if (video.source_type === 'youtube') {
                const url = video.original_source || `https://www.youtube.com/watch?v=${video.source_id}`
                const { transcribeYoutube } = await import('../api')
                await transcribeYoutube({ url })
            } else if (video.source_type === 'douyin') {
                const { transcribeDouyin } = await import('../api')
                await transcribeDouyin({ url: video.source_id })
            }
            showToast('success', t('common.success'))
            queryClient.invalidateQueries({ queryKey: ['video', sourceId] })
        } catch (e) {
            showToast('error', t('common.error') + ': ' + (e as Error).message)
        }
    }

    // Mutation for Notes
    const updateNotesMutation = useMutation({
        mutationFn: (notes: string) => updateVideoNotes(sourceId!, notes),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['video', sourceId] })
            setIsEditingNotes(false)
        },
        onError: (err) => {
            showToast('error', t('common.error') + ': ' + err)
        }
    })

    // Mutation for Cache Policy
    const updatePolicyMutation = useMutation({
        mutationFn: (data: { policy: 'keep_forever' | 'custom' | null, expires: string | null }) =>
            updateVideoCachePolicy(sourceId!, { cache_policy: data.policy, cache_expires_at: data.expires }),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['video', sourceId] })
            setShowPolicyMenu(false)
        },
        onError: (err) => {
            showToast('error', t('common.error') + ': ' + err)
        }
    })

    // Mutation for Delete Cache
    const deleteCacheMutation = useMutation({
        mutationFn: deleteVideoCache,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['video', sourceId] })
            showToast('success', t('common.success'))
            setShowPolicyMenu(false)
            // Ideally refresh page if local file is gone
        },
        onError: (err) => {
            showToast('error', t('videoCard.deleteFailed') + ': ' + err)
        }
    })

    // Initialize active tab based on availability
    useEffect(() => {
        if (video) {
            if (video.media_available) {
                setActiveTab('local')
            } else if (video.stream_url && !video.stream_expired) {
                setActiveTab('stream')
            } else if (video.embed_url) {
                setActiveTab('embed')
            } else {
                setActiveTab('local') // Default fallback even if empty
            }
        }
    }, [video?.media_available, video?.stream_url, video?.embed_url, video?.stream_expired])

    // Initialize selected version
    useEffect(() => {
        if (video?.cache_versions?.length) {
            const match = video.cache_versions.find(v => v.media_path === video.media_path)
            if (match) setSelectedVersion(match)
            else if (video.cache_versions[0]) setSelectedVersion(video.cache_versions[0])
        } else {
            setSelectedVersion(null)
        }
    }, [video?.cache_versions, video?.media_path])

    const handleAppendCache = async (quality: string) => {
        setShowAppendCacheMenu(false)
        if (!video) return
        // Use original_source (full URL), not source_id (BV ID)
        const url = video.original_source || video.source
        if (!url || url === video.source_id) {
            showToast('error', t('detail.appendCache.noUrl'))
            return
        }
        try {
            await batchCache([url], quality)
            showToast('success', t('detail.appendCache.success'))
        } catch (e: any) {
            showToast('error', t('detail.appendCache.failed') + ': ' + (e.message || String(e)))
        }
    }

    const title = video?.title || sourceId
    const isLoading = isVideoLoading || isSegmentsLoading

    // Media Player Logic
    const renderPlayer = () => {
        return (
            <VideoPlayer
                video={video}
                sourceId={sourceId!}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                playerRef={playerRef}
                lastTimeRef={lastTimeRef}
                setCurrentTime={setCurrentTime}
                mobileLayout={mobileLayout}
                selectedVersion={selectedVersion}
                setSelectedVersion={setSelectedVersion}
                showPolicyMenu={showPolicyMenu}
                setShowPolicyMenu={setShowPolicyMenu}
                setShowDeleteCacheConfirm={setShowDeleteCacheConfirm}
                showAppendCacheMenu={showAppendCacheMenu}
                setShowAppendCacheMenu={setShowAppendCacheMenu}
                updatePolicyMutation={updatePolicyMutation}
                handleAppendCache={handleAppendCache}
            />
        )
    }

    // Scroll state for header effect (kept for styling but simplified for viewport layout)
    const [scrolled] = useState(false)

    return (
        <div className="h-screen flex flex-col bg-[var(--color-bg)] overflow-hidden">
            {/* Header - Aligned with Dashboard style */}
            <header className={`sticky top-0 z-40 w-full transition-all duration-200 border-b ${scrolled
                ? 'bg-[var(--color-bg)]/80 backdrop-blur-md border-[var(--color-border)] shadow-sm'
                : 'bg-[var(--color-bg)] border-transparent'
                }`}>
                <div className="w-full px-4 sm:px-6 lg:px-8 min-h-[4rem] py-2 lg:py-0 flex flex-wrap lg:flex-nowrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                        <button
                            onClick={() => navigate(-1)}
                            className="p-2 -ml-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-card)] rounded-lg transition-all duration-200"
                            title={t('detail.back')}
                        >
                            <Icons.ArrowLeft className="w-5 h-5" />
                        </button>

                        <h1 className="text-base lg:text-lg font-bold leading-tight tracking-tight truncate">
                            {title}
                        </h1>
                    </div>

                    <div className="flex items-center gap-3">
                        {highlightQuery && (
                            <div className="hidden sm:flex items-center gap-2 text-sm bg-yellow-50 dark:bg-yellow-900/20 px-3 py-1.5 rounded-full border border-yellow-200 dark:border-yellow-800">
                                <span className="text-[var(--color-text-muted)]">{t('detail.search')}</span>
                                <span className="font-medium text-yellow-700 dark:text-yellow-400">
                                    {highlightQuery}
                                </span>
                                <button
                                    onClick={() => navigate(`/detail/${encodeURIComponent(sourceId!)}`, { replace: true })}
                                    className="ml-1 p-0.5 hover:bg-black/5 dark:hover:bg-white/10 rounded-full transition-colors"
                                >
                                    <Icons.X className="w-3 h-3 text-[var(--color-text-muted)]" />
                                </button>
                            </div>
                        )}

                        {/* Mobile Layout Toggle (Only visible on small screens, inline in header) */}
                        <button
                            onClick={toggleMobileLayout}
                            className="lg:hidden p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-card)] rounded-lg transition-all duration-200"
                            title={mobileLayout === 'split' ? t('detail.layout.scroll') : t('detail.layout.split')}
                        >
                            {mobileLayout === 'split' ? (
                                <Icons.Layout className="w-5 h-5" />
                            ) : (
                                <Icons.SplitSquareHorizontal className="w-5 h-5" />
                            )}
                        </button>

                        {/* Re-transcribe Button */}
                        {(video?.source_type === 'bilibili' || video?.source_type === 'youtube' || (video?.source_type === 'douyin' && video?.media_available)) && (
                            <button
                                onClick={() => setRetranscribeConfirm(true)}
                                className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-card)] rounded-lg transition-all duration-200"
                                title={t('detail.retranscribe')}
                            >
                                <Icons.Refresh className="w-5 h-5" />
                            </button>
                        )}

                        {/* Add more header actions here if needed */}
                    </div>
                </div>
            </header>

            {/* Main Content Area - Full viewport height, independent scroll */}
            <div ref={containerRef} className={`flex-1 flex flex-col lg:flex-row min-h-0 w-full px-4 sm:px-6 lg:px-8 gap-6 lg:gap-0 overflow-y-auto lg:overflow-hidden ${mobileLayout === 'split' ? 'py-0 lg:py-4' : 'py-4'}`}>
                {/* Left Column: Player & Notes */}
                <div
                    ref={leftColumnRef}
                    className={`w-full lg:flex-shrink-0 lg:overflow-y-auto lg:pr-3 ${mobileLayout === 'split' ? 'sticky top-0 z-30 bg-[var(--color-bg)] pb-2 border-b lg:border-none border-[var(--color-border)] lg:relative lg:pb-4 lg:space-y-6' : 'space-y-6 pb-4'}`}
                    style={isDesktop ? { width: `${leftPanelWidth}%` } : undefined}
                >

                    {renderPlayer()}

                    {/* Notes Section — hidden on mobile in split mode */}<div className={`bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl overflow-hidden shadow-sm transition-all duration-200 ${isEditingNotes ? 'ring-2 ring-[var(--color-primary)]/20' : ''} ${mobileLayout === 'split' ? 'hidden lg:block' : ''}`}>
                        <div className="px-4 py-3 border-b border-[var(--color-border)] flex justify-between items-center bg-[var(--color-card-muted)]">
                            <h3 className="font-medium text-sm flex items-center gap-2">
                                {t('detail.notes.title')}
                            </h3>
                            <div className="flex items-center gap-2">
                                {!isEditingNotes ? (
                                    <button
                                        onClick={() => {
                                            setNotesContent(video?.notes || '')
                                            setIsEditingNotes(true)
                                        }}
                                        className="px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-bg)] rounded transition-all"
                                    >
                                        <div className="flex items-center gap-1">
                                            <Icons.Edit className="w-3 h-3" />
                                            <span>{t('detail.notes.edit')}</span>
                                        </div>
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => setIsEditingNotes(false)}
                                            className="px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg)] rounded transition-all"
                                        >
                                            {t('detail.notes.cancel')}
                                        </button>
                                        <button
                                            onClick={() => updateNotesMutation.mutate(notesContent)}
                                            disabled={updateNotesMutation.isPending}
                                            className="px-3 py-1 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-1 shadow-sm"
                                        >
                                            <Icons.Save className="w-3 h-3" />
                                            <span>{updateNotesMutation.isPending ? t('detail.notes.saving') : t('detail.notes.save')}</span>
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="p-4 min-h-[120px] lg:min-h-[200px] max-h-[400px] lg:max-h-[600px] overflow-y-auto bg-[var(--color-bg)]/50">
                            {isEditingNotes ? (
                                <div className="space-y-3">
                                    <textarea
                                        value={notesContent}
                                        onChange={(e) => setNotesContent(e.target.value)}
                                        className="w-full h-64 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-sm focus:ring-1 focus:ring-[var(--color-primary)] outline-none resize-none font-mono leading-relaxed"
                                        placeholder={t('detail.notes.placeholder')}
                                        autoFocus
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                                                updateNotesMutation.mutate(notesContent)
                                            }
                                        }}
                                    />
                                    <div className="flex justify-between items-center">
                                        <p className="text-[10px] text-[var(--color-text-muted)]">
                                            {t('detail.notes.tip')}
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                video?.notes ? (
                                    <div className="prose prose-sm dark:prose-invert max-w-none text-[var(--color-text)]">
                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{video.notes}</ReactMarkdown>
                                    </div>
                                ) : (
                                    <div
                                        className="h-32 flex flex-col items-center justify-center text-[var(--color-text-muted)] cursor-pointer hover:bg-[var(--color-bg-muted)]/50 rounded-lg border border-dashed border-[var(--color-border)] transition-all duration-200 group"
                                        onClick={() => {
                                            setNotesContent('')
                                            setIsEditingNotes(true)
                                        }}
                                    >
                                        <div className="w-10 h-10 rounded-full bg-[var(--color-bg-muted)] flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                            <Icons.Edit className="w-5 h-5 opacity-50" />
                                        </div>
                                        <span className="text-sm">{t('detail.notes.empty')}</span>
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                </div>

                {/* Draggable Divider */}
                <div
                    className="hidden lg:flex items-center justify-center w-5 mx-1 cursor-col-resize group flex-shrink-0 select-none touch-none"
                    onMouseDown={handleDividerMouseDown}
                    onTouchStart={handleDividerTouchStart}
                >
                    <div className="w-1 h-12 rounded-full bg-[var(--color-border)] group-hover:bg-[var(--color-primary)] group-hover:h-20 group-active:bg-[var(--color-primary)] transition-all duration-200 opacity-50 group-hover:opacity-100" />
                </div>

                {/* Right Column: Transcriptions */}
                <div
                    className={`flex-1 flex-col flex min-h-0 lg:overflow-hidden lg:pl-3 ${mobileLayout === 'split' ? 'overflow-hidden' : ''}`}
                    style={!isDesktop && mobileLayout === 'split' && stickyHeight > 0 ? { height: `calc(100vh - 4rem - ${stickyHeight}px)`, flexShrink: 0 } : undefined}
                >
                    {isLoading ? (
                        <div className="flex justify-center py-20">
                            <div className="animate-spin h-8 w-8 border-4 border-[var(--color-primary)] border-t-transparent rounded-full" />
                        </div>
                    ) : (
                        <div className={`flex-1 flex flex-col ${mobileLayout === 'split' ? 'overflow-hidden min-h-0' : 'lg:overflow-hidden'}`}>
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 shrink-0">
                                <h2 className="text-lg font-semibold flex items-center gap-2">
                                    <Icons.FileText className="w-5 h-5" />
                                    {t('detail.transcription.title')}
                                </h2>
                                {/* Immersive Trigger */}
                                <div className="flex bg-[var(--color-card-muted)] p-1 rounded-lg">
                                    <button
                                        onClick={() => setContentTab('segments')}
                                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${contentTab === 'segments'
                                            ? 'bg-[var(--color-card)] shadow-sm text-[var(--color-text)]'
                                            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                                            }`}
                                    >
                                        {t('detail.transcription.listMode')}
                                    </button>
                                    <button
                                        onClick={() => setContentTab('immersive')}
                                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${contentTab === 'immersive'
                                            ? 'bg-[var(--color-card)] shadow-sm text-[var(--color-text)]' // Active
                                            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                                            }`}
                                    >
                                        <Icons.Music className="w-3 h-3" />
                                        {t('detail.transcription.immersiveMode')}
                                    </button>
                                </div>
                            </div>

                            {contentTab === 'segments' ? (
                                segments?.length === 0 ? (
                                    <div className="text-center py-20 text-[var(--color-text-muted)]">
                                        {t('detail.transcription.empty')}
                                    </div>
                                ) : (
                                    <div className={`flex-1 space-y-4 pr-2 ${mobileLayout === 'split' ? 'overflow-y-auto' : 'overflow-y-auto lg:overflow-y-auto'}`}>
                                        {segments?.map((segment) => (
                                            <SegmentCard
                                                key={segment.id}
                                                segment={segment}
                                                onRefresh={refetchSegments}
                                                highlightText={highlightQuery}
                                                onOpenAiModal={(seg, refineCtx) => setAiModalState({ segment: seg, refineContext: refineCtx })}
                                            />
                                        ))}
                                    </div>
                                )
                            ) : (
                                <div className={`flex-1 lg:min-h-0 h-full ${mobileLayout === 'split' ? 'min-h-0 overflow-hidden' : 'min-h-[60vh] lg:overflow-hidden'}`}>
                                    <ImmersiveView
                                        segments={segments || []}
                                        currentTime={currentTime}
                                        onSeek={(time) => {
                                            if (playerRef.current) {
                                                playerRef.current.currentTime = time
                                                playerRef.current.play()
                                            }
                                        }}
                                        height="100%"
                                    />
                                </div>
                            )}
                        </div>
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
                    refetchSegments()
                }}
            />

            {/* Delete Cache Confirm Modal */}
            <ConfirmModal
                isOpen={showDeleteCacheConfirm}
                title={t('detail.confirm.deleteCacheTitle')}
                message={t('detail.confirm.deleteCacheMessage', { title: video?.title || sourceId })}
                confirmText={t('detail.confirm.deleteCacheBtn')}
                variant="danger"
                onCancel={() => setShowDeleteCacheConfirm(false)}
                onConfirm={() => {
                    if (video) {
                        deleteCacheMutation.mutate(video.source_id)
                        setShowDeleteCacheConfirm(false)
                    }
                }}
            />

            {/* Retranscribe Confirmation Modal */}
            <ConfirmModal
                isOpen={retranscribeConfirm}
                title={t('detail.confirm.retranscribeTitle')}
                message={t('detail.confirm.retranscribeMessage', { title: title })}
                variant="warning"
                confirmText={t('detail.confirm.retranscribeBtn')}
                cancelText={t('common.cancel')}
                onConfirm={handleRetranscribe}
                onCancel={() => setRetranscribeConfirm(false)}
            />
        </div>
    )
}

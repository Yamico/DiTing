import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Video } from '../api/types'
import { deleteVideo } from '../api'
import { archiveVideo } from '../api/client'
import Icons from './ui/Icons'
import ConfirmModal from './ConfirmModal'
import TagChip from './TagChip'
import VideoTagEditor from './VideoTagEditor'
import RetranscribeModal from './RetranscribeModal'
import { useEscapeKey } from '../hooks/useEscapeKey'

interface VideoCardProps {
    video: Video
    onRefresh: () => void
    onOpenPanel?: () => void
    selectionMode?: boolean
    selected?: boolean
    onToggleSelect?: (sourceId: string) => void
}

export default function VideoCard({ video, onRefresh, onOpenPanel, selectionMode = false, selected = false, onToggleSelect }: VideoCardProps) {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const [loading, setLoading] = useState(false)
    const [showMenu, setShowMenu] = useState(false)
    const [showTagEditor, setShowTagEditor] = useState(false)
    const [imageLoaded, setImageLoaded] = useState(false)
    const [deleteConfirm, setDeleteConfirm] = useState(false)
    const [showRetranscribeModal, setShowRetranscribeModal] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)

    useEscapeKey(() => setShowMenu(false), showMenu)

    useEffect(() => {
        if (showMenu) {
            const handleClickOutside = (event: MouseEvent) => {
                if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                    setShowMenu(false)
                }
            }
            document.addEventListener('mousedown', handleClickOutside)
            return () => {
                document.removeEventListener('mousedown', handleClickOutside)
            }
        }
    }, [showMenu])

    const handleCoverClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (selectionMode && onToggleSelect) {
            e.preventDefault()
            onToggleSelect(video.source_id)
        } else if (onOpenPanel) {
            onOpenPanel()
        } else {
            navigate(`/detail/${encodeURIComponent(video.source_id)}`)
        }
    }

    const handleBodyClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (selectionMode && onToggleSelect) {
            e.preventDefault()
            onToggleSelect(video.source_id)
        } else {
            navigate(`/detail/${encodeURIComponent(video.source_id)}`)
        }
    }

    const handleDelete = async () => {
        setLoading(true)
        setDeleteConfirm(false)
        try {
            await deleteVideo(video.source_id)
            onRefresh()
        } catch (e) {
            alert(t('videoCard.deleteFailed') + ': ' + (e as Error).message)
        } finally {
            setLoading(false)
        }
    }

    const handleArchive = async () => {
        const newArchivedState = !video.is_archived
        setLoading(true)
        setShowMenu(false)
        try {
            await archiveVideo(video.source_id, newArchivedState)
            onRefresh()
        } catch (e) {
            alert(t('common.error') + ': ' + (e as Error).message)
            setLoading(false)
        }
    }

    const canRetranscribe = video.media_available ||
        video.source_type === 'bilibili' ||
        video.source_type === 'youtube' ||
        video.source_type === 'douyin'

    // Source type badge configuration
    const sourceBadgeConfig: Record<string, { label: string; bg: string; color: string }> = {
        bilibili: { label: t('videoCard.source.bilibili'), bg: 'bg-pink-500/20', color: 'text-pink-400' },
        youtube: { label: t('videoCard.source.youtube'), bg: 'bg-red-600/20', color: 'text-red-400' },
        douyin: { label: t('videoCard.source.douyin'), bg: 'bg-cyan-500/20', color: 'text-cyan-400' },
        network: { label: t('videoCard.source.network'), bg: 'bg-orange-500/20', color: 'text-orange-400' },
        video: { label: t('videoCard.source.video'), bg: 'bg-blue-500/20', color: 'text-blue-400' },
        audio: { label: t('videoCard.source.audio'), bg: 'bg-purple-500/20', color: 'text-purple-400' },
        file: { label: t('videoCard.source.file'), bg: 'bg-gray-500/20', color: 'text-gray-400' },
    }

    // Get source badge config with fallback
    const badge = sourceBadgeConfig[video.source_type] ?? { label: t('videoCard.source.file'), bg: 'bg-gray-500/20', color: 'text-gray-400' }

    // Status overlay for processing/analyzing
    const renderStatusOverlay = () => {
        if ((video.count === 0 || video.count === undefined) && !video.media_available) {
            return (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-10 transition-opacity opacity-0 group-hover:opacity-100 backdrop-blur-sm">
                    <span className="px-4 py-2 bg-zinc-700/80 text-zinc-300 rounded-full font-medium text-sm flex items-center gap-2 border border-zinc-600">
                        <Icons.FileText className="w-4 h-4" />
                        {t('videoCard.noTranscription')}
                    </span>
                    <span className="text-zinc-400 text-xs mt-2">{t('videoCard.noTranscriptionDesc')}</span>
                </div>
            )
        }

        if (video.latest_status === 'processing' || video.latest_status === 'pending') {
            return (
                <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center z-10 rounded-t-xl">
                    <div className="animate-spin h-6 w-6 border-4 border-white border-t-transparent rounded-full mb-2" />
                    <span className="text-white text-sm">
                        {video.latest_status === 'processing' ? t('videoCard.processing') : t('videoCard.pending')}
                    </span>
                </div>
            )
        }
        if (video.is_analyzing_ai) {
            return (
                <div className="absolute inset-0 bg-purple-900/70 flex items-center justify-center z-10 rounded-t-xl gap-2">
                    <div className="animate-spin h-5 w-5 border-2 border-purple-300 border-t-transparent rounded-full" />
                    <span className="text-white text-sm font-medium">{t('videoCard.analyzing')}</span>
                </div>
            )
        }
        return null
    }

    // Format date to YYYY/M/D format
    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr)
        return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
    }



    return (
        <div
            className={`bg-[var(--color-card)] rounded-xl border overflow-hidden transition-all duration-200 group relative ${selected
                ? 'border-[var(--color-primary)] ring-1 ring-[var(--color-primary)] shadow-md'
                : 'border-[var(--color-border)] hover:shadow-lg hover:-translate-y-1 hover:border-[var(--color-primary)]'
                }`}
        >
            {/* Cover - opens popup panel */}
            <div
                className="h-[158px] overflow-hidden bg-black relative cursor-pointer"
                onClick={handleCoverClick}
                title={selectionMode ? t('dashboard.batch.select') : t('videoCard.viewPreview')}
            >
                {/* Selection Checkbox Overlay */}
                {(selectionMode || selected) && (
                    <div className="absolute top-2 left-2 z-20">
                        <div
                            className={`w-6 h-6 rounded border flex items-center justify-center transition-colors ${selected
                                ? 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white'
                                : 'bg-black/50 border-white/70 text-transparent hover:bg-black/70'
                                }`}
                        >
                            <Icons.Check className="w-4 h-4" />
                        </div>
                    </div>
                )}

                {/* Status Overlay */}
                {!selectionMode && renderStatusOverlay()}

                {/* Cover Image */}
                {/* Skeleton Loading */}
                {!imageLoaded && video.cover && (
                    <div className="absolute inset-0 bg-zinc-700 animate-pulse" />
                )}

                {video.cover ? (
                    <img
                        src={video.cover}
                        alt=""
                        className={`w-full h-full object-cover transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
                        onLoad={() => setImageLoaded(true)}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; setImageLoaded(true) }}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                        {video.source_type === 'audio' ? (
                            <Icons.Music className="w-12 h-12 text-zinc-500" />
                        ) : video.source_type === 'video' ? (
                            <Icons.Video className="w-12 h-12 text-zinc-500" />
                        ) : (
                            <Icons.Folder className="w-12 h-12 text-zinc-500" />
                        )}
                    </div>
                )}

                {/* Source Type Badge - Top Left (Hidden if selection mode active to show checkbox) */}
                {!selectionMode && !selected && (
                    <div className="absolute top-2.5 left-2.5">
                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wide ${badge.bg} ${badge.color} border border-current/30`}>
                            {badge.label}
                        </span>
                    </div>
                )}

                {/* Tags - Bottom Left on Cover */}
                {video.tags && video.tags.length > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 px-2.5 pb-2 pt-6 bg-gradient-to-t from-black/70 to-transparent flex flex-wrap gap-1 z-[5]">
                        {video.tags.slice(0, 3).map(tag => (
                            <TagChip key={tag.id} tag={tag} size="xs" />
                        ))}
                        {video.tags.length > 3 && (
                            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium text-white/70 bg-white/15 border border-white/20">
                                +{video.tags.length - 3}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Card Body - navigates to detail page (or selects) */}
            <div
                className="p-3 cursor-pointer"
                onClick={handleBodyClick}
                title={selectionMode ? t('dashboard.batch.select') : t('videoCard.enterDetail')}
            >
                {/* Title */}
                <div className="font-medium line-clamp-2 text-sm leading-snug min-h-[2.5rem]">
                    {video.title || video.source_id}
                </div>

                {/* Unified meta row: icon badges + date */}
                <div className="flex items-center gap-1 mt-2 text-[11px]">
                    {/* Icon-only badges */}
                    {video.media_available && (
                        <span
                            className="w-5 h-5 rounded flex items-center justify-center bg-blue-500/15 text-blue-400 border border-blue-500/25"
                            title={video.cache_count && video.cache_count > 1
                                ? `${video.cache_count} ${t('videoCard.cacheCount')}`
                                : t('videoCard.cached')}
                        >
                            <Icons.Download className="w-2.5 h-2.5" />
                        </span>
                    )}

                    {(video.count ?? 0) > 0 && (
                        <span
                            className="h-5 px-1.5 rounded flex items-center gap-0.5 bg-[var(--color-border)] text-[var(--color-text-muted)]"
                            title={t('videoCard.segments')}
                        >
                            <Icons.Layers className="w-2.5 h-2.5" />
                            {(video.count ?? 0) > 1 && <span>{video.count}</span>}
                        </span>
                    )}

                    {video.ai_count > 0 && (
                        <span
                            className="h-5 px-1.5 rounded flex items-center gap-0.5 bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                            title={t('videoCard.summary')}
                        >
                            <Icons.Sparkles className="w-2.5 h-2.5" />
                            {video.ai_count > 1 && <span>{video.ai_count}</span>}
                        </span>
                    )}

                    {(video.is_subtitle === 1 || video.is_subtitle === true) && (
                        <span
                            className="w-5 h-5 rounded flex items-center justify-center bg-pink-500/15 text-pink-400 border border-pink-500/25"
                            title={t('videoCard.subtitle')}
                        >
                            <Icons.FileText className="w-2.5 h-2.5" />
                        </span>
                    )}

                    {video.is_analyzing_ai && (
                        <span
                            className="h-5 px-1.5 rounded flex items-center gap-0.5 bg-sky-400/15 text-sky-400 border border-sky-400/25"
                        >
                            <Icons.Loader className="w-2.5 h-2.5 animate-spin" />
                            <span>{t('videoCard.analyzingShort')}</span>
                        </span>
                    )}

                    {/* Date pushed to end */}
                    <span className="ml-auto text-[var(--color-text-muted)]">
                        {formatDate(video.last_updated)}
                    </span>
                </div>
            </div>

            {/* Menu button */}
            <button
                onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu) }}
                className="absolute top-2 right-2 p-2 bg-black/60 backdrop-blur-sm text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 z-20 hover:bg-black/80"
                aria-label={t('videoCard.moreActions')}
            >
                <Icons.MoreHorizontal className="w-4 h-4" />
            </button>

            {/* Dropdown menu */}
            {/* Dropdown menu */}
            {showMenu && (
                <>
                    <div
                        ref={menuRef}
                        className="absolute top-12 right-2 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg shadow-xl py-1 z-30 min-w-[120px]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {canRetranscribe && (
                            <button
                                onClick={() => { setShowMenu(false); setShowRetranscribeModal(true) }}
                                disabled={loading}
                                className="w-full px-4 py-2 text-left text-sm hover:bg-[var(--color-border)] disabled:opacity-50 flex items-center gap-2"
                            >
                                <Icons.Refresh className="w-4 h-4" /> {t('videoCard.retranscribe')}
                            </button>
                        )}
                        <button
                            onClick={() => { setShowMenu(false); setShowTagEditor(true) }}
                            className="w-full px-4 py-2 text-left text-sm hover:bg-[var(--color-border)] flex items-center gap-2"
                        >
                            <Icons.Tags className="w-4 h-4" /> {t('tags.manage')}
                        </button>
                        <button
                            onClick={handleArchive}
                            className="w-full px-4 py-2 text-left text-sm hover:bg-[var(--color-border)] flex items-center gap-2"
                        >
                            {video.is_archived ? (
                                <>
                                    <Icons.ArchiveRestore className="w-4 h-4" /> {t('videoCard.unarchive')}
                                </>
                            ) : (
                                <>
                                    <Icons.Archive className="w-4 h-4" /> {t('videoCard.archive')}
                                </>
                            )}
                        </button>
                        <button
                            onClick={() => { setShowMenu(false); setDeleteConfirm(true) }}
                            disabled={loading}
                            className="w-full px-4 py-2 text-left text-sm hover:bg-[var(--color-border)] text-red-500 disabled:opacity-50 flex items-center gap-2"
                        >
                            <Icons.Trash className="w-4 h-4" /> {t('videoCard.delete')}
                        </button>
                    </div>
                </>
            )}
            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <ConfirmModal
                    isOpen={deleteConfirm}
                    title={t('videoCard.deleteTitle')}
                    message={t('videoCard.deleteConfirmMessage', { title: video.title })}
                    confirmText={t('common.delete')}
                    cancelText={t('common.cancel')}
                    variant="danger"
                    onConfirm={handleDelete}
                    onCancel={() => setDeleteConfirm(false)}
                />
            )}
            {/* Retranscribe Modal */}
            {showRetranscribeModal && (
                <RetranscribeModal
                    video={video}
                    onClose={() => setShowRetranscribeModal(false)}
                    onSuccess={() => { setShowRetranscribeModal(false); onRefresh() }}
                />
            )}
            {/* Tag Editor Modal */}
            {showTagEditor && (
                <VideoTagEditor
                    video={video}
                    onClose={() => setShowTagEditor(false)}
                />
            )}
        </div>
    )
}

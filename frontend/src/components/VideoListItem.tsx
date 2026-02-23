import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { Video } from '../api/types'
import Icons from './ui/Icons'
import TagChip from './TagChip'

interface VideoListItemProps {
    video: Video
    onRefresh: () => void
    onOpenPanel?: () => void
    selectionMode?: boolean
    selected?: boolean
    onToggleSelect?: (sourceId: string) => void
}

export default function VideoListItem({ video, onOpenPanel, selectionMode = false, selected = false, onToggleSelect }: VideoListItemProps) {
    const { t } = useTranslation()
    const navigate = useNavigate()

    const sourceBadgeConfig: Record<string, { label: string; bg: string; color: string }> = {
        bilibili: { label: t('videoCard.source.bilibili'), bg: 'bg-pink-500/20', color: 'text-pink-400' },
        youtube: { label: t('videoCard.source.youtube'), bg: 'bg-red-600/20', color: 'text-red-400' },
        douyin: { label: t('videoCard.source.douyin'), bg: 'bg-cyan-500/20', color: 'text-cyan-400' },
        network: { label: t('videoCard.source.network'), bg: 'bg-orange-500/20', color: 'text-orange-400' },
        video: { label: t('videoCard.source.video'), bg: 'bg-blue-500/20', color: 'text-blue-400' },
        audio: { label: t('videoCard.source.audio'), bg: 'bg-purple-500/20', color: 'text-purple-400' },
        file: { label: t('videoCard.source.file'), bg: 'bg-gray-500/20', color: 'text-gray-400' },
    }
    const badge = sourceBadgeConfig[video.source_type] ?? sourceBadgeConfig.file!

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr)
        return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
    }

    const segmentCount = video.count ?? video.segment_count ?? 0

    const handleItemClick = (e: React.MouseEvent) => {
        if (selectionMode && onToggleSelect) {
            e.stopPropagation()
            e.preventDefault()
            onToggleSelect(video.source_id)
        } else {
            navigate(`/detail/${encodeURIComponent(video.source_id)}`)
        }
    }

    return (
        <div
            className={`flex items-center gap-3 px-4 py-3 bg-[var(--color-card)] border rounded-lg transition-all duration-200 cursor-pointer group ${selected
                    ? 'border-[var(--color-primary)] ring-1 ring-[var(--color-primary)] shadow-sm'
                    : 'border-[var(--color-border)] hover:border-[var(--color-primary)] hover:shadow-md'
                }`}
            onClick={handleItemClick}
        >
            {/* Selection Checkbox (Visible in selection mode) */}
            {selectionMode && (
                <div
                    className={`flex-shrink-0 transition-colors ${selected ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'}`}
                >
                    {selected ? (
                        <Icons.CheckSquare className="w-5 h-5" />
                    ) : (
                        <Icons.Square className="w-5 h-5" />
                    )}
                </div>
            )}

            {/* Thumbnail */}
            <div
                className="w-16 h-11 rounded-md overflow-hidden bg-zinc-800 flex-shrink-0 relative"
                onClick={(e) => {
                    e.stopPropagation()
                    if (selectionMode && onToggleSelect) {
                        onToggleSelect(video.source_id)
                    } else if (onOpenPanel) {
                        onOpenPanel()
                    } else {
                        navigate(`/detail/${encodeURIComponent(video.source_id)}`)
                    }
                }}
            >
                {video.cover ? (
                    <img
                        src={video.cover}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        {video.source_type === 'audio' ? (
                            <Icons.Music className="w-5 h-5 text-zinc-500" />
                        ) : (
                            <Icons.Video className="w-5 h-5 text-zinc-500" />
                        )}
                    </div>
                )}

                {/* Processing overlay */}
                {(video.latest_status === 'processing' || video.latest_status === 'pending') && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    </div>
                )}
            </div>

            {/* Title + Source Badge */}
            <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate group-hover:text-[var(--color-primary)] transition-colors">
                    {video.title || video.source_id}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${badge.bg} ${badge.color}`}>
                        {badge.label}
                    </span>
                    {segmentCount > 0 && (
                        <span className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-0.5">
                            <Icons.Layers className="w-3 h-3" />
                            {segmentCount}
                        </span>
                    )}
                    {video.tags?.map(tag => (
                        <TagChip key={tag.id} tag={tag} size="xs" />
                    ))}
                </div>
            </div>

            {/* Meta Badges */}
            <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                {video.media_available && (
                    <span className="p-1 rounded bg-blue-500/15 text-blue-400" title={t('videoCard.localCache')}>
                        <Icons.Download className="w-3.5 h-3.5" />
                    </span>
                )}
                {video.ai_count > 0 && (
                    <span className="p-1 rounded bg-emerald-500/15 text-emerald-400" title={t('videoCard.summary')}>
                        <Icons.Sparkles className="w-3.5 h-3.5" />
                    </span>
                )}
                {(video.is_subtitle === 1 || video.is_subtitle === true) && (
                    <span className="p-1 rounded bg-pink-500/15 text-pink-400" title={t('videoCard.subtitle')}>
                        <Icons.FileText className="w-3.5 h-3.5" />
                    </span>
                )}
            </div>

            {/* Date */}
            <span className="text-xs text-[var(--color-text-muted)] flex-shrink-0 tabular-nums">
                {formatDate(video.last_updated)}
            </span>

            {/* Arrow indicator */}
            <Icons.ChevronRight className="w-4 h-4 text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
        </div>
    )
}

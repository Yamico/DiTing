import { useTranslation } from 'react-i18next'
import Icons from '../ui/Icons'
import { Tag } from '../../api/types'

export interface DashboardFilterBarProps {
    sourceType: string
    status: string
    selectedTagId?: number
    tagExclude: boolean
    hasSegments?: boolean
    hasAI?: boolean
    hasCached?: boolean
    isSubtitle?: boolean
    includeArchived: string | null
    tags?: Tag[]
    onUpdateFilter: (updates: Record<string, string | null>) => void
}

export default function DashboardFilterBar({
    sourceType,
    status,
    selectedTagId,
    tagExclude,
    hasSegments,
    hasAI,
    hasCached,
    isSubtitle,
    includeArchived,
    tags,
    onUpdateFilter
}: DashboardFilterBarProps) {
    const { t } = useTranslation()

    const toggleFilter = (key: 'segments' | 'ai' | 'cached' | 'subtitle' | 'archived') => {
        if (key === 'archived') {
            const nextVal = includeArchived === null ? '1' : includeArchived === '1' ? 'all' : null
            onUpdateFilter({ archived: nextVal })
            return
        }

        const currentVal = key === 'segments' ? hasSegments : key === 'ai' ? hasAI : key === 'cached' ? hasCached : isSubtitle
        const nextVal = currentVal === undefined ? '1' : currentVal === true ? '0' : null
        onUpdateFilter({ [key]: nextVal })
    }

    return (
        <div className="space-y-3">
            {/* Source Tabs */}
            <div className="flex flex-wrap gap-2 items-center">
                {['', 'bilibili', 'youtube', 'douyin', 'network', 'file'].map((type) => (
                    <button
                        key={type}
                        onClick={() => onUpdateFilter({ source: type || null })}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${sourceType === type
                            ? 'bg-[var(--color-primary)] text-white'
                            : 'bg-[var(--color-card)] text-[var(--color-text-muted)] hover:bg-[var(--color-border)]'
                            }`}
                    >
                        {type === '' ? t('dashboard.sourceType.all') : t(`dashboard.sourceType.${type}`)}
                    </button>
                ))}
            </div>

            {/* Status, Tag, Quick Attributes */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Left: Tag Management & Chips */}
                <div className="flex flex-wrap items-center gap-2">
                    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${selectedTagId && tagExclude
                        ? 'bg-red-500/10 border-red-500/25'
                        : selectedTagId
                            ? 'bg-[var(--color-primary)]/10 border-[var(--color-primary)]/25'
                            : 'bg-[var(--color-card)] border-[var(--color-border)]'
                        }`}>
                        <Icons.Tags className="w-4 h-4 text-[var(--color-text-muted)]" />
                        <select
                            value={selectedTagId || ''}
                            onChange={(e) => onUpdateFilter({ tag: e.target.value || null, tag_exclude: null })}
                            className="bg-transparent border-none p-0 pr-1 focus:ring-0 text-[var(--color-text)] cursor-pointer max-w-[120px] [&>option]:bg-[var(--color-card)] [&>option]:text-[var(--color-text)]"
                        >
                            <option value="">{t('tags.allTags')}</option>
                            {tags?.map(tag => (
                                <option key={tag.id} value={tag.id}>{tag.name}</option>
                            ))}
                        </select>
                        {selectedTagId && (
                            <button
                                onClick={() => onUpdateFilter({ tag_exclude: tagExclude ? null : '1' })}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors leading-none ${tagExclude
                                    ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
                                    : 'bg-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-primary)]/20 hover:text-[var(--color-primary)]'
                                    }`}
                                title={tagExclude ? t('dashboard.filters.tagInclude') : t('dashboard.filters.tagExclude')}
                            >
                                {tagExclude ? t('dashboard.filters.excludeLabel') : t('dashboard.filters.includeLabel')}
                            </button>
                        )}
                    </div>

                    <div className="h-6 w-px bg-[var(--color-border)] hidden md:block mx-1" />

                    {/* Quick Filter Chips */}
                    <button
                        onClick={() => toggleFilter('segments')}
                        className={`px-3 py-1.5 text-xs rounded-full border transition-all flex items-center gap-1.5 ${hasSegments === true
                            ? 'bg-purple-500/15 border-purple-500/30 text-purple-500'
                            : hasSegments === false
                                ? 'bg-red-500/10 border-red-500/20 text-red-500'
                                : 'bg-[var(--color-card)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-text-muted)]'
                            }`}
                    >
                        <Icons.MessageSquare className="w-3 h-3" />
                        {hasSegments === false ? t('dashboard.filters.noSegments') : t('dashboard.filters.hasSegments')}
                    </button>
                    <button
                        onClick={() => toggleFilter('ai')}
                        className={`px-3 py-1.5 text-xs rounded-full border transition-all flex items-center gap-1.5 ${hasAI === true
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-500'
                            : hasAI === false
                                ? 'bg-red-500/10 border-red-500/20 text-red-500'
                                : 'bg-[var(--color-card)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-text-muted)]'
                            }`}
                    >
                        <Icons.Sparkles className="w-3 h-3" />
                        {hasAI === false ? t('dashboard.filters.noAI') : t('dashboard.filters.hasAI')}
                    </button>
                    <button
                        onClick={() => toggleFilter('cached')}
                        className={`px-3 py-1.5 text-xs rounded-full border transition-all flex items-center gap-1.5 ${hasCached === true
                            ? 'bg-blue-500/15 border-blue-500/30 text-blue-500'
                            : hasCached === false
                                ? 'bg-red-500/10 border-red-500/20 text-red-500'
                                : 'bg-[var(--color-card)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-text-muted)]'
                            }`}
                    >
                        <Icons.Download className="w-3 h-3" />
                        {hasCached === false ? t('dashboard.filters.noCached') : t('dashboard.filters.hasCached')}
                    </button>
                    <button
                        onClick={() => toggleFilter('subtitle')}
                        className={`px-3 py-1.5 text-xs rounded-full border transition-all flex items-center gap-1.5 ${isSubtitle === true
                            ? 'bg-pink-500/15 border-pink-500/30 text-pink-500'
                            : isSubtitle === false
                                ? 'bg-red-500/10 border-red-500/20 text-red-500'
                                : 'bg-[var(--color-card)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-text-muted)]'
                            }`}
                        title={t('dashboard.filters.isSubtitle')}
                    >
                        <Icons.FileText className="w-3 h-3" />
                        <span>
                            {isSubtitle === true ? t('dashboard.filters.isSubtitle') : isSubtitle === false ? t('dashboard.filters.noSubtitle') : t('dashboard.filters.isSubtitle')}
                        </span>
                    </button>

                    {/* Archive Toggle Filter */}
                    <button
                        onClick={() => toggleFilter('archived')}
                        className={`px-3 py-1.5 text-xs rounded-full border transition-all flex items-center gap-1.5 ${includeArchived === '1'
                            ? 'bg-amber-500/15 border-amber-500/30 text-amber-500'
                            : includeArchived === 'all'
                                ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-500'
                                : 'bg-[var(--color-card)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-text-muted)]'
                            }`}
                        title={t('dashboard.filters.showArchived')}
                    >
                        <Icons.Archive className="w-3 h-3" />
                        <span>
                            {includeArchived === '1' ? t('dashboard.filters.showArchived') : includeArchived === 'all' ? t('dashboard.filters.allArchived') : t('dashboard.filters.hideArchived')}
                        </span>
                    </button>
                </div>

                {/* Right: Status */}
                <div className="flex items-center">
                    <select
                        value={status}
                        onChange={(e) => onUpdateFilter({ status: e.target.value || null })}
                        className="px-3 py-1.5 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)] [&>option]:bg-[var(--color-card)] [&>option]:text-[var(--color-text)] cursor-pointer"
                    >
                        <option value="">{t('dashboard.status.all')}</option>
                        <option value="no_content">{t('dashboard.status.no_content')}</option>
                        <option value="cached_only">{t('dashboard.status.cached_only')}</option>
                        <option value="completed">{t('dashboard.status.completed')}</option>
                        <option value="processing">{t('dashboard.status.processing')}</option>
                        <option value="pending">{t('dashboard.status.pending')}</option>
                        <option value="failed">{t('dashboard.status.failed')}</option>
                    </select>
                </div>
            </div>
        </div>
    )
}

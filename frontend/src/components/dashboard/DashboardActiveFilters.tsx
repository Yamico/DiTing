import { useTranslation } from 'react-i18next'
import Icons from '../ui/Icons'
import { Tag } from '../../api/types'

export interface DashboardActiveFiltersProps {
    sourceType: string
    status: string
    selectedTagId?: number
    tagExclude: boolean
    hasSegments?: boolean
    hasAI?: boolean
    hasCached?: boolean
    isSubtitle?: boolean
    includeArchived: string | null
    searchQuery: string
    tags?: Tag[]
    onUpdateFilter: (updates: Record<string, string | null>) => void
    onUpdateParams: (updates: Record<string, string | null>) => void
}

export default function DashboardActiveFilters({
    sourceType,
    status,
    selectedTagId,
    tagExclude,
    hasSegments,
    hasAI,
    hasCached,
    isSubtitle,
    includeArchived,
    searchQuery,
    tags,
    onUpdateFilter,
    onUpdateParams
}: DashboardActiveFiltersProps) {
    const { t } = useTranslation()

    if (!(sourceType || status || selectedTagId || hasSegments !== undefined || hasAI !== undefined || hasCached !== undefined || isSubtitle !== undefined || includeArchived !== null || searchQuery)) {
        return null
    }

    return (
        <div className="flex flex-wrap items-center gap-2 pt-1 animate-in fade-in">
            <span className="text-xs font-medium text-[var(--color-text-muted)] mr-1">
                {t('dashboard.filters.activeFilters')}
            </span>

            {sourceType && (
                <div className="flex items-center gap-1 px-2 py-0.5 bg-[var(--color-card)] border border-[var(--color-border)] rounded-md text-xs">
                    <span>{t(sourceType === '' ? 'dashboard.sourceType.all' : `dashboard.sourceType.${sourceType}`)}</span>
                    <button onClick={() => onUpdateFilter({ source: null })} className="p-0.5 hover:text-red-500 rounded"><Icons.X className="w-3 h-3" /></button>
                </div>
            )}

            {status && (
                <div className="flex items-center gap-1 px-2 py-0.5 bg-[var(--color-card)] border border-[var(--color-border)] rounded-md text-xs">
                    <span>{t(status === '' ? 'dashboard.status.all' : `dashboard.status.${status}`)}</span>
                    <button onClick={() => onUpdateFilter({ status: null })} className="p-0.5 hover:text-red-500 rounded"><Icons.X className="w-3 h-3" /></button>
                </div>
            )}

            {selectedTagId && tags && (
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border ${tagExclude
                    ? 'bg-red-500/10 border-red-500/20 text-red-600'
                    : 'bg-[var(--color-card)] border-[var(--color-border)]'
                    }`}>
                    <Icons.Tags className="w-3 h-3" />
                    <span>{tagExclude ? `≠ ` : ''}{tags.find(tag => tag.id === selectedTagId)?.name || ''}</span>
                    <button onClick={() => onUpdateFilter({ tag: null, tag_exclude: null })} className="p-0.5 hover:text-red-500 rounded"><Icons.X className="w-3 h-3" /></button>
                </div>
            )}

            {hasSegments !== undefined && (
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border ${hasSegments
                    ? 'bg-purple-500/10 border-purple-500/20 text-purple-600'
                    : 'bg-red-500/10 border-red-500/20 text-red-600'
                    }`}>
                    <Icons.MessageSquare className="w-3 h-3" />
                    <span>{hasSegments === false ? t('dashboard.filters.noSegments') : t('dashboard.filters.hasSegments')}</span>
                    <button onClick={() => onUpdateFilter({ segments: null })} className="p-0.5 hover:text-red-500 rounded"><Icons.X className="w-3 h-3" /></button>
                </div>
            )}

            {hasAI !== undefined && (
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border ${hasAI
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600'
                    : 'bg-red-500/10 border-red-500/20 text-red-600'
                    }`}>
                    <Icons.Sparkles className="w-3 h-3" />
                    <span>{hasAI === false ? t('dashboard.filters.noAI') : t('dashboard.filters.hasAI')}</span>
                    <button onClick={() => onUpdateFilter({ ai: null })} className="p-0.5 hover:text-red-500 rounded"><Icons.X className="w-3 h-3" /></button>
                </div>
            )}

            {hasCached !== undefined && (
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border ${hasCached
                    ? 'bg-blue-500/10 border-blue-500/20 text-blue-600'
                    : 'bg-red-500/10 border-red-500/20 text-red-600'
                    }`}>
                    <Icons.Download className="w-3 h-3" />
                    <span>{hasCached === false ? t('dashboard.filters.noCached') : t('dashboard.filters.hasCached')}</span>
                    <button onClick={() => onUpdateFilter({ cached: null })} className="p-0.5 hover:text-red-500 rounded"><Icons.X className="w-3 h-3" /></button>
                </div>
            )}

            {isSubtitle !== undefined && (
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border ${isSubtitle
                    ? 'bg-pink-500/10 border-pink-500/20 text-pink-600'
                    : 'bg-red-500/10 border-red-500/20 text-red-600'
                    }`}>
                    <Icons.FileText className="w-3 h-3" />
                    <span>{isSubtitle === false ? t('dashboard.filters.noSubtitle') : t('dashboard.filters.isSubtitle')}</span>
                    <button onClick={() => onUpdateFilter({ subtitle: null })} className="p-0.5 hover:text-red-500 rounded"><Icons.X className="w-3 h-3" /></button>
                </div>
            )}

            {includeArchived !== null && (
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border ${includeArchived === '1'
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-600'
                    : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-600'
                    }`}>
                    <Icons.Archive className="w-3 h-3" />
                    <span>{includeArchived === '1' ? t('dashboard.filters.showArchived') : t('dashboard.filters.allArchived')}</span>
                    <button onClick={() => onUpdateFilter({ archived: null })} className="p-0.5 hover:text-red-500 rounded"><Icons.X className="w-3 h-3" /></button>
                </div>
            )}

            {searchQuery && (
                <div className="flex items-center gap-1 px-2 py-0.5 bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-[var(--color-primary)] rounded-md text-xs">
                    <Icons.Search className="w-3 h-3" />
                    <span>{t('dashboard.filters.searchText')}: {searchQuery}</span>
                    <button onClick={() => onUpdateParams({ q: null, page: '1' })} className="p-0.5 hover:text-red-500 rounded"><Icons.X className="w-3 h-3" /></button>
                </div>
            )}

            <button
                onClick={() => onUpdateFilter({ source: null, status: null, tag: null, tag_exclude: null, segments: null, ai: null, cached: null, subtitle: null, archived: null, q: null })}
                className="text-xs text-[var(--color-text-muted)] hover:text-red-500 transition-colors ml-2"
            >
                {t('dashboard.filters.clearAll')}
            </button>
        </div>
    )
}

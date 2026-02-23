import { useTranslation } from 'react-i18next'
import Icons from '../ui/Icons'

export interface DashboardDisplayToolbarProps {
    sortBy: string
    limit: number
    viewMode: 'grid' | 'list'
    selectionMode: boolean
    onUpdateParams: (updates: Record<string, string | null>) => void
    onUpdateFilter: (updates: Record<string, string | null>) => void
    onToggleSelectionMode: () => void
    onShowTagManager: () => void
}

export default function DashboardDisplayToolbar({
    sortBy,
    limit,
    viewMode,
    selectionMode,
    onUpdateParams,
    onUpdateFilter,
    onToggleSelectionMode,
    onShowTagManager
}: DashboardDisplayToolbarProps) {
    const { t } = useTranslation()

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[var(--color-border)]">
            {/* Left: Management actions */}
            <div className="flex items-center gap-2">
                <button
                    onClick={onToggleSelectionMode}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors flex items-center gap-2 border ${selectionMode
                        ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                        : 'bg-[var(--color-card)] border-[var(--color-border)] hover:bg-[var(--color-border)]'
                        }`}
                    title={t('dashboard.batch.select')}
                >
                    {selectionMode ? <Icons.CheckSquare className="w-4 h-4" /> : <Icons.Square className="w-4 h-4" />}
                    <span className="hidden sm:inline">{selectionMode ? t('dashboard.batch.cancel') : t('dashboard.batch.select')}</span>
                </button>
                <button
                    onClick={onShowTagManager}
                    className="px-3 py-1.5 bg-[var(--color-card)] border border-[var(--color-border)] hover:bg-[var(--color-border)] rounded-lg text-sm transition-colors flex items-center gap-2"
                    title={t('tags.manage')}
                >
                    <Icons.Tags className="w-4 h-4" />
                    <span className="hidden sm:inline">{t('tags.manage')}</span>
                </button>
            </div>

            {/* Right: Display controls */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                    <Icons.ArrowUpDown className="w-4 h-4" />
                    <select
                        value={sortBy}
                        onChange={(e) => onUpdateParams({ sort: e.target.value })}
                        className="bg-transparent border-none p-0 pr-2 focus:ring-0 text-[var(--color-text)] font-medium cursor-pointer [&>option]:bg-[var(--color-card)] [&>option]:text-[var(--color-text)]"
                    >
                        <option value="time">{t('dashboard.filters.sortTime')}</option>
                        <option value="title">{t('dashboard.filters.sortTitle')}</option>
                        <option value="segments">{t('dashboard.filters.sortSegments')}</option>
                    </select>
                </div>

                <div className="h-4 w-px bg-[var(--color-border)] hidden sm:block" />

                <select
                    value={limit}
                    onChange={(e) => onUpdateFilter({ limit: e.target.value })}
                    className="bg-transparent border-none p-0 focus:ring-0 text-[var(--color-text)] text-sm font-medium cursor-pointer [&>option]:bg-[var(--color-card)] [&>option]:text-[var(--color-text)]"
                >
                    {[10, 20, 40, 60, 90, 100].map((n) => (
                        <option key={n} value={n}>{t('dashboard.display.perPage', { count: n })}</option>
                    ))}
                </select>

                <div className="h-4 w-px bg-[var(--color-border)] hidden sm:block" />

                {/* View Toggle */}
                <div className="flex bg-[var(--color-card)] p-1 rounded-lg border border-[var(--color-border)]">
                    <button
                        onClick={() => onUpdateParams({ view: 'grid' })}
                        className={`p-1.5 rounded-md transition-all ${viewMode === 'grid'
                            ? 'bg-[var(--color-bg)] text-[var(--color-text)] shadow-sm'
                            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                            }`}
                        title={t('dashboard.view.grid')}
                    >
                        <Icons.LayoutDashboard className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => onUpdateParams({ view: 'list' })}
                        className={`p-1.5 rounded-md transition-all ${viewMode === 'list'
                            ? 'bg-[var(--color-bg)] text-[var(--color-text)] shadow-sm'
                            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                            }`}
                        title={t('dashboard.view.list')}
                    >
                        <Icons.List className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    )
}

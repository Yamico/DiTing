import { useTranslation } from 'react-i18next'

export interface DashboardSelectionToolbarProps {
    selectedCount: number
    onSelectAll: () => void
    onDeselectAll: () => void
}

export default function DashboardSelectionToolbar({
    selectedCount,
    onSelectAll,
    onDeselectAll
}: DashboardSelectionToolbarProps) {
    const { t } = useTranslation()

    return (
        <div className="flex items-center gap-3 bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 px-4 py-2 rounded-lg animate-in fade-in slide-in-from-top-2">
            <span className="text-sm font-medium text-[var(--color-primary)] mr-2">
                {t('dashboard.batch.selected', { count: selectedCount })}
            </span>

            <div className="h-4 w-px bg-[var(--color-primary)]/20" />

            <button
                onClick={onSelectAll}
                className="text-sm hover:text-[var(--color-primary)] transition-colors"
            >
                {t('dashboard.batch.selectAll')}
            </button>
            <button
                onClick={onDeselectAll}
                className="text-sm hover:text-[var(--color-primary)] transition-colors"
            >
                {t('dashboard.batch.deselectAll')}
            </button>
        </div>
    )
}

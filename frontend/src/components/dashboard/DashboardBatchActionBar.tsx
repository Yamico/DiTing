import { useTranslation } from 'react-i18next'
import Icons from '../ui/Icons'

export interface DashboardBatchActionBarProps {
    selectedCount: number
    includeArchived: string | null
    onShowBatchTagEditor: () => void
    onShowBatchDeleteConfirm: () => void
    onBatchArchive: (archived: boolean) => void
    onCancelSelection: () => void
}

export default function DashboardBatchActionBar({
    selectedCount,
    includeArchived,
    onShowBatchTagEditor,
    onShowBatchDeleteConfirm,
    onBatchArchive,
    onCancelSelection
}: DashboardBatchActionBarProps) {
    const { t } = useTranslation()

    if (selectedCount === 0) return null

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[var(--color-bg)]/80 backdrop-blur-md border border-[var(--color-border)] shadow-2xl rounded-2xl px-6 py-3 flex items-center gap-4 animate-in slide-in-from-bottom-6">
            <span className="font-semibold text-sm whitespace-nowrap">
                {t('dashboard.batch.selected', { count: selectedCount })}
            </span>

            <div className="h-6 w-px bg-[var(--color-border)]" />

            <button
                onClick={onShowBatchTagEditor}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-[var(--color-bg-secondary)] transition-colors text-sm font-medium"
            >
                <Icons.Tags className="w-4 h-4" />
                {t('dashboard.batch.tag')}
            </button>

            <button
                onClick={onShowBatchDeleteConfirm}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-600 hover:bg-red-500/20 transition-colors text-sm font-medium"
            >
                <Icons.Trash className="w-4 h-4" />
                {t('dashboard.batch.delete')}
            </button>

            <button
                onClick={() => onBatchArchive(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 transition-colors text-sm font-medium"
            >
                <Icons.Archive className="w-4 h-4" />
                {t('dashboard.batch.archive')}
            </button>

            {includeArchived !== null && (
                <button
                    onClick={() => onBatchArchive(false)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 hover:bg-indigo-500/20 transition-colors text-sm font-medium"
                >
                    <Icons.ArchiveRestore className="w-4 h-4" />
                    {t('dashboard.batch.unarchive')}
                </button>
            )}

            <button
                onClick={onCancelSelection}
                className="ml-2 p-1.5 rounded-full hover:bg-[var(--color-border)] text-[var(--color-text-muted)]"
                title={t('dashboard.batch.cancel')}
            >
                <Icons.X className="w-4 h-4" />
            </button>
        </div>
    )
}

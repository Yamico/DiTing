import { useTranslation } from 'react-i18next'

export interface PaginationProps {
    page: number
    totalPages: number
    total?: number
    onPageChange: (page: number) => void
}

export default function Pagination({ page, totalPages, total, onPageChange }: PaginationProps) {
    const { t } = useTranslation()

    if (totalPages <= 1) return null

    return (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8 p-4 bg-[var(--color-card)] rounded-xl border border-[var(--color-border)]">
            {/* Total Info */}
            <span className="text-sm text-[var(--color-text-muted)]">
                {t('dashboard.pagination.total', { count: total ?? 0 })}
            </span>

            {/* Page Numbers */}
            <div className="flex items-center gap-1">
                {/* First & Prev */}
                <button
                    onClick={() => onPageChange(1)}
                    disabled={page === 1}
                    className="px-2 py-1.5 text-sm bg-[var(--color-border)] hover:bg-[var(--color-border)]/80 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title={t('dashboard.pagination.first')}
                >
                    «
                </button>
                <button
                    onClick={() => onPageChange(Math.max(1, page - 1))}
                    disabled={page === 1}
                    className="px-2 py-1.5 text-sm bg-[var(--color-border)] hover:bg-[var(--color-border)]/80 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title={t('dashboard.pagination.prev')}
                >
                    ‹
                </button>

                {/* Page Number Buttons */}
                {(() => {
                    const pages: (number | string)[] = []
                    if (totalPages <= 7) {
                        for (let i = 1; i <= totalPages; i++) pages.push(i)
                    } else {
                        pages.push(1)
                        if (page > 3) pages.push('...')
                        for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
                            pages.push(i)
                        }
                        if (page < totalPages - 2) pages.push('...')
                        pages.push(totalPages)
                    }
                    return pages.map((p, idx) =>
                        typeof p === 'number' ? (
                            <button
                                key={p}
                                onClick={() => onPageChange(p)}
                                className={`w-8 h-8 text-sm rounded transition-colors ${p === page
                                    ? 'bg-indigo-600 text-white font-medium'
                                    : 'bg-[var(--color-border)] hover:bg-indigo-500/20 text-[var(--color-text)]'
                                    }`}
                            >
                                {p}
                            </button>
                        ) : (
                            <span key={`ellipsis-${idx}`} className="px-1 text-[var(--color-text-muted)]">…</span>
                        )
                    )
                })()}

                {/* Next & Last */}
                <button
                    onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                    disabled={page === totalPages}
                    className="px-2 py-1.5 text-sm bg-[var(--color-border)] hover:bg-[var(--color-border)]/80 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title={t('dashboard.pagination.next')}
                >
                    ›
                </button>
                <button
                    onClick={() => onPageChange(totalPages)}
                    disabled={page === totalPages}
                    className="px-2 py-1.5 text-sm bg-[var(--color-border)] hover:bg-[var(--color-border)]/80 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    title={t('dashboard.pagination.last')}
                >
                    »
                </button>
            </div>

            {/* Jump to Page */}
            <div className="flex items-center gap-2 text-sm">
                <span className="text-[var(--color-text-muted)]">{t('dashboard.pagination.jump')}</span>
                <input
                    type="number"
                    min={1}
                    max={totalPages}
                    className="w-14 px-2 py-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded text-center text-sm"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            const val = parseInt((e.target as HTMLInputElement).value)
                            if (val >= 1 && val <= totalPages) {
                                onPageChange(val)
                            }
                        }
                    }}
                />
                <span className="text-[var(--color-text-muted)]">{t('dashboard.pagination.page')}</span>
            </div>
        </div>
    )
}

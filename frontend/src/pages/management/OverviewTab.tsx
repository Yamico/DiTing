import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import Icons from '../../components/ui/Icons'
import { getMediaStats } from '../../api/client'
import { formatBytes } from './utils'

export default function OverviewTab() {
    const { t } = useTranslation()
    const { data: stats, isLoading: loading } = useQuery({
        queryKey: ['media-stats'],
        queryFn: getMediaStats,
        refetchInterval: 10000
    })

    if (loading && !stats) {
        return (
            <div className="flex justify-center py-20">
                <Icons.Loader className="w-8 h-8 animate-spin text-indigo-500" />
            </div>
        )
    }

    if (!stats) return null

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-[var(--color-card)] p-6 rounded-xl border border-[var(--color-border)] shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-500/10 text-blue-500 rounded-lg">
                        <Icons.HardDrive className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm text-[var(--color-text-muted)]">{t('management.overview.totalSize')}</p>
                        <p className="text-2xl font-bold">{formatBytes(stats.total_size_bytes)}</p>
                    </div>
                </div>
            </div>
            <div className="bg-[var(--color-card)] p-6 rounded-xl border border-[var(--color-border)] shadow-sm">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-purple-500/10 text-purple-500 rounded-lg">
                        <Icons.FileVideo className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm text-[var(--color-text-muted)]">{t('management.overview.cachedFiles')}</p>
                        <p className="text-2xl font-bold">{stats.file_count}</p>
                    </div>
                </div>
            </div>

            {/* Quality Distribution */}
            <div className="col-span-1 md:col-span-3 bg-[var(--color-card)] p-6 rounded-xl border border-[var(--color-border)] shadow-sm">
                <h3 className="text-lg font-semibold mb-4">{t('management.overview.qualityDistribution')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {stats.by_quality.map(q => (
                        <div key={q.quality} className="flex items-center justify-between p-4 bg-[var(--color-bg)] rounded-lg">
                            {q.quality}
                            <div className="text-right">
                                <div className="font-bold">{q.count} {t('management.overview.files')}</div>
                                <div className="text-xs text-[var(--color-text-muted)]">{formatBytes(q.size)}</div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

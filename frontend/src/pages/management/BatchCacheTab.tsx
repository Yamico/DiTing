import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Icons from '../../components/ui/Icons'
import { batchCache } from '../../api/client'
import { useToast } from '../../contexts/ToastContext'


export default function BatchCacheTab() {
    const queryClient = useQueryClient()
    const { t } = useTranslation()
    const { showToast } = useToast()
    const [batchUrls, setBatchUrls] = useState('')
    const [batchQuality, setBatchQuality] = useState('best')
    const [batchResults, setBatchResults] = useState<any[]>([])

    const batchMutation = useMutation({
        mutationFn: async () => {
            const urlList = batchUrls.split('\n').map(u => u.trim()).filter(u => u)
            if (urlList.length === 0) throw new Error('No URLs provided')
            return await batchCache(urlList, batchQuality)
        },
        onSuccess: (res) => {
            setBatchResults(res.results)
            showToast('success', t('management.batch.toast.queued', { count: res.results.length }))
            setBatchUrls('')
            // Invalidate stats as they might change with new tasks
            queryClient.invalidateQueries({ queryKey: ['media-stats'] })
            queryClient.invalidateQueries({ queryKey: ['cache-entries'] })
        },
        onError: (error) => {
            console.error(error)
            showToast('error', t('common.error'))
        }
    })

    const handleBatchCache = () => {
        if (!batchUrls.trim()) return
        batchMutation.mutate()
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-2 space-y-6">
                <div className="bg-[var(--color-card)] p-6 rounded-xl border border-[var(--color-border)] shadow-sm">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Icons.Plus className="w-5 h-5 text-indigo-500" />
                        {t('management.batch.title')}
                    </h3>
                    <div className="mb-4">
                        <label className="block text-sm font-medium mb-2">{t('management.batch.urlLabel')}</label>
                        <textarea
                            className="w-full h-64 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-4 font-mono text-sm leading-relaxed"
                            placeholder={t('management.batch.placeholder')}
                            value={batchUrls}
                            onChange={e => setBatchUrls(e.target.value)}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <label className="text-sm font-medium">{t('management.batch.qualityLabel')}</label>
                            <select
                                value={batchQuality}
                                onChange={e => setBatchQuality(e.target.value)}
                                className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-3 py-2 text-sm"
                            >
                                <option value="best">Best Video + Audio</option>
                                <option value="medium">Medium (720p)</option>
                                <option value="audio">Audio Only</option>
                                <option value="worst">Worst Quality</option>
                            </select>
                        </div>
                        <button
                            onClick={handleBatchCache}
                            disabled={batchMutation.isPending || !batchUrls.trim()}
                            className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            {batchMutation.isPending ? <Icons.Loader className="w-4 h-4 animate-spin" /> : <Icons.Download className="w-4 h-4" />}
                            {t('management.batch.startBtn')}
                        </button>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                <div className="bg-[var(--color-card)] p-6 rounded-xl border border-[var(--color-border)] shadow-sm">
                    <h3 className="text-lg font-semibold mb-4">{t('management.batch.instructions.title')}</h3>
                    <ul className="space-y-3 text-sm text-[var(--color-text-muted)] list-disc pl-4">
                        {(t('management.batch.instructions.items', { returnObjects: true }) as string[]).map((item, i) => (
                            <li key={i}>{item}</li>
                        ))}
                    </ul>
                </div>

                {batchResults.length > 0 && (
                    <div className="bg-[var(--color-card)] p-6 rounded-xl border border-[var(--color-border)] shadow-sm">
                        <h3 className="text-lg font-semibold mb-4">{t('management.batch.queue.title')}</h3>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                            {batchResults.map((res, i) => (
                                <div key={i} className="flex items-center justify-between text-sm p-2 bg-[var(--color-bg)] rounded border border-[var(--color-border)]">
                                    <span className="truncate max-w-[150px]" title={res.url}>{res.url}</span>
                                    <span className="text-green-500 font-medium text-xs">{t('management.batch.queue.queued')}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}

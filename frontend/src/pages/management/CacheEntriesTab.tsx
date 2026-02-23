import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Icons from '../../components/ui/Icons'
import { getCacheEntries, deleteCacheEntry } from '../../api/client'
import type { CacheEntry } from '../../api/types'
import { useToast } from '../../contexts/ToastContext'
import { formatBytes } from './utils'
import ConfirmModal from '../../components/ConfirmModal'

export default function CacheEntriesTab() {
    const queryClient = useQueryClient()
    const { t } = useTranslation()
    const { showToast } = useToast()
    const [sortConfig, setSortConfig] = useState<{ key: keyof CacheEntry | 'expires_at', direction: 'asc' | 'desc' } | null>(null)

    const { data, isLoading: loading } = useQuery({
        queryKey: ['cache-entries'],
        queryFn: getCacheEntries,
        refetchInterval: 10000
    })

    const entries = data?.entries || []

    const deleteMutation = useMutation({
        mutationFn: ({ sourceId, quality }: { sourceId: string, quality: string }) => deleteCacheEntry(sourceId, quality),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['cache-entries'] })
            queryClient.invalidateQueries({ queryKey: ['media-stats'] }) // Update stats too
            showToast('success', t('common.success'))
        },
        onError: (error) => {
            console.error(error)
            showToast('error', t('common.error'))
        }
    })

    const [pendingDelete, setPendingDelete] = useState<{ sourceId: string, quality: string } | null>(null)

    const handleDelete = () => {
        if (!pendingDelete) return
        deleteMutation.mutate(pendingDelete)
        setPendingDelete(null)
    }

    const handleSort = (key: keyof CacheEntry | 'expires_at') => {
        setSortConfig(current => {
            if (current?.key === key) {
                return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
            }
            return { key, direction: 'asc' }
        })
    }

    const sortedEntries = [...entries].sort((a, b) => {
        if (!sortConfig) return 0
        const { key, direction } = sortConfig

        let valA: any = a[key as keyof CacheEntry]
        let valB: any = b[key as keyof CacheEntry]

        if (key === 'expires_at') {
            const dateA = a.expires_at ? new Date(a.expires_at).getTime() : Infinity
            const dateB = b.expires_at ? new Date(b.expires_at).getTime() : Infinity
            valA = dateA
            valB = dateB
        } else if (key === 'video_title') {
            valA = (a.video_title || a.source_id).toLowerCase()
            valB = (b.video_title || b.source_id).toLowerCase()
        } else if (key === 'cached_at') {
            valA = new Date(a.cached_at).getTime()
            valB = new Date(b.cached_at).getTime()
        }

        if (valA < valB) return direction === 'asc' ? -1 : 1
        if (valA > valB) return direction === 'asc' ? 1 : -1
        return 0
    })

    if (loading && entries.length === 0) {
        return (
            <div className="flex justify-center py-20">
                <Icons.Loader className="w-8 h-8 animate-spin text-indigo-500" />
            </div>
        )
    }

    return (
        <div className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] shadow-sm overflow-hidden">
            <div className="p-4 border-b border-[var(--color-border)] flex justify-between items-center">
                <h3 className="font-semibold">{t('management.entries.title')}</h3>
                <span className="text-sm text-[var(--color-text-muted)]">{t('management.entries.items', { count: entries.length })}</span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="bg-[var(--color-bg)] text-[var(--color-text-muted)] uppercase text-xs">
                        <tr>
                            <th
                                className="px-6 py-3 cursor-pointer hover:text-[var(--color-text)] transition-colors"
                                onClick={() => handleSort('video_title')}
                            >
                                <div className="flex items-center gap-1">
                                    {t('management.entries.table.video')}
                                    {sortConfig?.key === 'video_title' && (
                                        sortConfig.direction === 'asc' ? <Icons.ChevronUp className="w-3 h-3" /> : <Icons.ChevronDown className="w-3 h-3" />
                                    )}
                                </div>
                            </th>
                            <th className="px-6 py-3">{t('management.entries.table.quality')}</th>
                            <th
                                className="px-6 py-3 cursor-pointer hover:text-[var(--color-text)] transition-colors"
                                onClick={() => handleSort('file_size')}
                            >
                                <div className="flex items-center gap-1">
                                    {t('management.entries.table.size')}
                                    {sortConfig?.key === 'file_size' && (
                                        sortConfig.direction === 'asc' ? <Icons.ChevronUp className="w-3 h-3" /> : <Icons.ChevronDown className="w-3 h-3" />
                                    )}
                                </div>
                            </th>
                            <th
                                className="px-6 py-3 cursor-pointer hover:text-[var(--color-text)] transition-colors"
                                onClick={() => handleSort('cached_at')}
                            >
                                <div className="flex items-center gap-1">
                                    {t('management.entries.table.cachedAt')}
                                    {sortConfig?.key === 'cached_at' && (
                                        sortConfig.direction === 'asc' ? <Icons.ChevronUp className="w-3 h-3" /> : <Icons.ChevronDown className="w-3 h-3" />
                                    )}
                                </div>
                            </th>
                            <th
                                className="px-6 py-3 cursor-pointer hover:text-[var(--color-text)] transition-colors"
                                onClick={() => handleSort('expires_at')}
                            >
                                <div className="flex items-center gap-1">
                                    {t('management.entries.table.expires')}
                                    {sortConfig?.key === 'expires_at' && (
                                        sortConfig.direction === 'asc' ? <Icons.ChevronUp className="w-3 h-3" /> : <Icons.ChevronDown className="w-3 h-3" />
                                    )}
                                </div>
                            </th>
                            <th className="px-6 py-3 text-right">{t('management.entries.table.actions')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                        {sortedEntries.map(entry => (
                            <tr key={`${entry.source_id}-${entry.quality}`} className="hover:bg-[var(--color-bg)]/50">
                                <td className="px-6 py-4 font-medium">
                                    <div className="truncate max-w-md" title={entry.video_title || entry.source_id}>
                                        <Link
                                            to={`/detail/${entry.source_id}`}
                                            className="hover:text-indigo-500 hover:underline transition-colors"
                                        >
                                            {entry.video_title || entry.source_id}
                                        </Link>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 rounded text-xs font-medium 
                                        ${entry.quality === 'best' ? 'bg-green-500/10 text-green-500' :
                                            entry.quality === 'medium' ? 'bg-blue-500/10 text-blue-500' :
                                                entry.quality === 'audio_only' ? 'bg-orange-500/10 text-orange-500' :
                                                    'bg-gray-500/10 text-gray-500'}`}>
                                        {entry.quality}
                                    </span>
                                </td>
                                <td className="px-6 py-4">{formatBytes(entry.file_size)}</td>
                                <td className="px-6 py-4 text-[var(--color-text-muted)]">
                                    {new Date(entry.cached_at).toLocaleDateString()}
                                </td>
                                <td className="px-6 py-4 text-sm">
                                    {entry.expires_at ? (
                                        (() => {
                                            const days = Math.ceil((new Date(entry.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                                            return days > 0 ? (
                                                <span className={days <= 3 ? "text-red-500 font-medium" : "text-[var(--color-text-muted)]"}>
                                                    {t('management.entries.expireStatus.days', { count: days })} ({new Date(entry.expires_at).toLocaleDateString()})
                                                </span>
                                            ) : (
                                                <span className="text-red-500 font-bold">{t('management.entries.expireStatus.expired')}</span>
                                            );
                                        })()
                                    ) : (
                                        <span className="text-green-500/70">{t('management.entries.expireStatus.never')}</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button
                                        onClick={() => setPendingDelete({ sourceId: entry.source_id, quality: entry.quality })}
                                        className="p-1 hover:bg-red-500/10 text-[var(--color-text-muted)] hover:text-red-500 rounded transition-colors"
                                        title={t('common.delete')}
                                    >
                                        <Icons.Trash className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {entries.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-6 py-8 text-center text-[var(--color-text-muted)]">
                                    {t('management.entries.empty')}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <ConfirmModal
                isOpen={pendingDelete !== null}
                title={t('common.delete')}
                message={t('common.confirm')}
                variant="danger"
                onConfirm={handleDelete}
                onCancel={() => setPendingDelete(null)}
            />
        </div>
    )
}

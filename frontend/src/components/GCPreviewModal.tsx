import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { getMediaGCCandidates, triggerMediaGC } from '../api'
import Icons from './ui/Icons'
import { useToast } from '../contexts/ToastContext'

interface GCPreviewModalProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
}

export default function GCPreviewModal({ isOpen, onClose, onSuccess }: GCPreviewModalProps) {
    const { showToast } = useToast()
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [isAllSelected, setIsAllSelected] = useState(true)

    // Fetch Candidates
    const { data, isLoading, error } = useQuery({
        queryKey: ['gc-candidates'],
        queryFn: getMediaGCCandidates,
        enabled: isOpen,
    })

    // Mutation for Deletion
    const deleteMutation = useMutation({
        mutationFn: (targetIds?: string[]) => triggerMediaGC(targetIds),
        onSuccess: (res) => {
            showToast('success', `清理完成: 删除 ${res.deleted_count} 个文件, 释放 ${res.freed_mb} MB`)
            onSuccess()
            onClose()
        },
        onError: (e) => showToast('error', '清理失败: ' + e.message)
    })

    // Handle Selection logic
    useEffect(() => {
        if (data?.items && isAllSelected) {
            setSelectedIds(new Set(data.items.map(i => i.source_id)))
        }
    }, [data, isAllSelected])

    const handleToggleSelect = (id: string) => {
        const newSet = new Set(selectedIds)
        if (newSet.has(id)) {
            newSet.delete(id)
            setIsAllSelected(false)
        } else {
            newSet.add(id)
        }
        setSelectedIds(newSet)
    }

    const handleToggleAll = () => {
        if (isAllSelected) {
            setSelectedIds(new Set())
            setIsAllSelected(false)
        } else {
            setIsAllSelected(true)
            if (data?.items) {
                setSelectedIds(new Set(data.items.map(i => i.source_id)))
            }
        }
    }

    const handleConfirm = () => {
        const targetIds = isAllSelected ? undefined : Array.from(selectedIds)
        deleteMutation.mutate(targetIds)
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={onClose}>
            <div className="bg-[var(--color-card)] rounded-lg w-full max-w-3xl flex flex-col max-h-[85vh] shadow-2xl" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="px-6 py-4 border-b border-[var(--color-border)] flex justify-between items-center">
                    <h3 className="font-medium text-lg flex items-center gap-2">
                        <Icons.Trash className="w-5 h-5 text-[var(--color-primary)]" />
                        缓存清理确认
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-[var(--color-bg-hover)] rounded-full">
                        <Icons.X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6">
                    {isLoading ? (
                        <div className="text-center py-10 text-[var(--color-text-muted)]">扫描缓存文件中...</div>
                    ) : error ? (
                        <div className="text-red-500 text-center py-10">加载失败: {(error as Error).message}</div>
                    ) : !data?.items || data.items.length === 0 ? (
                        <div className="text-center py-10 text-[var(--color-text-muted)]">
                            <Icons.CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500 opacity-50" />
                            没有发现需要清理的缓存文件
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between text-sm">
                                <div className="text-[var(--color-text-muted)]">
                                    共发现 <span className="text-[var(--color-text)] font-bold">{data.count}</span> 个文件，
                                    合计 <span className="text-[var(--color-text)] font-bold">{(data.total_size_bytes / 1024 / 1024).toFixed(2)} MB</span>
                                </div>
                                <button onClick={handleToggleAll} className="text-[var(--color-primary)] hover:underline">
                                    {isAllSelected ? '取消全选' : '全选'}
                                </button>
                            </div>

                            <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-[var(--color-bg)] text-[var(--color-text-muted)] font-medium">
                                        <tr>
                                            <th className="px-4 py-2 w-10">
                                                <input
                                                    type="checkbox"
                                                    checked={isAllSelected}
                                                    onChange={handleToggleAll}
                                                    className="rounded border-[var(--color-border)]"
                                                />
                                            </th>
                                            <th className="px-4 py-2">文件/标题</th>
                                            <th className="px-4 py-2">删除原因</th>
                                            <th className="px-4 py-2 text-right">大小</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--color-border)]">
                                        {data.items.map((item) => (
                                            <tr key={item.source_id} className="hover:bg-[var(--color-bg-hover)] transition-colors">
                                                <td className="px-4 py-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedIds.has(item.source_id)}
                                                        onChange={() => handleToggleSelect(item.source_id)}
                                                        className="rounded border-[var(--color-border)]"
                                                    />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="font-medium truncate max-w-[300px]" title={item.title}>
                                                        {item.title || 'Unknown Video'}
                                                    </div>
                                                    <div className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate max-w-[300px]" title={item.media_path}>
                                                        {item.media_path}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-600">
                                                        {item.reason}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 text-right font-mono text-[var(--color-text-muted)]">
                                                    {(item.filesize / 1024 / 1024).toFixed(2)} MB
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-[var(--color-border)] flex justify-end gap-3 bg-[var(--color-bg)]/50">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm rounded-lg hover:bg-[var(--color-bg-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={deleteMutation.isPending || selectedIds.size === 0}
                        className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    >
                        {deleteMutation.isPending ? (
                            <>
                                <Icons.Refresh className="w-4 h-4 animate-spin" />
                                清理中...
                            </>
                        ) : (
                            <>
                                <Icons.Trash className="w-4 h-4" />
                                确认清理 ({selectedIds.size})
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}

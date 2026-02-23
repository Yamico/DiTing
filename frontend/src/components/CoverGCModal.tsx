import { useState, useEffect } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import Icons from './ui/Icons'
import { useToast } from '../contexts/ToastContext'
import ConfirmModal from './ConfirmModal'

interface CoverGCModalProps {
    isOpen: boolean
    onClose: () => void
    onSuccess: () => void
}

interface CoverCandidate {
    filename: string
    size: number
    path: string
}

interface GCResponse {
    count: number
    total_size_bytes: number
    items: CoverCandidate[]
}

export default function CoverGCModal({ isOpen, onClose, onSuccess }: CoverGCModalProps) {
    const { t } = useTranslation()
    const { showToast } = useToast()
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
    const [isAllSelected, setIsAllSelected] = useState(true)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

    // Fetch Candidates
    const { data, isLoading, error } = useQuery<GCResponse>({
        queryKey: ['cover-gc-candidates'],
        queryFn: async () => {
            const res = await fetch('/api/system/covers/gc-candidates')
            if (!res.ok) throw new Error('Failed to fetch candidates')
            return res.json()
        },
        enabled: isOpen,
    })

    // Mutation for Deletion
    const deleteMutation = useMutation({
        mutationFn: async (targetFilenames?: string[]) => {
            const res = await fetch('/api/system/clean_cache', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target_filenames: targetFilenames })
            })
            if (!res.ok) throw new Error('Failed to delete')
            return res.json()
        },
        onSuccess: (res) => {
            showToast('success', t('management.coverGC.cleanDone', { count: res.deleted_count, mb: res.freed_mb }))
            onSuccess()
            onClose()
        },
        onError: (e) => showToast('error', t('management.coverGC.cleanFailed') + ': ' + (e as Error).message)
    })

    // Handle Selection logic
    useEffect(() => {
        if (data?.items && isAllSelected) {
            setSelectedFiles(new Set(data.items.map(i => i.filename)))
        }
    }, [data, isAllSelected])

    const handleToggleSelect = (filename: string) => {
        const newSet = new Set(selectedFiles)
        if (newSet.has(filename)) {
            newSet.delete(filename)
            setIsAllSelected(false)
        } else {
            newSet.add(filename)
        }
        setSelectedFiles(newSet)
    }

    const handleToggleAll = () => {
        if (isAllSelected) {
            setSelectedFiles(new Set())
            setIsAllSelected(false)
        } else {
            setIsAllSelected(true)
            if (data?.items) {
                setSelectedFiles(new Set(data.items.map(i => i.filename)))
            }
        }
    }

    const handleConfirm = () => {
        setShowDeleteConfirm(false)
        const targetFilenames = isAllSelected ? undefined : Array.from(selectedFiles)
        deleteMutation.mutate(targetFilenames)
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={onClose}>
            <div className="bg-[var(--color-card)] rounded-lg w-full max-w-4xl flex flex-col max-h-[85vh] shadow-2xl" onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="px-6 py-4 border-b border-[var(--color-border)] flex justify-between items-center">
                    <h3 className="font-medium text-lg flex items-center gap-2">
                        <Icons.Image className="w-5 h-5 text-[var(--color-primary)]" />
                        {t('management.coverGC.title')}
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-[var(--color-bg-hover)] rounded-full">
                        <Icons.X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-6">
                    {isLoading ? (
                        <div className="text-center py-10 text-[var(--color-text-muted)]">
                            <Icons.Loader className="w-8 h-8 animate-spin mx-auto mb-2" />
                            {t('management.coverGC.scanning')}
                        </div>
                    ) : error ? (
                        <div className="text-red-500 text-center py-10">{t('management.coverGC.loadFailed')}: {(error as Error).message}</div>
                    ) : !data?.items || data.items.length === 0 ? (
                        <div className="text-center py-10 text-[var(--color-text-muted)]">
                            <Icons.CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500 opacity-50" />
                            {t('management.coverGC.noOrphans')}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between text-sm sticky top-0 bg-[var(--color-card)] z-10 py-2 border-b border-[var(--color-border)]">
                                <div className="text-[var(--color-text-muted)]">
                                    {t('management.coverGC.found', { count: data.count, size: (data.total_size_bytes / 1024 / 1024).toFixed(2) })}
                                </div>
                                <button onClick={handleToggleAll} className="text-[var(--color-primary)] hover:underline">
                                    {isAllSelected ? t('management.coverGC.deselectAll') : t('management.coverGC.selectAll')}
                                </button>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                {data.items.map((item) => {
                                    const isSelected = selectedFiles.has(item.filename)
                                    return (
                                        <div
                                            key={item.filename}
                                            className={`relative group border rounded-lg overflow-hidden cursor-pointer transition-all ${isSelected ? 'border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]' : 'border-[var(--color-border)] hover:border-[var(--color-text-muted)]'}`}
                                            onClick={() => handleToggleSelect(item.filename)}
                                        >
                                            <div className="aspect-video bg-[var(--color-bg)] flex items-center justify-center overflow-hidden">
                                                <img
                                                    src={`/api/covers/${item.filename}`}
                                                    alt={item.filename}
                                                    loading="lazy"
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>

                                            <div className="absolute top-2 right-2">
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    readOnly
                                                    className="w-4 h-4 rounded border-gray-300 text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                                                />
                                            </div>

                                            <div className="p-2 text-xs truncate text-center text-[var(--color-text-muted)] bg-[var(--color-card)]">
                                                {(item.size / 1024).toFixed(1)} KB
                                            </div>
                                        </div>
                                    )
                                })}
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
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={() => setShowDeleteConfirm(true)}
                        disabled={deleteMutation.isPending || selectedFiles.size === 0}
                        className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    >
                        {deleteMutation.isPending ? (
                            <>
                                <Icons.Refresh className="w-4 h-4 animate-spin" />
                                {t('management.coverGC.cleaning')}
                            </>
                        ) : (
                            <>
                                <Icons.Trash className="w-4 h-4" />
                                {t('management.coverGC.confirmClean', { count: selectedFiles.size })}
                            </>
                        )}
                    </button>
                </div>
            </div>

            <ConfirmModal
                isOpen={showDeleteConfirm}
                title={t('management.coverGC.title')}
                message={t('management.coverGC.confirmMessage', { count: selectedFiles.size })}
                variant="danger"
                onConfirm={handleConfirm}
                onCancel={() => setShowDeleteConfirm(false)}
            />
        </div>
    )
}

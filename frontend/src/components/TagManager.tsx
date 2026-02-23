import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getTags, createTag, updateTag, deleteTag } from '../api/client'
import type { Tag } from '../api/types'
import Icons from './ui/Icons'
import TagChip from './TagChip'
import ConfirmModal from './ConfirmModal'

interface TagManagerProps {
    onClose: () => void
}

const PRESET_COLORS = [
    '#ef4444', // red
    '#f97316', // orange
    '#f59e0b', // amber
    '#eab308', // yellow
    '#84cc16', // lime
    '#22c55e', // green
    '#10b981', // emerald
    '#14b8a6', // teal
    '#06b6d4', // cyan
    '#0ea5e9', // sky
    '#3b82f6', // blue
    '#6366f1', // indigo
    '#8b5cf6', // violet
    '#a855f7', // purple
    '#d946ef', // fuchsia
    '#ec4899', // pink
    '#f43f5e', // rose
    '#64748b', // slate
]

export default function TagManager({ onClose }: TagManagerProps) {
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const [editingTag, setEditingTag] = useState<Tag | null>(null)
    const [tagName, setTagName] = useState('')
    const [tagColor, setTagColor] = useState<string>(PRESET_COLORS[11] || '#6366f1') // Default indigo
    const [error, setError] = useState<string | null>(null)
    const [tagToDelete, setTagToDelete] = useState<Tag | null>(null)

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [onClose])

    const { data: tags, isLoading } = useQuery({
        queryKey: ['tags'],
        queryFn: getTags
    })

    const createMutation = useMutation({
        mutationFn: async () => {
            await createTag(tagName, tagColor)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tags'] })
            resetForm()
        },
        onError: (err: Error) => setError(err.message)
    })

    const updateMutation = useMutation({
        mutationFn: async () => {
            if (!editingTag) return
            await updateTag(editingTag.id, { name: tagName, color: tagColor })
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tags'] })
            // Check if any videos query needs invalidation (tags could be shown there)
            queryClient.invalidateQueries({ queryKey: ['videos'] })
            resetForm()
        },
        onError: (err: Error) => setError(err.message)
    })

    const deleteMutation = useMutation({
        mutationFn: deleteTag,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['tags'] })
            queryClient.invalidateQueries({ queryKey: ['videos'] })
        }
    })

    const resetForm = () => {
        setEditingTag(null)
        setTagName('')
        setTagColor(PRESET_COLORS[11] || '#6366f1')
        setError(null)
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!tagName.trim()) return

        if (editingTag) {
            updateMutation.mutate()
        } else {
            createMutation.mutate()
        }
    }

    const handleEdit = (tag: Tag) => {
        setEditingTag(tag)
        setTagName(tag.name)
        setTagColor(tag.color)
        setError(null)
    }

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="bg-[var(--color-bg)] w-full max-w-lg rounded-xl shadow-2xl border border-[var(--color-border)] flex flex-col max-h-[90vh]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Icons.ListFilter className="w-5 h-5 text-[var(--color-primary)]" />
                        {t('tags.title')}
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-[var(--color-bg-secondary)] rounded-lg transition-colors">
                        <Icons.X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-4 bg-[var(--color-card)] p-4 rounded-lg border border-[var(--color-border)]">
                        <h4 className="font-medium text-sm text-[var(--color-text-muted)]">
                            {editingTag ? t('tags.edit') : t('tags.create')}
                        </h4>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('tags.name')}</label>
                            <input
                                type="text"
                                value={tagName}
                                onChange={(e) => setTagName(e.target.value)}
                                className="w-full px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-primary)]"
                                placeholder={t('tags.namePlaceholder')}
                                autoFocus
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('tags.color')}</label>
                            <div className="flex flex-wrap gap-2">
                                {PRESET_COLORS.map(c => (
                                    <button
                                        type="button"
                                        key={c}
                                        onClick={() => setTagColor(c)}
                                        className={`w-6 h-6 rounded-full border-2 transition-all ${tagColor === c ? 'border-[var(--color-text)] scale-110' : 'border-transparent hover:scale-110'}`}
                                        style={{ backgroundColor: c }}
                                    />
                                ))}
                                <div className="relative ml-2">
                                    <input
                                        type="color"
                                        value={tagColor}
                                        onChange={(e) => setTagColor(e.target.value)}
                                        className="w-8 h-8 p-0 border-0 rounded-md cursor-pointer opacity-0 absolute inset-0"
                                    />
                                    <div
                                        className="w-6 h-6 rounded-full border border-[var(--color-border)] flex items-center justify-center cursor-pointer bg-[var(--color-bg)]"
                                        title="Custom Color"
                                    >
                                        <Icons.Plus className="w-3 h-3" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {error && <p className="text-red-500 text-sm">{error}</p>}

                        <div className="flex justify-end gap-2 pt-2">
                            {editingTag && (
                                <button type="button" onClick={resetForm} className="px-3 py-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                                    {t('common.cancel')}
                                </button>
                            )}
                            <button
                                type="submit"
                                disabled={!tagName.trim() || createMutation.isPending || updateMutation.isPending}
                                className="px-4 py-1.5 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {editingTag ? t('common.save') : t('common.create')}
                            </button>
                        </div>
                    </form>

                    {/* List */}
                    <div className="space-y-2">
                        <h4 className="font-medium text-sm text-[var(--color-text-muted)]">{t('tags.list')}</h4>
                        {isLoading ? (
                            <div className="text-center py-4 text-[var(--color-text-muted)]">Loading...</div>
                        ) : tags?.length === 0 ? (
                            <div className="text-center py-8 text-[var(--color-text-muted)] italic">{t('tags.noTags')}</div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {tags?.map(tag => (
                                    <div key={tag.id} className="flex items-center justify-between p-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] group hover:border-[var(--color-primary)] transition-colors">
                                        <TagChip tag={tag} />
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleEdit(tag)}
                                                className="p-1.5 hover:bg-[var(--color-bg)] rounded text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
                                            >
                                                <Icons.Edit className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => setTagToDelete(tag)}
                                                className="p-1.5 hover:bg-[var(--color-bg)] rounded text-[var(--color-text-muted)] hover:text-red-500"
                                            >
                                                <Icons.Trash className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <ConfirmModal
                isOpen={!!tagToDelete}
                title={t('tags.delete')}
                message={t('tags.deleteConfirm', { name: tagToDelete?.name })}
                confirmText={t('common.delete')}
                variant="danger"
                onConfirm={() => {
                    if (tagToDelete) {
                        deleteMutation.mutate(tagToDelete.id)
                        setTagToDelete(null)
                    }
                }}
                onCancel={() => setTagToDelete(null)}
            />
        </div>
    )
}

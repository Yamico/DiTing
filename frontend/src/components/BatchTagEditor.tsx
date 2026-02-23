import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getTags, createTag } from '../api/client'
import Icons from './ui/Icons'

interface BatchTagEditorProps {
    onConfirm: (tagIds: number[]) => void
    onClose: () => void
    count: number
}

export default function BatchTagEditor({ onConfirm, onClose, count }: BatchTagEditorProps) {
    const { t } = useTranslation()
    const queryClient = useQueryClient()

    // Start with empty selection for batch
    const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set())

    const [newTagName, setNewTagName] = useState('')
    const [isCreating, setIsCreating] = useState(false)

    const { data: allTags } = useQuery({
        queryKey: ['tags'],
        queryFn: getTags
    })

    const createTagMutation = useMutation({
        mutationFn: async (name: string) => {
            return await createTag(name, '#6366f1') // Default color
        },
        onSuccess: (newTag) => {
            queryClient.invalidateQueries({ queryKey: ['tags'] })
            setNewTagName('')
            setIsCreating(false)
            // Auto-select the new tag
            setSelectedTagIds(prev => new Set(prev).add(newTag.id))
        }
    })

    const toggleTag = (tagId: number) => {
        const newSet = new Set(selectedTagIds)
        if (newSet.has(tagId)) {
            newSet.delete(tagId)
        } else {
            newSet.add(tagId)
        }
        setSelectedTagIds(newSet)
    }

    const handleSave = () => {
        onConfirm(Array.from(selectedTagIds))
    }

    const handleCreateTag = (e: React.FormEvent) => {
        e.preventDefault()
        if (newTagName.trim()) {
            createTagMutation.mutate(newTagName.trim())
        }
    }

    // Portal to document.body to avoid z-index/overflow issues
    return createPortal(
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="bg-[var(--color-bg)] w-full max-w-sm rounded-xl shadow-2xl border border-[var(--color-border)] flex flex-col max-h-[80vh] scale-100 animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
                    <div>
                        <h3 className="text-lg font-semibold">{t('dashboard.batch.tagTitle')}</h3>
                        <p className="text-xs text-[var(--color-text-muted)] mt-1">
                            {t('dashboard.batch.selected', { count })} • {t('dashboard.batch.tagSuccess')}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1 hover:bg-[var(--color-bg-secondary)] rounded-lg transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                        <Icons.X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-600 dark:text-amber-400">
                        <div className="flex gap-2">
                            <Icons.AlertTriangle className="w-4 h-4 flex-shrink-0" />
                            <p>{t('dashboard.batch.tagOverwriteWarning')}</p>
                        </div>
                    </div>

                    {/* Tag List */}
                    <div className="space-y-2">
                        {allTags?.map(tag => (
                            <label
                                key={tag.id}
                                className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all ${selectedTagIds.has(tag.id)
                                    ? 'bg-[var(--color-primary)]/5 ring-1 ring-[var(--color-primary)]'
                                    : 'hover:bg-[var(--color-bg-secondary)]'
                                    }`}
                                onClick={(e) => {
                                    e.preventDefault()
                                    toggleTag(tag.id)
                                }}
                            >
                                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${selectedTagIds.has(tag.id) ? 'bg-[var(--color-primary)] border-[var(--color-primary)]' : 'border-[var(--color-text-muted)] bg-[var(--color-bg)]'}`}>
                                    {selectedTagIds.has(tag.id) && <Icons.Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                                </div>
                                <div className="flex items-center gap-2 flex-1">
                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                                    <span className="font-medium">{tag.name}</span>
                                </div>
                            </label>
                        ))}
                        {allTags?.length === 0 && (
                            <div className="text-center py-4 text-[var(--color-text-muted)] text-sm">{t('tags.noTags')}</div>
                        )}
                    </div>

                    {/* Quick Create */}
                    {isCreating ? (
                        <form onSubmit={handleCreateTag} className="flex gap-2">
                            <input
                                type="text"
                                value={newTagName}
                                onChange={e => setNewTagName(e.target.value)}
                                className="flex-1 px-3 py-1.5 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-primary)]"
                                placeholder={t('tags.namePlaceholder')}
                                autoFocus
                            />
                            <button type="submit" disabled={!newTagName.trim() || createTagMutation.isPending} className="px-3 py-1.5 bg-[var(--color-primary)] text-white rounded-lg text-sm flex items-center justify-center">
                                {createTagMutation.isPending ? <Icons.Loader className="w-4 h-4 animate-spin" /> : <Icons.Check className="w-4 h-4" />}
                            </button>
                            <button type="button" onClick={() => setIsCreating(false)} className="px-3 py-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-secondary)] rounded-lg">
                                <Icons.X className="w-4 h-4" />
                            </button>
                        </form>
                    ) : (
                        <button
                            onClick={() => setIsCreating(true)}
                            className="w-full py-2 flex items-center justify-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-bg-secondary)] rounded-lg dashed-border border-2 border-dashed border-[var(--color-border)] hover:border-[var(--color-primary)] transition-all"
                        >
                            <Icons.Plus className="w-4 h-4" />
                            {t('tags.create')}
                        </button>
                    )}
                </div>

                <div className="p-4 border-t border-[var(--color-border)] flex justify-end gap-2 bg-[var(--color-bg-secondary)]/30">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity shadow-sm flex items-center gap-2"
                    >
                        <Icons.Check className="w-4 h-4" />
                        {t('common.save')}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )
}

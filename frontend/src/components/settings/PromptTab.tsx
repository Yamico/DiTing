import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
    getPrompts,
    deletePrompt,
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory,
} from '../../api'
import type { Prompt } from '../../api/types'
import { useToast } from '../../contexts/ToastContext'
import Icons from '../ui/Icons'
import ConfirmModal from '../ConfirmModal'
import PromptFormModal from './PromptFormModal'

interface PromptTabProps {
    initialCategoryKey?: string
}

export default function PromptTab({ initialCategoryKey }: PromptTabProps = {}) {
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const { showUndoableDelete, showToast } = useToast()
    const [search, setSearch] = useState('')
    const [selectedCategory, setSelectedCategory] = useState<number | null>(null)
    const [showCategoryForm, setShowCategoryForm] = useState(false)
    const [editingCategory, setEditingCategory] = useState<{ id: number; name: string } | null>(null)
    const [categoryForm, setCategoryForm] = useState({ name: '', key: '' })
    const [hiddenPrompts, setHiddenPrompts] = useState<Set<number>>(new Set())
    const [categoryDeleteConfirm, setCategoryDeleteConfirm] = useState<{ id: number; name: string } | null>(null)

    // Modal state
    const [promptModal, setPromptModal] = useState<{ isOpen: boolean; prompt: Prompt | null }>({ isOpen: false, prompt: null })

    const { data: prompts, isLoading: promptsLoading } = useQuery({
        queryKey: ['prompts'],
        queryFn: getPrompts,
    })

    const { data: categories, isLoading: categoriesLoading } = useQuery({
        queryKey: ['categories'],
        queryFn: getCategories,
    })

    // Auto-select category from deep-link key on first load
    useEffect(() => {
        if (!initialCategoryKey || !categories) return
        const cat = categories.find(c => c.key === initialCategoryKey)
        if (cat) setSelectedCategory(cat.id)
    }, [initialCategoryKey, categories])

    const deletePromptMutation = useMutation({
        mutationFn: deletePrompt,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['prompts'] }),
    })

    // Category mutations
    const createCategoryMutation = useMutation({
        mutationFn: ({ name, key }: { name: string; key: string }) =>
            createCategory(name, key || null),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['categories'] })
            setShowCategoryForm(false)
            setCategoryForm({ name: '', key: '' })
            showToast('success', t('settings.prompt.categoryCreateSuccess'))
        },
        onError: (e) => showToast('error', t('settings.prompt.categoryCreateFailed') + ': ' + e.message),
    })

    const updateCategoryMutation = useMutation({
        mutationFn: ({ id, name }: { id: number; name: string }) =>
            updateCategory(id, name),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['categories'] })
            setEditingCategory(null)
            showToast('success', t('settings.prompt.categoryUpdateSuccess'))
        },
        onError: (e) => showToast('error', t('settings.prompt.categoryUpdateFailed') + ': ' + e.message),
    })

    const deleteCategoryMutation = useMutation({
        mutationFn: ({ id, deletePrompts }: { id: number; deletePrompts: boolean }) => deleteCategory(id, deletePrompts),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['categories'] })
            queryClient.invalidateQueries({ queryKey: ['prompts'] })
            showToast('success', t('settings.prompt.categoryDeleteSuccess'))
        },
        onError: (error: Error) => {
            showToast('error', t('settings.prompt.categoryDeleteFailed') + ': ' + error.message)
        }
    })

    const handleDeletePrompt = (promptId: number, promptName: string) => {
        setHiddenPrompts(prev => new Set(prev).add(promptId))
        showUndoableDelete(
            t('settings.prompt.deletePromptConfirm', { name: promptName }),
            async () => {
                await deletePromptMutation.mutateAsync(promptId)
            },
            () => {
                setHiddenPrompts(prev => {
                    const next = new Set(prev)
                    next.delete(promptId)
                    return next
                })
            }
        )
    }

    const filteredPrompts = prompts?.filter(p => {
        if (hiddenPrompts.has(p.id)) return false
        const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.content.toLowerCase().includes(search.toLowerCase())
        const matchesCategory = selectedCategory === null || p.category_id === selectedCategory
        return matchesSearch && matchesCategory
    })

    const isLoading = promptsLoading || categoriesLoading

    return (
        <div className="space-y-4">
            {/* Header with actions */}
            <div className="flex justify-between items-center">
                <h3 className="font-medium">{t('settings.prompt.title')}</h3>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowCategoryForm(!showCategoryForm)}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-[var(--color-border)] rounded-lg hover:opacity-80"
                    >
                        <Icons.Folder className="w-3 h-3" />
                        {t('settings.prompt.manageCategories')}
                    </button>
                    <button
                        onClick={() => setPromptModal({ isOpen: true, prompt: null })}
                        className="flex items-center gap-1 text-sm text-[var(--color-primary)] hover:underline"
                    >
                        <Icons.Plus className="w-4 h-4" />
                        {t('settings.prompt.addPrompt')}
                    </button>
                </div>
            </div>

            {/* Category Management Form */}
            {showCategoryForm && (
                <div className="bg-[var(--color-bg)] p-4 rounded-lg border border-[var(--color-border)] space-y-3">
                    <div className="text-sm font-medium">{t('settings.prompt.categoryManagement')}</div>

                    {/* Existing categories */}
                    <div className="flex flex-wrap gap-2">
                        {categories?.map(cat => (
                            <div key={cat.id} className="group flex items-center gap-1 px-2 py-1 bg-[var(--color-card)] rounded-lg text-sm">
                                {editingCategory?.id === cat.id ? (
                                    <input
                                        type="text"
                                        value={editingCategory.name}
                                        onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') updateCategoryMutation.mutate(editingCategory)
                                            if (e.key === 'Escape') setEditingCategory(null)
                                        }}
                                        className="w-20 px-1 bg-transparent border-b border-[var(--color-primary)] outline-none"
                                        autoFocus
                                    />
                                ) : (
                                    <span>{cat.name}</span>
                                )}
                                <button
                                    onClick={() => setEditingCategory({ id: cat.id, name: cat.name })}
                                    className="p-0.5 opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                                >
                                    <Icons.Edit className="w-3 h-3" />
                                </button>
                                <button
                                    onClick={() => setCategoryDeleteConfirm({ id: cat.id, name: cat.name })}
                                    className="p-0.5 opacity-0 group-hover:opacity-100 text-[var(--color-text-muted)] hover:text-red-500"
                                >
                                    <Icons.X className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Add new category */}
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder={t('settings.prompt.categoryNamePlaceholder')}
                            value={categoryForm.name}
                            onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                            className="flex-1 px-3 py-1.5 text-sm bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg"
                        />
                        <input
                            type="text"
                            placeholder={t('settings.prompt.categoryKeyPlaceholder')}
                            value={categoryForm.key}
                            onChange={(e) => setCategoryForm({ ...categoryForm, key: e.target.value })}
                            className="w-32 px-3 py-1.5 text-sm bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg"
                        />
                        <button
                            onClick={() => createCategoryMutation.mutate(categoryForm)}
                            disabled={!categoryForm.name || createCategoryMutation.isPending}
                            className="px-3 py-1.5 text-sm bg-[var(--color-primary)] text-white rounded-lg disabled:opacity-50"
                        >
                            {t('settings.prompt.addCategory')}
                        </button>
                    </div>
                </div>
            )}

            {/* Category filter + Search */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1 flex-wrap">
                    <button
                        onClick={() => setSelectedCategory(null)}
                        className={`px-2 py-1 text-xs rounded-full transition-colors ${selectedCategory === null ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-border)] hover:opacity-80'
                            }`}
                    >
                        {t('common.all')}
                    </button>
                    {categories?.map((cat: any) => (
                        <button
                            key={cat.id}
                            onClick={() => setSelectedCategory(cat.id)}
                            className={`px-2 py-1 text-xs rounded-full transition-colors ${selectedCategory === cat.id ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--color-border)] hover:opacity-80'
                                }`}
                        >
                            {cat.name}
                        </button>
                    ))}
                </div>
                <div className="flex-1" />
                <div className="relative">
                    <Icons.Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
                    <input
                        type="text"
                        placeholder={t('settings.prompt.searchPlaceholder')}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-8 pr-3 py-1.5 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg w-48"
                    />
                </div>
            </div>

            {/* Prompt list */}
            {isLoading ? (
                <div className="text-center py-10 text-[var(--color-text-muted)]">{t('common.loading')}</div>
            ) : (
                <div className="grid gap-3">
                    {filteredPrompts?.map((prompt: any) => (
                        <div key={prompt.id} className="group bg-[var(--color-bg)] p-4 rounded-lg hover:shadow-sm transition-shadow">
                            <div className="flex justify-between items-start mb-2">
                                <span className="font-medium">{prompt.name}</span>
                                <div className="flex items-center gap-1">
                                    {prompt.category_name && (
                                        <span className="text-xs bg-[var(--color-border)] px-2 py-0.5 rounded mr-2">{prompt.category_name}</span>
                                    )}
                                    <button
                                        onClick={() => setPromptModal({ isOpen: true, prompt })}
                                        className="p-1 opacity-0 group-hover:opacity-100 rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-hover)] transition-all"
                                    >
                                        <Icons.Edit className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={() => handleDeletePrompt(prompt.id, prompt.name)}
                                        className="p-1 opacity-0 group-hover:opacity-100 rounded-full text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-all"
                                    >
                                        <Icons.Trash className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                            <p className="text-sm text-[var(--color-text-muted)] line-clamp-2">{prompt.content}</p>
                        </div>
                    ))}
                    {filteredPrompts?.length === 0 && (
                        <div className="text-center py-8 text-[var(--color-text-muted)]">{t('settings.prompt.noPrompts')}</div>
                    )}
                </div>
            )}

            {/* Prompt Add/Edit Modal */}
            <PromptFormModal
                isOpen={promptModal.isOpen}
                onClose={() => setPromptModal({ isOpen: false, prompt: null })}
                prompt={promptModal.prompt}
            />

            {/* Category Delete Confirm */}
            <ConfirmModal
                isOpen={!!categoryDeleteConfirm}
                title={t('settings.prompt.deleteCategoryTitle')}
                message={t('settings.prompt.deleteCategoryMessage', { name: categoryDeleteConfirm?.name })}
                confirmText={t('settings.prompt.deleteCategoryAndPrompts')}
                tertiaryText={t('settings.prompt.deleteCategoryOnly')}
                cancelText={t('common.cancel')}
                variant="danger"
                tertiaryVariant="warning"
                onConfirm={() => {
                    if (categoryDeleteConfirm) {
                        deleteCategoryMutation.mutate({ id: categoryDeleteConfirm.id, deletePrompts: true })
                        setCategoryDeleteConfirm(null)
                    }
                }}
                onTertiary={() => {
                    if (categoryDeleteConfirm) {
                        deleteCategoryMutation.mutate({ id: categoryDeleteConfirm.id, deletePrompts: false })
                        setCategoryDeleteConfirm(null)
                    }
                }}
                onCancel={() => setCategoryDeleteConfirm(null)}
            />
        </div>
    )
}

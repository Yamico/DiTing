import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    getPrompts, getCategories, createPrompt, updatePrompt, deletePrompt,
    createCategory, updateCategory,
} from '../api'
import { useToast } from '../contexts/ToastContext'
import Icons from './ui/Icons'

interface PromptManagerProps {
    onSelect: (content: string) => void
    height?: string
}

export default function PromptManager({ onSelect, height = 'h-64' }: PromptManagerProps) {
    const queryClient = useQueryClient()
    const { showUndoableDelete } = useToast()

    const [selectedCategoryId, setSelectedCategoryId] = useState<number | 'all' | 'uncategorized'>('all')
    const [searchQuery, setSearchQuery] = useState('')
    const [showPromptForm, setShowPromptForm] = useState(false)
    const [showCategoryForm, setShowCategoryForm] = useState(false)
    const [editingPrompt, setEditingPrompt] = useState<any>(null)
    const [editingCategory, setEditingCategory] = useState<any>(null)

    // Forms
    const [promptForm, setPromptForm] = useState({ name: '', content: '', category_id: null as number | null })
    const [categoryForm, setCategoryForm] = useState({ name: '', key: '' })

    // Load Data
    const { data: prompts } = useQuery({ queryKey: ['prompts'], queryFn: getPrompts })
    const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: getCategories })

    // Mutations
    const createPromptMutation = useMutation({
        mutationFn: (data: any) => createPrompt(data.name, data.content, data.category_id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['prompts'] })
            setShowPromptForm(false)
            setPromptForm({ name: '', content: '', category_id: null })
        }
    })

    const updatePromptMutation = useMutation({
        mutationFn: (data: any) => updatePrompt(data.id, data.name, data.content, data.category_id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['prompts'] })
            setEditingPrompt(null)
        }
    })

    const deletePromptMutation = useMutation({
        mutationFn: deletePrompt,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['prompts'] })
    })

    const createCategoryMutation = useMutation({
        mutationFn: (data: any) => createCategory(data.name, data.key),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['categories'] })
            setShowCategoryForm(false)
            setCategoryForm({ name: '', key: '' })
        }
    })

    const updateCategoryMutation = useMutation({
        mutationFn: (data: any) => updateCategory(data.id, data.name),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['categories'] })
            setEditingCategory(null)
        }
    })



    // Computed
    const filteredPrompts = useMemo(() => {
        if (!prompts) return []
        return prompts.filter((p: any) => {
            if (selectedCategoryId !== 'all') {
                if (selectedCategoryId === 'uncategorized') {
                    if (p.category_id !== null) return false
                } else {
                    if (p.category_id !== selectedCategoryId) return false
                }
            }
            if (searchQuery) {
                const q = searchQuery.toLowerCase()
                return p.name.toLowerCase().includes(q) || p.content.toLowerCase().includes(q)
            }
            return true
        })
    }, [prompts, selectedCategoryId, searchQuery])

    // Handlers
    const handleSavePrompt = () => {
        if (editingPrompt) {
            updatePromptMutation.mutate({ id: editingPrompt.id, ...promptForm })
        } else {
            createPromptMutation.mutate(promptForm)
        }
    }

    const handleDeletePrompt = (id: number, name: string) => {
        showUndoableDelete(`删除 "${name}"?`, () => deletePromptMutation.mutateAsync(id))
    }

    return (
        <div className="flex flex-col h-full bg-[var(--color-bg-secondary)] rounded-lg border border-[var(--color-border)] overflow-hidden">
            {/* Toolbar */}
            <div className="p-2 border-b border-[var(--color-border)] flex gap-2 overflow-x-auto">
                <button
                    onClick={() => setSelectedCategoryId('all')}
                    className={`px-2 py-1 rounded text-xs whitespace-nowrap ${selectedCategoryId === 'all' ? 'bg-[var(--color-primary)] text-white' : 'hover:bg-[var(--color-hover)]'}`}
                >
                    全部
                </button>
                {categories?.map((cat: any) => (
                    <button
                        key={cat.id}
                        onClick={() => setSelectedCategoryId(cat.id)}
                        onDoubleClick={() => {
                            setEditingCategory(cat)
                            setCategoryForm({ name: cat.name, key: cat.key })
                            setShowCategoryForm(true)
                        }}
                        className={`px-2 py-1 rounded text-xs whitespace-nowrap ${selectedCategoryId === cat.id ? 'bg-[var(--color-primary)] text-white' : 'hover:bg-[var(--color-hover)]'}`}
                    >
                        {cat.name}
                    </button>
                ))}
                <button
                    onClick={() => setShowCategoryForm(true)}
                    className="px-2 py-1 rounded text-xs border border-dashed border-[var(--color-border)] hover:border-[var(--color-primary)] opacity-60 hover:opacity-100"
                >
                    + 分类
                </button>
            </div>

            {/* Forms Area (Conditional) */}
            {showCategoryForm && (
                <div className="p-2 bg-[var(--color-card)] border-b border-[var(--color-border)] animate-in slide-in-from-top-2">
                    <div className="flex gap-2 mb-1">
                        <input
                            placeholder="分类名称"
                            value={categoryForm.name}
                            onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })}
                            className="flex-1 px-2 py-1 text-xs border rounded"
                        />
                        <button
                            onClick={() => {
                                if (editingCategory) updateCategoryMutation.mutate({ id: editingCategory.id, name: categoryForm.name })
                                else createCategoryMutation.mutate(categoryForm)
                            }}
                            className="px-2 py-1 bg-[var(--color-primary)] text-white rounded text-xs"
                        >
                            保存
                        </button>
                        <button onClick={() => setShowCategoryForm(false)} className="px-2 py-1 text-xs">取消</button>
                    </div>
                </div>
            )}

            {/* Search & Add */}
            <div className="p-2 border-b border-[var(--color-border)] flex gap-2">
                <div className="relative flex-1">
                    <Icons.Search className="absolute left-2 top-1.5 w-3 h-3 text-gray-400" />
                    <input
                        placeholder="搜索提示词..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-6 pr-2 py-1 text-xs bg-[var(--color-bg)] border border-[var(--color-border)] rounded"
                    />
                </div>
                <button
                    onClick={() => setShowPromptForm(true)}
                    className="p-1 hover:bg-[var(--color-hover)] rounded"
                    title="添加提示词"
                >
                    <Icons.Plus className="w-4 h-4" />
                </button>
            </div>

            {/* Prompt Form */}
            {(showPromptForm || editingPrompt) && (
                <div className="p-3 bg-[var(--color-card)] border-b border-[var(--color-border)] space-y-2 animate-in slide-in-from-top-2 z-10">
                    <input
                        placeholder="名称"
                        value={promptForm.name}
                        onChange={e => setPromptForm({ ...promptForm, name: e.target.value })}
                        className="w-full px-2 py-1 text-xs border rounded"
                    />
                    <textarea
                        placeholder="内容"
                        value={promptForm.content}
                        onChange={e => setPromptForm({ ...promptForm, content: e.target.value })}
                        className="w-full h-20 px-2 py-1 text-xs border rounded resize-none"
                    />
                    <div className="flex justify-between">
                        <select
                            value={promptForm.category_id || ''}
                            onChange={e => setPromptForm({ ...promptForm, category_id: e.target.value ? Number(e.target.value) : null })}
                            className="text-xs border rounded px-1 w-32"
                        >
                            <option value="">无分类</option>
                            {categories?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <div className="flex gap-2">
                            <button
                                onClick={() => {
                                    setEditingPrompt(null)
                                    setShowPromptForm(false)
                                    setPromptForm({ name: '', content: '', category_id: null })
                                }}
                                className="px-2 py-1 text-xs"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSavePrompt}
                                className="px-2 py-1 bg-[var(--color-primary)] text-white rounded text-xs"
                            >
                                保存
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* List */}
            <div className={`flex-1 overflow-y-auto p-2 space-y-2 ${height}`}>
                {filteredPrompts.sort((a: any, b: any) => b.id - a.id).map((p: any) => (
                    <div
                        key={p.id}
                        className="group p-2 rounded border border-[var(--color-border)] bg-[var(--color-card)] hover:border-[var(--color-primary-light)] cursor-pointer transition-all"
                        onClick={() => onSelect(p.content)}
                    >
                        <div className="flex justify-between items-start mb-1">
                            <span className="font-medium text-xs text-[var(--color-text-primary)]">{p.name}</span>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setEditingPrompt(p)
                                        setPromptForm({ name: p.name, content: p.content, category_id: p.category_id })
                                    }}
                                    className="p-1 hover:bg-[var(--color-hover)] rounded"
                                >
                                    <Icons.Edit className="w-3 h-3" />
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        handleDeletePrompt(p.id, p.name)
                                    }}
                                    className="p-1 hover:bg-red-500/10 text-red-500 rounded"
                                >
                                    <Icons.Trash className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                        <div className="text-[10px] text-[var(--color-text-secondary)] line-clamp-2 font-mono">
                            {p.content}
                        </div>
                    </div>
                ))}
                {filteredPrompts.length === 0 && (
                    <div className="text-center py-8 text-xs text-[var(--color-text-tertiary)] opacity-60">
                        {searchQuery ? '无搜索结果' : '无提示词'}
                    </div>
                )}
            </div>
        </div>
    )
}

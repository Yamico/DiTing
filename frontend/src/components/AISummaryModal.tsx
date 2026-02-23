import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
    getLLMProviders, analyzeSegment, deleteSummary,
    getPrompts, getCategories, createPrompt, updatePrompt, deletePrompt,
    createCategory, updateCategory, deleteCategory
} from '../api'
import { Segment, Prompt, PromptCategory } from '../api/types'
import { useToast } from '../contexts/ToastContext'
import Icons from './ui/Icons'
import ConfirmModal from './ConfirmModal'
import type { RefineContext } from './SegmentCard'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useTranslation } from 'react-i18next'

interface AISummaryModalProps {
    isOpen: boolean
    onClose: () => void
    segment: Segment | null
    onSuccess: () => void
    refineContext?: RefineContext | null
}

export default function AISummaryModal({ isOpen, onClose, segment, onSuccess, refineContext }: AISummaryModalProps) {
    const { t } = useTranslation()
    useEscapeKey(onClose, isOpen)
    const queryClient = useQueryClient()
    const { showToast, showUndoableDelete } = useToast()

    // UI state
    const [selectedCategoryId, setSelectedCategoryId] = useState<number | 'all' | 'uncategorized'>('all')
    const [searchQuery, setSearchQuery] = useState('')
    const [customPrompt, setCustomPrompt] = useState(refineContext ? t('aiSummaryModal.refineDefaultPrompt') : '')
    const [selectedModelId, setSelectedModelId] = useState<number | ''>('')
    const [overwriteMode, setOverwriteMode] = useState<'append' | 'overwrite'>('append')
    const [selectedOverwriteId, setSelectedOverwriteId] = useState<number | ''>('')
    const [showRefineContext, setShowRefineContext] = useState(true)
    const [stripSubtitle, setStripSubtitle] = useState<boolean>(!!segment?.is_subtitle)

    // Sync state when modal opens
    useEffect(() => {
        if (isOpen && segment) {
            setStripSubtitle(segment.is_subtitle === 1 || segment.is_subtitle === true)
        }
    }, [isOpen, segment])

    // CRUD state
    const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null)
    const [editingCategory, setEditingCategory] = useState<PromptCategory | null>(null)
    const [showPromptForm, setShowPromptForm] = useState(false)
    const [showCategoryForm, setShowCategoryForm] = useState(false)
    const [categoryDeleteConfirm, setCategoryDeleteConfirm] = useState<{ id: number; name: string } | null>(null)

    // Load Data using react-query
    const { data: providers = [] } = useQuery({ queryKey: ['llm_providers'], queryFn: getLLMProviders, enabled: isOpen })
    const { data: prompts = [] } = useQuery({ queryKey: ['prompts'], queryFn: getPrompts, enabled: isOpen })
    const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: getCategories, enabled: isOpen })

    // Mutations
    const analyzeMutation = useMutation<any, Error, any>({
        mutationFn: (params: any) => analyzeSegment(params),
        onSuccess: () => {
            showToast('success', t('aiSummaryModal.analysisSent'))
            onSuccess()
            onClose()
        },
        onError: (e: any) => showToast('error', t('aiSummaryModal.analysisFailed') + e.message)
    })

    const promptMutation = useMutation<any, Error, any>({
        mutationFn: (data: any) => data.id ? updatePrompt(data.id, data.name, data.content, data.category_id) : createPrompt(data.name, data.content, data.category_id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['prompts'] })
            setShowPromptForm(false)
            setEditingPrompt(null)
        }
    })

    const categoryMutation = useMutation<any, Error, any>({
        mutationFn: (data: any) => data.id ? updateCategory(data.id, data.name) : createCategory(data.name, null),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['categories'] })
            setShowCategoryForm(false)
            setEditingCategory(null)
        }
    })

    const deletePromptMutation = useMutation({
        mutationFn: deletePrompt,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['prompts'] })
    })

    // Computed
    const modelOptions = useMemo(() => providers.flatMap(p =>
        p.models.map(m => ({ id: m.id, name: m.model_name, provider: p.name, is_active: m.is_active }))
    ), [providers])

    // Set default model
    useMemo(() => {
        if (isOpen && selectedModelId === '' && modelOptions.length > 0) {
            const active = modelOptions.find(m => m.is_active)
            if (active) setSelectedModelId(active.id)
        }
    }, [isOpen, modelOptions, selectedModelId])

    const filteredPrompts = useMemo(() => {
        return prompts.filter(p => {
            if (selectedCategoryId !== 'all') {
                if (selectedCategoryId === 'uncategorized') {
                    if (p.category_id !== null) return false
                } else if (p.category_id !== selectedCategoryId) return false
            }
            if (searchQuery) {
                const q = searchQuery.toLowerCase()
                return p.name.toLowerCase().includes(q) || p.content.toLowerCase().includes(q)
            }
            return true
        })
    }, [prompts, selectedCategoryId, searchQuery])

    // Handlers
    const handleAnalyze = async () => {
        if (!segment || !customPrompt.trim()) return
        if (overwriteMode === 'overwrite' && selectedOverwriteId === '') {
            alert(t('aiSummaryModal.selectWarning'))
            return
        }

        if (overwriteMode === 'overwrite' && selectedOverwriteId !== '') {
            await deleteSummary(selectedOverwriteId as number)
        }

        analyzeMutation.mutate({
            transcription_id: segment.id,
            prompt: customPrompt,
            llm_model_id: selectedModelId === '' ? undefined : selectedModelId,
            parent_id: refineContext?.parentId ?? undefined,
            input_text: refineContext ? refineContext.contextText : undefined,
            strip_subtitle: stripSubtitle,
        })
    }

    const handleDeletePrompt = (id: number, name: string) => {
        showUndoableDelete(`${t('common.delete')} "${name}"?`, async () => deletePromptMutation.mutateAsync(id))
    }

    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-[var(--color-card)] w-full max-w-5xl h-[85vh] rounded-xl border border-[var(--color-border)] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="px-6 py-4 border-b border-[var(--color-border)] flex justify-between items-center bg-[var(--color-bg)]/50">
                    <div>
                        <h2 className="text-lg font-semibold text-[var(--color-text)] flex items-center gap-2">
                            {refineContext ? <><Icons.MessageCircle className="w-5 h-5 text-[var(--color-primary)]" /> {t('aiSummaryModal.titleRefine')}</> : <><Icons.Sparkles className="w-5 h-5 text-[var(--color-primary)]" /> {t('aiSummaryModal.title')}</>}
                        </h2>
                        <p className="text-xs text-[var(--color-text-muted)] mt-1">{refineContext ? t('aiSummaryModal.descRefine') : t('aiSummaryModal.desc')}</p>
                    </div>
                    <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] p-2">✕</button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    {/* Categories Sidebar */}
                    <div className="w-48 border-r border-[var(--color-border)] bg-[var(--color-bg)]/30 flex flex-col">
                        <div className="p-2 space-y-1 overflow-y-auto flex-1">
                            <button
                                onClick={() => setSelectedCategoryId('all')}
                                className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 ${selectedCategoryId === 'all' ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]'}`}
                            >
                                <Icons.Globe className="w-4 h-4" /> {t('aiSummaryModal.all')}
                            </button>
                            {categories.map(cat => (
                                <div key={cat.id} className="group relative flex items-center">
                                    <button
                                        onClick={() => setSelectedCategoryId(cat.id)}
                                        className={`flex-1 text-left px-3 py-2 rounded text-sm truncate flex items-center gap-2 ${selectedCategoryId === cat.id ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]'}`}
                                    >
                                        <span className="truncate">{cat.name}</span>
                                    </button>
                                    <div className="absolute right-1 hidden group-hover:flex gap-0.5 bg-[var(--color-card)] shadow-sm rounded border border-[var(--color-border)] p-0.5">
                                        <button className="p-1 hover:text-[var(--color-primary)]" onClick={() => { setEditingCategory(cat); setShowCategoryForm(true); }}><Icons.Edit className="w-3 h-3" /></button>
                                        <button className="p-1 hover:text-red-500" onClick={() => setCategoryDeleteConfirm({ id: cat.id, name: cat.name })}><Icons.Trash className="w-3 h-3" /></button>
                                    </div>
                                </div>
                            ))}
                            <button
                                onClick={() => setSelectedCategoryId('uncategorized')}
                                className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 ${selectedCategoryId === 'uncategorized' ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] font-medium' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)]'}`}
                            >
                                <Icons.Folder className="w-4 h-4" /> {t('aiSummaryModal.uncategorized')}
                            </button>
                        </div>
                        <div className="p-3 border-t border-[var(--color-border)]">
                            <button onClick={() => { setEditingCategory(null); setShowCategoryForm(true); }} className="w-full py-1.5 text-xs border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] rounded hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors flex items-center justify-center gap-1">
                                <Icons.Plus className="w-3.5 h-3.5" /> {t('aiSummaryModal.newCategory')}
                            </button>
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 flex flex-col p-4 bg-[var(--color-bg)]/10 overflow-hidden relative">
                        <div className="flex justify-between items-center mb-4">
                            <div className="relative w-64">
                                <Icons.Search className="absolute left-2.5 top-2 w-4 h-4 text-[var(--color-text-muted)]" />
                                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder={t('aiSummaryModal.searchPromptPlaceholder')} className="w-full pl-8 pr-3 py-1.5 text-sm bg-[var(--color-bg)] border border-[var(--color-border)] rounded-full focus:outline-none focus:border-[var(--color-primary)]" />
                            </div>
                            <button onClick={() => { setEditingPrompt(null); setShowPromptForm(true); }} className="px-3 py-1.5 text-xs bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 rounded-lg transition-colors flex items-center gap-1">
                                <Icons.Plus className="w-3.5 h-3.5" /> {t('aiSummaryModal.newPrompt')}
                            </button>
                        </div>

                        {/* Prompt Grid */}
                        <div className="flex-1 overflow-y-auto pr-1">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {filteredPrompts.map(prompt => (
                                    <div key={prompt.id} onClick={() => setCustomPrompt(prompt.content)} className="group relative p-3 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg hover:border-[var(--color-primary)]/50 hover:shadow-md cursor-pointer transition-all active:scale-[0.98]">
                                        <h4 className="text-sm font-semibold text-[var(--color-text)] mb-1 flex items-center justify-between">
                                            {prompt.name}
                                            <div className="hidden group-hover:flex gap-0.5" onClick={e => e.stopPropagation()}>
                                                <button className="p-1 hover:text-[var(--color-primary)] rounded bg-[var(--color-bg)]" onClick={() => { setEditingPrompt(prompt); setShowPromptForm(true); }}><Icons.Edit className="w-3.5 h-3.5" /></button>
                                                <button className="p-1 hover:text-red-500 rounded bg-[var(--color-bg)]" onClick={() => handleDeletePrompt(prompt.id, prompt.name)}><Icons.Trash className="w-3.5 h-3.5" /></button>
                                            </div>
                                        </h4>
                                        <p className="text-xs text-[var(--color-text-muted)] line-clamp-3 leading-relaxed">{prompt.content}</p>
                                    </div>
                                ))}
                                {filteredPrompts.length === 0 && <div className="col-span-full py-10 text-center text-[var(--color-text-muted)] text-sm italic">{t('aiSummaryModal.noPromptsFound')}</div>}
                            </div>
                        </div>

                        {/* Refine Context */}
                        {refineContext && (
                            <div className="mt-4 rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 overflow-hidden">
                                <button onClick={() => setShowRefineContext(!showRefineContext)} className="w-full px-4 py-2 flex items-center justify-between text-sm font-medium text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10">
                                    <span className="flex items-center gap-2"><Icons.MessageCircle className="w-4 h-4" /> {t('aiSummaryModal.contextReference')}</span>
                                    <Icons.ChevronDown className={`w-4 h-4 transition-transform ${showRefineContext ? 'rotate-180' : ''}`} />
                                </button>
                                {showRefineContext && <div className="px-4 pb-3 text-xs text-[var(--color-text-secondary)] font-mono max-h-32 overflow-y-auto whitespace-pre-wrap">{refineContext.contextText}</div>}
                            </div>
                        )}

                        {/* Custom Input */}
                        <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
                            <label className="text-xs font-semibold text-[var(--color-text-muted)] mb-2 block">{t('aiSummaryModal.customPromptLabel')}</label>
                            <textarea value={customPrompt} onChange={e => setCustomPrompt(e.target.value)} placeholder={t('aiSummaryModal.customPromptPlaceholder')} className="w-full h-24 p-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-sm resize-none focus:border-[var(--color-primary)] focus:outline-none" />
                        </div>
                    </div>
                </div>

                {/* Footer Controls */}
                <div className="p-4 bg-[var(--color-bg)] border-t border-[var(--color-border)] flex flex-wrap gap-4 items-end">
                    <div className="flex-1 min-w-[150px] space-y-1">
                        <label className="text-xs text-[var(--color-text-muted)] block mb-1">{t('aiSummaryModal.subtitlePreprocessing')}</label>
                        <label
                            className={`flex items-center gap-2 px-3 py-2 text-sm bg-[var(--color-card)] border ${stripSubtitle ? 'border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary)]/5' : 'border-[var(--color-border)] text-[var(--color-text)]'} rounded cursor-pointer transition-colors hover:border-[var(--color-primary)]/50`}
                            title={t('aiSummaryModal.stripSubtitleTitle')}
                        >
                            <input
                                type="checkbox"
                                className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)] cursor-pointer"
                                checked={stripSubtitle}
                                onChange={e => setStripSubtitle(e.target.checked)}
                            />
                            <span>{t('aiSummaryModal.stripSubtitle')}</span>
                        </label>
                    </div>

                    <div className="flex-1 min-w-[200px] space-y-1">
                        <label className="text-xs text-[var(--color-text-muted)] block">{t('aiSummaryModal.modelSelection')}</label>
                        <select value={selectedModelId} onChange={e => setSelectedModelId(e.target.value ? Number(e.target.value) : '')} className="w-full p-2 text-sm bg-[var(--color-card)] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)]">
                            <option value="">{t('aiSummaryModal.defaultModel')}</option>
                            {providers.map(p => (
                                <optgroup key={p.id} label={p.name}>{p.models?.map(m => <option key={m.id} value={m.id}>{m.model_name}</option>)}</optgroup>
                            ))}
                        </select>
                    </div>

                    <div className="flex-1 max-w-[150px] space-y-1">
                        <label className="text-xs text-[var(--color-text-muted)] block">{t('aiSummaryModal.processMode')}</label>
                        <select value={overwriteMode} onChange={e => setOverwriteMode(e.target.value as any)} className="w-full p-2 text-sm bg-[var(--color-card)] border border-[var(--color-border)] rounded focus:border-[var(--color-primary)]">
                            <option value="append">{t('aiSummaryModal.appendVersion')}</option>
                            <option value="overwrite" disabled={!segment?.summaries?.length}>{t('aiSummaryModal.overwriteVersion')}</option>
                        </select>
                    </div>

                    {overwriteMode === 'overwrite' && (
                        <div className="flex-1 max-w-[240px] space-y-1">
                            <label className="text-xs text-[var(--color-text-muted)] block">{t('aiSummaryModal.selectOverwriteVersionLabel')}</label>
                            <select value={selectedOverwriteId} onChange={e => setSelectedOverwriteId(e.target.value ? Number(e.target.value) : '')} className="w-full p-2 text-sm bg-[var(--color-card)] border border-amber-500/50 rounded focus:border-amber-500">
                                <option value="">{t('aiSummaryModal.pleaseSelect')}</option>
                                {segment?.summaries?.map(s => <option key={s.id} value={s.id}>{s.model} - {new Date(s.timestamp).toLocaleString()}</option>)}
                            </select>
                        </div>
                    )}

                    <div className="flex gap-3 ml-auto">
                        <button onClick={onClose} className="px-5 py-2 text-sm border rounded-lg hover:bg-[var(--color-bg-hover)]">{t('common.cancel')}</button>
                        <button onClick={handleAnalyze} disabled={analyzeMutation.isPending || !customPrompt.trim()} className="px-5 py-2 text-sm bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
                            {analyzeMutation.isPending ? <><Icons.Loader className="w-4 h-4 animate-spin" /> {t('aiSummaryModal.requesting')}</> : <><Icons.Sparkles className="w-4 h-4" /> {t('aiSummaryModal.startAnalysis')}</>}
                        </button>
                    </div>
                </div>

                {/* Prompt/Category Forms (Overlays) */}
                {showPromptForm && (
                    <div className="absolute inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                        <div className="bg-[var(--color-card)] w-full max-w-lg rounded-xl border border-[var(--color-border)] shadow-2xl p-6 space-y-4 animate-in zoom-in-95">
                            <h3 className="font-semibold text-lg">{editingPrompt ? t('aiSummaryModal.editPrompt') : t('aiSummaryModal.newPrompt')}</h3>
                            <input id="p-name" placeholder={t('aiSummaryModal.promptTitlePlaceholder')} defaultValue={editingPrompt?.name} className="w-full p-2 bg-[var(--color-bg)] border rounded" />
                            <textarea id="p-content" placeholder={t('aiSummaryModal.promptContentPlaceholder')} defaultValue={editingPrompt?.content ?? customPrompt} className="w-full h-40 p-2 bg-[var(--color-bg)] border rounded resize-none" />
                            <select id="p-cat" defaultValue={editingPrompt?.category_id ?? (typeof selectedCategoryId === 'number' ? selectedCategoryId : '')} className="w-full p-2 bg-[var(--color-bg)] border rounded">
                                <option value="">{t('aiSummaryModal.noCategory')}</option>
                                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                            <div className="flex justify-end gap-3 pt-2">
                                <button onClick={() => setShowPromptForm(false)} className="px-4 py-2 border rounded">{t('common.cancel')}</button>
                                <button onClick={() => {
                                    const name = (document.getElementById('p-name') as HTMLInputElement).value
                                    const content = (document.getElementById('p-content') as HTMLTextAreaElement).value
                                    const catId = (document.getElementById('p-cat') as HTMLSelectElement).value
                                    promptMutation.mutate({ id: editingPrompt?.id, name, content, category_id: catId ? Number(catId) : null })
                                }} className="px-4 py-2 bg-[var(--color-primary)] text-white rounded">{t('common.save')}</button>
                            </div>
                        </div>
                    </div>
                )}

                {showCategoryForm && (
                    <div className="absolute inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                        <div className="bg-[var(--color-card)] w-full max-w-sm rounded-xl border border-[var(--color-border)] shadow-2xl p-6 space-y-4 animate-in zoom-in-95">
                            <h3 className="font-semibold text-lg">{editingCategory ? t('aiSummaryModal.editCategory') : t('aiSummaryModal.newCategory')}</h3>
                            <input id="c-name" placeholder={t('aiSummaryModal.categoryNamePlaceholder')} defaultValue={editingCategory?.name} className="w-full p-2 bg-[var(--color-bg)] border rounded" />
                            <div className="flex justify-end gap-3 pt-2">
                                <button onClick={() => setShowCategoryForm(false)} className="px-4 py-2 border rounded">{t('common.cancel')}</button>
                                <button onClick={() => {
                                    const name = (document.getElementById('c-name') as HTMLInputElement).value
                                    categoryMutation.mutate({ id: editingCategory?.id, name })
                                }} className="px-4 py-2 bg-[var(--color-primary)] text-white rounded">{t('common.save')}</button>
                            </div>
                        </div>
                    </div>
                )}

                <ConfirmModal
                    isOpen={!!categoryDeleteConfirm}
                    title={t('aiSummaryModal.deleteCategory')}
                    message={t('aiSummaryModal.deleteCategoryConfirm', { name: categoryDeleteConfirm?.name || '' })}
                    confirmText={t('aiSummaryModal.deleteCategoryAndClean')}
                    onConfirm={async () => {
                        if (categoryDeleteConfirm) {
                            await deleteCategory(categoryDeleteConfirm.id, true)
                            queryClient.invalidateQueries({ queryKey: ['categories'] })
                            setCategoryDeleteConfirm(null)
                        }
                    }}
                    onCancel={() => setCategoryDeleteConfirm(null)}
                    variant="danger"
                />
            </div>
        </div>
    )
}

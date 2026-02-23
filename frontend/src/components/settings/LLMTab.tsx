import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
    getLLMProviders,
    addLLMProvider,
    updateLLMProvider,
    deleteLLMProvider,
    deleteLLMModel,
    setActiveModel,
    addLLMModel,
    updateLLMModel,
} from '../../api'
import { useToast } from '../../contexts/ToastContext'
import Icons from '../ui/Icons'
import ConfirmModal from '../ConfirmModal'

export default function LLMTab() {
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const { showUndoableDelete, showToast } = useToast()
    const [showForm, setShowForm] = useState(false)
    const [editingId, setEditingId] = useState<number | null>(null)
    const [formData, setFormData] = useState({ name: '', base_url: '', api_key: '' })
    const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string } | null>(null)
    const [hiddenModels, setHiddenModels] = useState<Set<number>>(new Set())
    const [showApiKey, setShowApiKey] = useState(false)

    const [addingModelProviderId, setAddingModelProviderId] = useState<number | null>(null)
    const [newModelName, setNewModelName] = useState('')

    const [editingModelId, setEditingModelId] = useState<number | null>(null)
    const [editModelName, setEditModelName] = useState('')

    const { data: providers, isLoading } = useQuery({
        queryKey: ['llm-providers'],
        queryFn: getLLMProviders,
    })

    const addProviderMutation = useMutation({
        mutationFn: addLLMProvider,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['llm-providers'] })
            setShowForm(false)
            setFormData({ name: '', base_url: '', api_key: '' })
            showToast('success', t('settings.llm.addSuccess'))
        },
        onError: (e) => showToast('error', t('settings.llm.addFailed') + ': ' + e.message),
    })

    const updateProviderMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: { name: string; base_url: string; api_key: string } }) =>
            updateLLMProvider(id, data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['llm-providers'] })
            setEditingId(null)
            setFormData({ name: '', base_url: '', api_key: '' })
            showToast('success', t('settings.llm.updateSuccess'))
        },
        onError: (e) => showToast('error', t('settings.llm.updateFailed') + ': ' + e.message),
    })

    const deleteProviderMutation = useMutation({
        mutationFn: deleteLLMProvider,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['llm-providers'] })
            showToast('success', t('settings.llm.deleteSuccess'))
        },
        onError: (e) => showToast('error', t('settings.llm.deleteFailed') + ': ' + e.message),
    })

    const deleteModelMutation = useMutation({
        mutationFn: deleteLLMModel,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['llm-providers'] }),
    })

    const activateModelMutation = useMutation({
        mutationFn: setActiveModel,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['llm-providers'] }),
    })

    const addModelMutation = useMutation({
        mutationFn: ({ providerId, modelName }: { providerId: number, modelName: string }) => addLLMModel(providerId, modelName),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['llm-providers'] })
            setAddingModelProviderId(null)
            setNewModelName('')
            showToast('success', t('common.success'))
        },
        onError: (e) => showToast('error', t('common.error') + ': ' + e.message),
    })

    const updateModelMutation = useMutation({
        mutationFn: ({ modelId, modelName }: { modelId: number, modelName: string }) => updateLLMModel(modelId, modelName),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['llm-providers'] })
            setEditingModelId(null)
            setEditModelName('')
            showToast('success', t('common.success'))
        },
        onError: (e) => showToast('error', t('common.error') + ': ' + e.message),
    })

    const handleEdit = (provider: { id: number; name: string; base_url: string; api_key?: string }) => {
        setEditingId(provider.id)
        setFormData({ name: provider.name, base_url: provider.base_url, api_key: provider.api_key || '' })
        setShowForm(false)
        setShowApiKey(false)
    }

    const handleSave = () => {
        if (editingId) {
            updateProviderMutation.mutate({ id: editingId, data: formData })
        } else {
            addProviderMutation.mutate(formData)
        }
    }

    const handleCancelEdit = () => {
        setEditingId(null)
        setShowForm(false)
        setFormData({ name: '', base_url: '', api_key: '' })
        setShowApiKey(false)
    }

    const handleDeleteModel = (modelId: number) => {
        // Optimistic delete
        setHiddenModels(prev => new Set(prev).add(modelId))
        showUndoableDelete(
            t('settings.llm.deletingModel'),
            async () => {
                await deleteModelMutation.mutateAsync(modelId)
            },
            () => {
                setHiddenModels(prev => {
                    const next = new Set(prev)
                    next.delete(modelId)
                    return next
                })
            }
        )
    }

    const handleAddModelSubmit = (providerId: number) => {
        if (!newModelName.trim()) {
            setAddingModelProviderId(null)
            return
        }
        addModelMutation.mutate({ providerId, modelName: newModelName.trim() })
    }

    const handleEditModelSubmit = (modelId: number) => {
        if (!editModelName.trim()) {
            setEditingModelId(null)
            return
        }
        updateModelMutation.mutate({ modelId, modelName: editModelName.trim() })
    }

    const isEditing = editingId !== null
    const showingForm = showForm || isEditing

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="font-medium">{t('settings.llm.providers')}</h3>
                {!showingForm && (
                    <button
                        onClick={() => setShowForm(true)}
                        className="flex items-center gap-1.5 text-sm text-[var(--color-primary)] hover:underline"
                    >
                        <Icons.Plus className="w-4 h-4" />
                        {t('settings.llm.addProvider')}
                    </button>
                )}
            </div>

            {showingForm && (
                <div className="bg-[var(--color-bg)] p-4 rounded-lg space-y-3 border border-[var(--color-border)]">
                    <div className="text-sm font-medium mb-2">
                        {isEditing ? t('settings.llm.editProvider') : t('settings.llm.addProviderTitle')}
                    </div>
                    <input
                        type="text"
                        placeholder={t('settings.llm.namePlaceholder')}
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full px-3 py-2 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg text-sm"
                    />
                    <input
                        type="text"
                        placeholder={t('settings.llm.urlPlaceholder')}
                        value={formData.base_url}
                        onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
                        className="w-full px-3 py-2 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg text-sm"
                    />
                    <div className="relative">
                        <input
                            type={showApiKey ? "text" : "password"}
                            placeholder={t('settings.llm.apiKeyPlaceholder')}
                            value={formData.api_key}
                            onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                            className="w-full px-3 py-2 pr-10 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg text-sm"
                        />
                        <button
                            type="button"
                            onClick={() => setShowApiKey(!showApiKey)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                        >
                            {showApiKey ? <Icons.EyeOff className="w-4 h-4" /> : <Icons.Eye className="w-4 h-4" />}
                        </button>
                    </div>
                    <div className="flex gap-2 justify-end">
                        <button
                            onClick={handleCancelEdit}
                            className="px-3 py-1.5 text-sm bg-[var(--color-border)] rounded-lg hover:opacity-80"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={addProviderMutation.isPending || updateProviderMutation.isPending}
                            className="px-3 py-1.5 text-sm bg-[var(--color-primary)] text-white rounded-lg disabled:opacity-50"
                        >
                            {isEditing ? t('settings.llm.update') : t('common.save')}
                        </button>
                    </div>
                </div>
            )}

            {isLoading ? (
                <div className="text-center py-10 text-[var(--color-text-muted)]">{t('common.loading')}</div>
            ) : (
                <div className="space-y-4">
                    {providers?.map((provider: any) => (
                        <div key={provider.id} className="bg-[var(--color-bg)] p-4 rounded-lg">
                            <div className="flex justify-between items-center mb-3">
                                <span className="font-medium">{provider.name}</span>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => handleEdit(provider)}
                                        className="p-1.5 rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-hover)] transition-colors"
                                        title={t('settings.llm.edit')}
                                    >
                                        <Icons.Edit className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setDeleteConfirm({ id: provider.id, name: provider.name })}
                                        className="p-1.5 rounded-full text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                                        title={t('settings.llm.delete')}
                                    >
                                        <Icons.Trash className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="text-xs text-[var(--color-text-muted)] mb-3">{provider.base_url}</div>
                            <div className="flex flex-wrap gap-2 items-center">
                                {provider.models.filter((m: any) => !hiddenModels.has(m.id)).map((model: any) => (
                                    <div key={model.id} className="group relative">
                                        {editingModelId === model.id ? (
                                            <input
                                                type="text"
                                                autoFocus
                                                value={editModelName}
                                                onChange={e => setEditModelName(e.target.value)}
                                                onBlur={() => handleEditModelSubmit(model.id)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter') handleEditModelSubmit(model.id)
                                                    if (e.key === 'Escape') setEditingModelId(null)
                                                }}
                                                className="px-3 py-1 text-xs rounded-full border border-[var(--color-primary)] bg-[var(--color-bg)] outline-none min-w-[120px]"
                                            />
                                        ) : (
                                            <>
                                                <div className={`flex items-center rounded-full transition-colors ${model.is_active
                                                    ? 'bg-[var(--color-primary)] text-white'
                                                    : 'bg-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-primary)]/20'
                                                    }`}>
                                                    <button
                                                        onClick={() => activateModelMutation.mutate(model.id)}
                                                        className={`px-3 py-1 text-xs rounded-full transition-colors flex items-center justify-center`}
                                                    >
                                                        {model.model_name || model.name} {Boolean(model.is_active) && '✓'}
                                                    </button>
                                                    {!model.is_active && (
                                                        <div className="flex items-center pr-1 max-w-0 overflow-hidden opacity-0 group-hover:max-w-[100px] group-hover:opacity-100 transition-all duration-200">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    setEditModelName(model.model_name || model.name)
                                                                    setEditingModelId(model.id)
                                                                }}
                                                                className="p-1 rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 transition-colors"
                                                                title={t('settings.llm.editModel')}
                                                            >
                                                                <Icons.Edit className="w-3 h-3" />
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    handleDeleteModel(model.id)
                                                                }}
                                                                className="p-1 rounded-full text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                                                                title={t('settings.llm.deleteModel')}
                                                            >
                                                                <Icons.X className="w-3 h-3" />
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                                {addingModelProviderId === provider.id ? (
                                    <input
                                        type="text"
                                        autoFocus
                                        placeholder={t('settings.llm.modelNamePlaceholder')}
                                        value={newModelName}
                                        onChange={e => setNewModelName(e.target.value)}
                                        onBlur={() => handleAddModelSubmit(provider.id)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') handleAddModelSubmit(provider.id)
                                            if (e.key === 'Escape') setAddingModelProviderId(null)
                                        }}
                                        className="px-3 py-1 text-xs rounded-full border border-[var(--color-primary)] bg-[var(--color-bg)] outline-none min-w-[150px]"
                                    />
                                ) : (
                                    <button
                                        onClick={() => {
                                            setAddingModelProviderId(provider.id)
                                            setNewModelName('')
                                        }}
                                        className="px-3 py-1.5 text-xs rounded-full border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)] transition-colors flex items-center gap-1"
                                        title={t('settings.llm.addModel')}
                                    >
                                        <Icons.Plus className="w-3 h-3" />
                                        <span>{t('settings.llm.addModel')}</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Delete Confirmation Modal */}
            <ConfirmModal
                isOpen={deleteConfirm !== null}
                title={t('settings.llm.deleteModalTitle')}
                message={t('settings.llm.deleteModalMessage', { name: deleteConfirm?.name })}
                confirmText={t('common.delete')}
                cancelText={t('common.cancel')}
                variant="danger"
                onConfirm={() => {
                    if (deleteConfirm) {
                        deleteProviderMutation.mutate(deleteConfirm.id)
                        setDeleteConfirm(null)
                    }
                }}
                onCancel={() => setDeleteConfirm(null)}
            />
        </div>
    )
}

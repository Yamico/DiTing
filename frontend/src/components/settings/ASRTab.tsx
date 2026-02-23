import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
    getASRStatus,
    updateASRConfig,
    getASRModels,
    createASRModel,
    updateASRModel,
    deleteASRModel,
    setActiveASRModel,
} from '../../api'
import { ASRModel } from '../../api/types'
import { useToast } from '../../contexts/ToastContext'
import Icons from '../ui/Icons'
import ConfirmModal from '../ConfirmModal'

export default function ASRTab() {
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const { showToast } = useToast()

    // Fetch Status & Config
    const { data: statusData, isLoading: statusLoading } = useQuery({
        queryKey: ['asr-status'],
        queryFn: () => getASRStatus(false),
        refetchInterval: 30000,
    })

    // Fetch DB Models
    const { data: models, isLoading: modelsLoading } = useQuery({
        queryKey: ['asr-models'],
        queryFn: getASRModels,
    })

    const [showModelForm, setShowModelForm] = useState(false)
    const [editingModel, setEditingModel] = useState<ASRModel | null>(null)
    const [modelForm, setModelForm] = useState({ name: '', engine: 'bailian', config: '' })

    // Structured form fields for cloud model config
    const [cloudForm, setCloudForm] = useState({ api_key: '', model_name: 'paraformer-realtime-v2' })

    // Supported DashScope models grouped by API type
    const DASHSCOPE_MODELS = [
        {
            group: t('settings.asr.groups.realtime'), models: [
                { value: 'paraformer-realtime-v2', label: t('settings.asr.models.paraformerRealtimeV2') },
                { value: 'paraformer-realtime-8k-v2', label: t('settings.asr.models.paraformerRealtime8kV2') },
                { value: 'fun-asr-realtime', label: t('settings.asr.models.funAsrRealtime') },
                { value: 'qwen3-asr-flash-realtime', label: t('settings.asr.models.qwen3AsrRealtime') },
            ]
        },
        {
            group: t('settings.asr.groups.multimodal'), models: [
                { value: 'qwen3-asr-flash', label: t('settings.asr.models.qwen3AsrFlash') },
                { value: 'qwen-audio-asr', label: t('settings.asr.models.qwenAudio') },
            ]
        },
    ]

    const createModelMutation = useMutation({
        mutationFn: ({ name, engine, config }: { name: string, engine: string, config: string }) =>
            createASRModel(name, engine, config),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['asr-models'] })
            setShowModelForm(false)
            showToast('success', t('settings.asr.addSuccess'))
        },
        onError: (e) => showToast('error', t('settings.asr.addFailed') + ': ' + e.message)
    })

    const updateModelMutation = useMutation({
        mutationFn: ({ id, name, engine, config }: { id: number, name: string, engine: string, config: string }) =>
            updateASRModel(id, name, engine, config),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['asr-models'] })
            setShowModelForm(false)
            setEditingModel(null)
            showToast('success', t('settings.asr.updateSuccess'))
        },
        onError: (e) => showToast('error', t('settings.asr.updateFailed') + ': ' + e.message)
    })

    const deleteModelMutation = useMutation({
        mutationFn: deleteASRModel,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['asr-models'] })
            showToast('success', t('settings.asr.deleteSuccess'))
        }
    })

    const activateMutation = useMutation({
        mutationFn: setActiveASRModel,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['asr-models'] })
            showToast('success', t('settings.asr.activateSuccess'))
        }
    })

    const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null)

    const handleDeleteModel = (id: number) => {
        setDeleteConfirmId(null)
        deleteModelMutation.mutate(id)
    }

    const handleEditModel = (model: ASRModel) => {
        setEditingModel(model)
        setModelForm({ name: model.name, engine: model.engine, config: model.config })
        // Parse existing config into structured form
        try {
            const cfg = JSON.parse(model.config)
            setCloudForm({ api_key: cfg.api_key || '', model_name: cfg.model_name || 'paraformer-realtime-v2' })
        } catch {
            setCloudForm({ api_key: '', model_name: 'paraformer-realtime-v2' })
        }
        setShowModelForm(true)
    }

    const handleSaveModel = () => {
        // Build JSON config from structured form
        let apiKey = cloudForm.api_key
        // When editing, preserve existing API key if field is left blank
        if (editingModel && !apiKey) {
            try {
                const existingCfg = JSON.parse(editingModel.config)
                apiKey = existingCfg.api_key || ''
            } catch { /* ignore */ }
        }
        const configJson = JSON.stringify({
            api_key: apiKey,
            model_name: cloudForm.model_name,
        })
        const payload = { ...modelForm, config: configJson }
        if (editingModel) {
            updateModelMutation.mutate({ id: editingModel.id, ...payload })
        } else {
            createModelMutation.mutate(payload)
        }
    }

    // Mutation for Config Update
    const configMutation = useMutation({
        mutationFn: updateASRConfig,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['asr-status'] })
            showToast('success', t('settings.asr.configUpdated'))
        },
        onError: (e) => showToast('error', t('settings.asr.configUpdateFailed') + ': ' + e.message),
    })

    // Initial Refresh on Mount
    useEffect(() => {
        getASRStatus(true).then((data) => {
            queryClient.setQueryData(['asr-status'], data)
        })
    }, [queryClient])

    const handleRefresh = async () => {
        const data = await getASRStatus(true)
        queryClient.setQueryData(['asr-status'], data)
        showToast('success', t('settings.asr.statusRefreshed'))
    }

    const handleMove = (engine: string, direction: 'up' | 'down') => {
        if (!statusData?.config?.priority) return
        const current = [...statusData.config.priority]
        const idx = current.indexOf(engine)
        if (idx === -1) return

        if (direction === 'up' && idx > 0) {
            const temp = current[idx]!
            current[idx] = current[idx - 1]!
            current[idx - 1] = temp
        } else if (direction === 'down' && idx < current.length - 1) {
            const temp = current[idx]!
            current[idx] = current[idx + 1]!
            current[idx + 1] = temp
        }
        configMutation.mutate({ priority: current })
    }

    const toggleStrict = () => {
        if (!statusData?.config) return
        configMutation.mutate({ strict_mode: !statusData.config.strict_mode })
    }

    const toggleEngineEnabled = (engine: string) => {
        if (!statusData?.config) return
        const disabled = new Set(statusData.config.disabled_engines || [])
        if (disabled.has(engine)) {
            disabled.delete(engine)
        } else {
            disabled.add(engine)
        }
        configMutation.mutate({ disabled_engines: Array.from(disabled) })
    }

    if (statusLoading || modelsLoading) return <div className="text-center py-10 text-[var(--color-text-muted)]">{t('common.loading')}</div>

    const engines = statusData?.engines || {}
    const config = statusData?.config || { priority: [], strict_mode: false, active_engine: null, disabled_engines: [] }
    const priority = config.priority || Object.keys(engines)
    const strictMode = config.strict_mode || false
    const activeEngine = config.active_engine || (priority.length > 0 ? priority[0] : null)
    const disabledEngines = new Set(config.disabled_engines || [])

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h3 className="font-medium">{t('settings.asr.title')}</h3>
                <button
                    onClick={handleRefresh}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[var(--color-bg-hover)] rounded-lg hover:bg-[var(--color-border)] transition-colors"
                >
                    <Icons.Refresh className="w-3.5 h-3.5" />
                    {t('settings.asr.refresh')}
                </button>
            </div>

            {/* Strict Mode Toggle */}
            <div className="bg-[var(--color-bg)] p-4 rounded-lg flex items-center justify-between border border-[var(--color-border)]">
                <div>
                    <div className="font-medium">{t('settings.asr.strictMode')}</div>
                    <div className="text-sm text-[var(--color-text-muted)] mt-1">
                        {t('settings.asr.strictModeDesc')}
                    </div>
                </div>
                <button
                    onClick={toggleStrict}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${strictMode ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'
                        }`}
                >
                    <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${strictMode ? 'translate-x-6' : 'translate-x-1'
                            }`}
                    />
                </button>
            </div>

            {/* Engine List (Ordered by Priority) */}
            <div className="space-y-3">
                <div className="text-sm font-medium text-[var(--color-text-muted)] px-1">{t('settings.asr.priority')}</div>
                {priority.map((engineName, index) => {
                    const info = engines[engineName]
                    if (!info) return null

                    const isOnline = info.online
                    const latency = info.latency

                    const isActive = activeEngine === engineName
                    const isCloud = info.type === 'cloud'
                    const isDisabled = disabledEngines.has(engineName)

                    return (
                        <div
                            key={engineName}
                            className={`
                                    relative p-4 rounded-lg border flex items-center gap-4 transition-all duration-200
                                    ${isActive && strictMode
                                    ? 'bg-[var(--color-primary)]/5 border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]'
                                    : 'bg-[var(--color-bg)] border-[var(--color-border)] hover:border-[var(--color-border-hover)]'}
                                    ${isDisabled ? 'opacity-60 grayscale-[0.5]' : ''}
                                `}
                        >
                            {/* Order Number */}
                            <div className="w-6 h-6 flex items-center justify-center rounded-full bg-[var(--color-bg-hover)] text-xs font-mono shrink-0">
                                {index + 1}
                            </div>

                            {/* Enable/Disable Toggle - Only visible in Non-Strict Mode or if not active */}
                            <div className="flex items-center justify-center w-8">
                                <button
                                    onClick={() => toggleEngineEnabled(engineName)}
                                    className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${!isDisabled ? 'bg-green-500' : 'bg-[var(--color-border)]'
                                        }`}
                                    title={isDisabled ? t('settings.asr.enableTooltip') : t('settings.asr.disableTooltip')}
                                >
                                    <span
                                        className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${!isDisabled ? 'translate-x-3.5' : 'translate-x-0.5'
                                            }`}
                                    />
                                </button>
                            </div>

                            {/* Active Radio - Only visible in Strict Mode */}
                            <div className={`flex items-center justify-center transition-all duration-300 ${strictMode ? 'w-8 opacity-100' : 'w-0 opacity-0 overflow-hidden'}`}>
                                <input
                                    type="radio"
                                    name="active_engine"
                                    checked={isActive}
                                    onChange={() => configMutation.mutate({ active_engine: engineName })}
                                    className="w-4 h-4 text-[var(--color-primary)] bg-[var(--color-bg)] border-[var(--color-border)] focus:ring-[var(--color-primary)] cursor-pointer"
                                    title={t('settings.asr.setPrimaryTooltip')}
                                />
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className={`font-medium capitalize ${isActive && strictMode ? 'text-[var(--color-primary)]' : ''}`}>
                                        {engineName}
                                    </span>

                                    {/* Badges */}
                                    <div className="flex items-center gap-1.5">
                                        {isActive && strictMode && (
                                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-primary)] text-white font-medium shadow-sm">
                                                Active
                                            </span>
                                        )}
                                        {isDisabled && (
                                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--color-border)] text-[var(--color-text-muted)] font-medium">
                                                Disabled
                                            </span>
                                        )}
                                        <span className={`px-2 py-0.5 rounded text-[10px] ${isCloud ? 'bg-blue-500/10 text-blue-500' : 'bg-purple-500/10 text-purple-500'
                                            }`}>
                                            {isCloud ? 'Cloud' : 'Local'}
                                        </span>
                                    </div>
                                </div>
                                <div className="text-xs text-[var(--color-text-muted)] mt-1 flex items-center gap-2 truncate">
                                    {info.url && <span className="truncate">URL: {info.url}</span>}
                                </div>
                            </div>

                            {/* Status */}
                            <div className="flex flex-col items-end gap-1 min-w-[80px]">
                                <div className={`flex items-center gap-1.5 text-xs font-medium ${isOnline ? 'text-green-500' : 'text-red-500'
                                    }`}>
                                    <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
                                    {isOnline ? 'Online' : 'Offline'}
                                </div>
                                {isOnline && latency >= 0 && (
                                    <div className="text-[10px] text-[var(--color-text-muted)]">
                                        {latency.toFixed(0)} ms
                                    </div>
                                )}
                            </div>

                            {/* Reorder Controls */}
                            <div className="flex flex-col gap-1 pl-2 border-l border-[var(--color-border)]">
                                <button
                                    onClick={() => handleMove(engineName, 'up')}
                                    disabled={index === 0}
                                    className="p-1 hover:bg-[var(--color-bg-hover)] rounded text-[var(--color-text-muted)] disabled:opacity-30"
                                >
                                    <Icons.ChevronDown className="w-3.5 h-3.5 rotate-180" />
                                </button>
                                <button
                                    onClick={() => handleMove(engineName, 'down')}
                                    disabled={index === priority.length - 1}
                                    className="p-1 hover:bg-[var(--color-bg-hover)] rounded text-[var(--color-text-muted)] disabled:opacity-30"
                                >
                                    <Icons.ChevronDown className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Cloud Models Configuration */}
            <div className="pt-4 border-t border-[var(--color-border)]">
                <div className="flex items-center justify-between mb-4">
                    <h4 className="font-medium flex items-center gap-2">
                        <Icons.Cloud className="w-5 h-5 text-blue-500" />
                        {t('settings.asr.cloudModels')}
                    </h4>
                    <button
                        onClick={() => {
                            setEditingModel(null)
                            setModelForm({ name: '', engine: 'bailian', config: '' })
                            setCloudForm({ api_key: '', model_name: 'paraformer-realtime-v2' })
                            setShowModelForm(true)
                        }}
                        className="flex items-center gap-1 text-sm text-[var(--color-primary)] hover:underline"
                    >
                        <Icons.Plus className="w-4 h-4" />
                        {t('settings.asr.addConfig')}
                    </button>
                </div>

                {/* Model List */}
                <div className="space-y-2">
                    {models?.filter((m: ASRModel) => m.engine === 'bailian').length === 0 && (
                        <div className="text-sm text-[var(--color-text-muted)] text-center py-4 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] border-dashed">
                            {t('settings.asr.noCloudModels')}
                        </div>
                    )}
                    {models?.filter((m: ASRModel) => m.engine === 'bailian').map((model: ASRModel) => (
                        <div key={model.id} className="bg-[var(--color-bg)] p-3 rounded-lg border border-[var(--color-border)] flex items-center justify-between">
                            <div>
                                <div className="font-medium flex items-center gap-2">
                                    {model.name}
                                    {Boolean(model.is_active) && <span className="bg-green-500/10 text-green-500 text-[10px] px-1.5 py-0.5 rounded">Active</span>}
                                </div>
                                <div className="text-xs text-[var(--color-text-muted)] mt-1 flex items-center gap-2">
                                    {(() => {
                                        try {
                                            const cfg = JSON.parse(model.config)
                                            return (
                                                <>
                                                    <span className="font-mono bg-[var(--color-bg-hover)] px-1.5 py-0.5 rounded">{cfg.model_name || t('settings.asr.unknownModel')}</span>
                                                    <span>·</span>
                                                    <span>{cfg.api_key ? `Key: ${cfg.api_key.slice(0, 6)}...` : t('settings.asr.noKey')}</span>
                                                </>
                                            )
                                        } catch {
                                            return <span className="font-mono truncate max-w-[300px]">{model.config}</span>
                                        }
                                    })()}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                {!model.is_active && (
                                    <button
                                        onClick={() => activateMutation.mutate(model.id)}
                                        className="text-xs px-2 py-1 bg-[var(--color-primary)]/10 text-[var(--color-primary)] rounded hover:bg-[var(--color-primary)]/20"
                                    >
                                        {t('settings.asr.activate')}
                                    </button>
                                )}
                                <button
                                    onClick={() => handleEditModel(model)}
                                    className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-hover)] rounded"
                                >
                                    <Icons.Edit className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setDeleteConfirmId(model.id)}
                                    className="p-1.5 text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-500/10 rounded"
                                >
                                    <Icons.Trash className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Model Form Modal */}
            {showModelForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" onClick={() => setShowModelForm(false)}>
                    <div className="bg-[var(--color-card)] p-6 rounded-lg w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
                        <h3 className="font-medium text-lg">{editingModel ? t('settings.asr.editConfig') : t('settings.asr.addConfigTitle')}</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="text-sm font-medium block mb-1">{t('settings.asr.configName')}</label>
                                <input
                                    type="text"
                                    value={modelForm.name}
                                    onChange={e => setModelForm({ ...modelForm, name: e.target.value })}
                                    placeholder={t('settings.asr.configNamePlaceholder')}
                                    className="w-full px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium block mb-1">{t('settings.asr.engineType')}</label>
                                <select
                                    value={modelForm.engine}
                                    disabled
                                    className="w-full px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md text-sm opacity-50"
                                >
                                    <option value="bailian">Aliyun Bailian / DashScope</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-sm font-medium block mb-1">{t('settings.asr.dashscopeKey')}</label>
                                <input
                                    type="password"
                                    value={cloudForm.api_key}
                                    onChange={e => setCloudForm({ ...cloudForm, api_key: e.target.value })}
                                    placeholder={editingModel ? t('settings.asr.leaveBlank') : 'sk-...'}
                                    className="w-full px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md text-sm font-mono"
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium block mb-1">{t('settings.asr.model')}</label>
                                {(() => {
                                    const allModels = DASHSCOPE_MODELS.flatMap(g => g.models.map(m => m.value))
                                    const isCustom = !allModels.includes(cloudForm.model_name)
                                    const selectValue = isCustom ? 'custom' : cloudForm.model_name

                                    return (
                                        <select
                                            value={selectValue}
                                            onChange={e => {
                                                const val = e.target.value
                                                setCloudForm({
                                                    ...cloudForm,
                                                    model_name: val === 'custom' ? '' : val
                                                })
                                            }}
                                            className="w-full px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md text-sm"
                                        >
                                            {DASHSCOPE_MODELS.map(group => (
                                                <optgroup key={group.group} label={group.group}>
                                                    {group.models.map(m => (
                                                        <option key={m.value} value={m.value}>{m.label}</option>
                                                    ))}
                                                </optgroup>
                                            ))}
                                            <option value="custom">{t('settings.asr.customModel')}</option>
                                        </select>
                                    )
                                })()}

                                {/* Custom Model Input */}
                                {(() => {
                                    const allModels = DASHSCOPE_MODELS.flatMap(g => g.models.map(m => m.value))
                                    const isCustom = !allModels.includes(cloudForm.model_name)

                                    if (isCustom) {
                                        return (
                                            <div className="mt-2">
                                                <input
                                                    type="text"
                                                    value={cloudForm.model_name === 'custom' ? '' : cloudForm.model_name}
                                                    onChange={e => setCloudForm({ ...cloudForm, model_name: e.target.value })}
                                                    placeholder={t('settings.asr.customModelPlaceholder')}
                                                    className="w-full px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-md text-sm font-mono focus:border-[var(--color-primary)] outline-none"
                                                    autoFocus
                                                />
                                                <div className="text-xs text-[var(--color-text-muted)] mt-1">
                                                    {t('settings.asr.customModelHint')}
                                                </div>
                                            </div>
                                        )
                                    }
                                    return null
                                })()}

                                <div className="text-xs text-[var(--color-text-muted)] mt-1 flex flex-col gap-1">
                                    <div className="flex items-center gap-1.5">
                                        <Icons.Zap className="w-3 h-3 text-amber-500" />
                                        <span>{t('settings.asr.realtimeHint')}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Icons.Cpu className="w-3 h-3 text-blue-500" />
                                        <span>{t('settings.asr.multimodalHint')}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                            <button
                                onClick={() => setShowModelForm(false)}
                                className="px-4 py-2 text-sm bg-[var(--color-border)] rounded-lg hover:opacity-80"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={handleSaveModel}
                                disabled={createModelMutation.isPending || updateModelMutation.isPending}
                                className="px-4 py-2 text-sm bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                            >
                                {editingModel ? t('common.save') : t('common.save')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmModal
                isOpen={deleteConfirmId !== null}
                title={t('settings.asr.confirmDelete')}
                message={t('settings.asr.confirmDelete')}
                variant="danger"
                onConfirm={() => deleteConfirmId !== null && handleDeleteModel(deleteConfirmId)}
                onCancel={() => setDeleteConfirmId(null)}
            />
        </div>
    )
}

import { useState, useRef, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useChunkedUpload } from '../hooks/useChunkedUpload'
import Icons from './ui/Icons'

interface UploadFileModalProps {
    onClose: () => void
    onSuccess: () => void
}

export default function UploadFileModal({ onClose, onSuccess }: UploadFileModalProps) {
    const { t } = useTranslation()
    useEscapeKey(onClose)
    const [file, setFile] = useState<File | null>(null)
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [taskType, setTaskType] = useState<'transcribe' | 'subtitle'>('transcribe')
    const [showTypeMenu, setShowTypeMenu] = useState(false)
    const typeMenuRef = useRef<HTMLDivElement>(null)

    const [language, setLanguage] = useState('zh')
    const [useUvr, setUseUvr] = useState(false)
    const [prompt, setPrompt] = useState('')

    const [loading, setLoading] = useState(false) // for single file upload
    const [dragActive, setDragActive] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)

    const uploadOptions = { taskType, useUvr, language, prompt }
    const { state: chunkState, start: startChunkUpload, cancel: cancelChunkUpload } = useChunkedUpload()
    const isChunkUploading = chunkState.phase === 'initializing' || chunkState.phase === 'uploading' || chunkState.phase === 'finalizing'

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true)
        } else if (e.type === 'dragleave') {
            setDragActive(false)
        }
    }, [])

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setDragActive(false)

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            setFile(e.dataTransfer.files[0])
        }
    }, [])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0])
        }
    }

    const formatFileSize = (bytes: number): string => {
        if (bytes < 1024) return bytes + ' B'
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
    }

    // Close type menu when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (typeMenuRef.current && !typeMenuRef.current.contains(event.target as Node)) {
                setShowTypeMenu(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [])

    const handleSubmit = async () => {
        if (!file) return

        // 50MB threshold for chunked upload
        if (file.size > 50 * 1024 * 1024) {
            try {
                await startChunkUpload(file, uploadOptions)
                onSuccess()
            } catch (e: any) {
                if (e.message !== 'Aborted' && chunkState.phase !== 'cancelled') {
                    alert(t('upload.uploadFailed') + ': ' + e.message)
                }
            }
            return
        }

        // Small file standard upload
        setLoading(true)

        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('source', file.name)
            formData.append('task_type', taskType)
            formData.append('use_uvr', String(useUvr))
            formData.append('language', language)
            if (prompt) formData.append('prompt', prompt)

            const res = await fetch('/api/transcribe', {
                method: 'POST',
                body: formData,
            })

            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.detail || t('upload.uploadFailed'))
            }

            onSuccess()
        } catch (e) {
            alert(t('upload.uploadFailed') + ': ' + (e as Error).message)
        } finally {
            setLoading(false)
        }
    }

    const disableActions = loading || isChunkUploading

    return (
        <div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
            onClick={onClose}
        >
            <div
                className="bg-[var(--color-card)] rounded-xl w-full max-w-md p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                    <Icons.Upload className="w-5 h-5 text-[var(--color-primary)]" />
                    {t('upload.title')}
                </h3>
                <p className="text-sm text-[var(--color-text-muted)] mb-4">
                    {t('upload.supportHint')}
                </p>

                {/* Drop Zone */}
                <div
                    onClick={() => inputRef.current?.click()}
                    onDragEnter={handleDrag}
                    onDragLeave={handleDrag}
                    onDragOver={handleDrag}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${dragActive
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10'
                        : 'border-[var(--color-border)] hover:border-[var(--color-text-muted)]'
                        }`}
                >
                    {file ? (
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center justify-center gap-3">
                                <Icons.FileText className="w-6 h-6 text-[var(--color-primary)]" />
                                <div className="text-left w-full max-w-[200px]">
                                    <div className="font-medium truncate">{file.name}</div>
                                    <div className="text-xs text-[var(--color-text-muted)] flex justify-between">
                                        <span>{formatFileSize(file.size)}</span>
                                        {file.size > 50 * 1024 * 1024 && !isChunkUploading && (
                                            <span className="text-[var(--color-primary)] opacity-80 shrink-0 ml-2">Chunked</span>
                                        )}
                                    </div>
                                </div>
                                {!isChunkUploading && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setFile(null) }}
                                        className="text-[var(--color-text-muted)] hover:text-red-500 shrink-0"
                                    >
                                        <Icons.X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>

                            {/* Progress bar for chunked upload */}
                            {isChunkUploading && (
                                <div className="mt-2 w-full text-left bg-[var(--color-bg)] rounded-lg p-3">
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-xs font-medium text-[var(--color-primary)]">
                                            {chunkState.phase === 'finalizing'
                                                ? t('upload.finalizing')
                                                : t('upload.progress', { percent: chunkState.progress, uploaded: formatFileSize(chunkState.uploadedBytes), total: formatFileSize(file.size) })
                                            }
                                        </span>
                                        {chunkState.phase === 'uploading' && (
                                            <span className="text-[10px] text-[var(--color-text-muted)]">
                                                {formatFileSize(chunkState.uploadedBytes)} / {formatFileSize(file.size)}
                                            </span>
                                        )}
                                    </div>
                                    <div className="w-full bg-[var(--color-border)] rounded-full h-1.5 overflow-hidden">
                                        <div
                                            className="bg-[var(--color-primary)] h-1.5 rounded-full transition-all duration-300"
                                            style={{ width: `${chunkState.progress}%` }}
                                        />
                                    </div>
                                    <div className="flex justify-between mt-1 items-start">
                                        <span className="text-[10px] text-[var(--color-text-muted)] whitespace-nowrap overflow-hidden text-ellipsis mr-2">
                                            {chunkState.phase === 'uploading' && t('upload.speed', { speed: chunkState.speed })}
                                        </span>
                                        <span className="text-[10px] text-[var(--color-text-muted)] font-mono whitespace-nowrap shrink-0">
                                            {chunkState.phase === 'uploading' && t('upload.eta', { time: chunkState.eta })}
                                        </span>
                                    </div>
                                    {chunkState.error && (
                                        <div className="text-xs text-red-500 mt-2">{chunkState.error}</div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <>
                            <Icons.UploadCloud className="w-10 h-10 mx-auto mb-2 text-[var(--color-text-muted)] opacity-50" />
                            <p className="text-[var(--color-text-muted)]">{t('upload.dropHint')}</p>
                        </>
                    )}
                </div>
                <input
                    ref={inputRef}
                    type="file"
                    accept="audio/*,video/*"
                    onChange={handleChange}
                    className="hidden"
                />

                {/* Advanced Options Toggle */}
                <div className="mt-4">
                    <button
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors w-full"
                    >
                        <Icons.Settings className="w-4 h-4" />
                        {t('upload.advancedOptions')}
                        {showAdvanced ? (
                            <Icons.ChevronUp className="w-4 h-4 ml-auto" />
                        ) : (
                            <Icons.ChevronDown className="w-4 h-4 ml-auto" />
                        )}
                    </button>

                    <div
                        className={`overflow-hidden transition-all duration-300 ease-in-out ${showAdvanced ? 'max-h-[300px] opacity-100 mt-4' : 'max-h-0 opacity-0'
                            }`}
                    >
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-xs text-[var(--color-text-muted)] block mb-1">{t('upload.languageLabel')}</label>
                                <select
                                    value={language}
                                    onChange={(e) => setLanguage(e.target.value)}
                                    className="w-full px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-sm"
                                >
                                    <option value="zh">{t('addVideo.language.zh')}</option>
                                    <option value="en">{t('addVideo.language.en')}</option>
                                    <option value="ja">{t('addVideo.language.ja')}</option>
                                    <option value="ko">{t('addVideo.language.ko')}</option>
                                    <option value="yue">{t('addVideo.language.yue')}</option>
                                    <option value="auto">{t('addVideo.language.auto')}</option>
                                </select>
                            </div>
                            <div className="flex items-center gap-2 pt-5">
                                {localStorage.getItem('diting_show_uvr5') === 'true' && (
                                    <>
                                        <input
                                            type="checkbox"
                                            id="use-uvr"
                                            checked={useUvr}
                                            onChange={(e) => setUseUvr(e.target.checked)}
                                            className="rounded"
                                        />
                                        <label htmlFor="use-uvr" className="text-sm cursor-pointer">
                                            {t('upload.enableUVR')}
                                        </label>
                                    </>
                                )}
                            </div>
                        </div>

                        <div className="mt-4">
                            <label className="text-xs text-[var(--color-text-muted)] block mb-1">
                                {t('upload.promptLabel')}
                            </label>
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder={t('upload.promptPlaceholder')}
                                className="w-full px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-sm h-16 resize-none"
                            />
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 mt-6">
                    {isChunkUploading ? (
                        <button
                            onClick={cancelChunkUpload}
                            className="px-4 py-2 text-sm text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                            {t('common.cancel')}
                        </button>
                    ) : (
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                        >
                            {t('common.cancel')}
                        </button>
                    )}

                    <div className="relative flex items-center" ref={typeMenuRef}>
                        <button
                            onClick={handleSubmit}
                            disabled={!file || disableActions}
                            className={`px-4 py-2 text-sm bg-[var(--color-primary)] text-white rounded-l-lg hover:bg-[var(--color-primary-hover)] disabled:opacity-50 flex items-center gap-1.5 border-r border-white/20`}
                        >
                            {disableActions ? (
                                <Icons.Loader className="w-4 h-4 animate-spin" />
                            ) : (
                                taskType === 'transcribe' ? (
                                    <Icons.FileText className="w-4 h-4" />
                                ) : (
                                    <Icons.List className="w-4 h-4" />
                                )
                            )}
                            {disableActions ? t('upload.uploading') : t(`upload.outputType.${taskType}`)}
                        </button>
                        <button
                            onClick={() => setShowTypeMenu(!showTypeMenu)}
                            disabled={disableActions}
                            className="px-2 py-2 bg-[var(--color-primary)] text-white rounded-r-lg hover:bg-[var(--color-primary-hover)] disabled:opacity-50"
                        >
                            <Icons.ChevronDown className="w-4 h-4" />
                        </button>

                        {showTypeMenu && (
                            <div className="absolute bottom-full right-0 mb-2 w-48 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg shadow-xl overflow-hidden z-20">
                                <button
                                    onClick={() => {
                                        setTaskType('transcribe')
                                        setShowTypeMenu(false)
                                    }}
                                    className={`w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-bg-hover)] flex items-center gap-2 ${taskType === 'transcribe' ? 'text-[var(--color-primary)] bg-[var(--color-primary)]/5' : ''
                                        }`}
                                >
                                    <Icons.FileText className="w-4 h-4" />
                                    {t('upload.outputType.transcribe')}
                                </button>
                                <button
                                    onClick={() => {
                                        setTaskType('subtitle')
                                        setShowTypeMenu(false)
                                    }}
                                    className={`w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-bg-hover)] flex items-center gap-2 ${taskType === 'subtitle' ? 'text-[var(--color-primary)] bg-[var(--color-primary)]/5' : ''
                                        }`}
                                >
                                    <Icons.List className="w-4 h-4" />
                                    {t('upload.outputType.subtitle')}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { retranscribe } from '../api'
import { useEscapeKey } from '../hooks/useEscapeKey'
import Icons from './ui/Icons'
import type { Video } from '../api/types'

interface RetranscribeModalProps {
    video: Video
    onClose: () => void
    onSuccess: () => void
}

export default function RetranscribeModal({ video, onClose, onSuccess }: RetranscribeModalProps) {
    useEscapeKey(onClose)
    const { t } = useTranslation()
    const [language, setLanguage] = useState('zh')
    const [useUvr, setUseUvr] = useState(false)
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [prompt, setPrompt] = useState('')
    const [outputFormat, setOutputFormat] = useState('text')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    const handleSubmit = async () => {
        setLoading(true)
        setError('')
        try {
            await retranscribe({
                source_id: video.source_id,
                language,
                use_uvr: useUvr,
                prompt: prompt.trim() || undefined,
                output_format: outputFormat,
            })
            onSuccess()
        } catch (e) {
            setError((e as Error).message)
        } finally {
            setLoading(false)
        }
    }

    return createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
            <div
                className="bg-[var(--color-card)] rounded-2xl w-full max-w-md mx-4 overflow-hidden shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-bg)]/50">
                    <h2 className="text-lg font-medium flex items-center gap-2">
                        <Icons.Refresh className="w-5 h-5 text-[var(--color-primary)]" />
                        {t('videoCard.retranscribe')}
                    </h2>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
                        <Icons.X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-5">
                    {/* Video Info */}
                    <div className="flex items-center gap-3 p-3 bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)]">
                        {video.cover ? (
                            <img src={video.cover} alt="" className="w-16 h-10 object-cover rounded-lg shrink-0" />
                        ) : (
                            <div className="w-16 h-10 bg-zinc-700 rounded-lg flex items-center justify-center shrink-0">
                                <Icons.Video className="w-5 h-5 text-zinc-500" />
                            </div>
                        )}
                        <div className="min-w-0">
                            <p className="text-sm font-medium line-clamp-1">{video.title || video.source_id}</p>
                            <p className="text-xs text-[var(--color-text-muted)]">
                                {t('retranscribeModal.newSegmentHint')}
                            </p>
                        </div>
                    </div>

                    {/* Language */}
                    <div className="space-y-1">
                        <label className="text-xs text-[var(--color-text-muted)]">{t('addVideo.languageLabel')}</label>
                        <div className="relative">
                            <select
                                value={language}
                                onChange={(e) => setLanguage(e.target.value)}
                                className="w-full pl-3 pr-8 py-2.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl text-sm appearance-none focus:ring-1 focus:ring-[var(--color-primary)]"
                            >
                                <option value="zh">{t('addVideo.language.zh')}</option>
                                <option value="en">{t('addVideo.language.en')}</option>
                                <option value="ja">{t('addVideo.language.ja')}</option>
                                <option value="ko">{t('addVideo.language.ko')}</option>
                                <option value="yue">{t('addVideo.language.yue')}</option>
                                <option value="auto">{t('addVideo.language.auto')}</option>
                            </select>
                            <Icons.ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
                        </div>
                    </div>

                    {/* Advanced Options */}
                    <div className="border border-[var(--color-border)] rounded-xl overflow-hidden">
                        <button
                            onClick={() => setShowAdvanced(!showAdvanced)}
                            className="w-full px-4 py-3 flex items-center justify-between text-sm bg-[var(--color-bg)]/50 hover:bg-[var(--color-bg)] transition-colors"
                        >
                            <span className="flex items-center gap-2 text-[var(--color-text)]">
                                <Icons.Settings className="w-4 h-4 text-[var(--color-text-muted)]" />
                                {t('addVideo.advancedOptions')}
                            </span>
                            {showAdvanced ? (
                                <Icons.ChevronUp className="w-4 h-4 text-[var(--color-text-muted)]" />
                            ) : (
                                <Icons.ChevronDown className="w-4 h-4 text-[var(--color-text-muted)]" />
                            )}
                        </button>

                        {showAdvanced && (
                            <div className="p-4 space-y-4 bg-[var(--color-bg)]/30 border-t border-[var(--color-border)]">
                                {/* UVR */}
                                {localStorage.getItem('diting_show_uvr5') === 'true' && (
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={useUvr}
                                            onChange={(e) => setUseUvr(e.target.checked)}
                                            className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                                        />
                                        <span className="text-sm">{t('addVideo.enableUVR')}</span>
                                    </label>
                                )}

                                {/* Output Format */}
                                <div className="space-y-1">
                                    <label className="text-xs text-[var(--color-text-muted)] flex justify-between">
                                        <span>{t('addVideo.formatLabel')}</span>
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={outputFormat}
                                            onChange={(e) => setOutputFormat(e.target.value)}
                                            className="w-full pl-3 pr-8 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-sm appearance-none focus:ring-1 focus:ring-[var(--color-primary)] focus:outline-none"
                                        >
                                            <option value="text">{t('addVideo.format.text')}</option>
                                            <option value="srt">{t('addVideo.format.srt')}</option>
                                            <option value="srt_char">{t('addVideo.format.srt_char')}</option>
                                        </select>
                                        <Icons.ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
                                    </div>
                                </div>

                                {/* Prompt */}
                                <div className="space-y-1">
                                    <label className="text-xs text-[var(--color-text-muted)]">{t('retranscribeModal.promptLabel')}</label>
                                    <textarea
                                        value={prompt}
                                        onChange={(e) => setPrompt(e.target.value)}
                                        placeholder={t('retranscribeModal.promptPlaceholder')}
                                        rows={2}
                                        className="w-full px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-sm resize-none focus:ring-1 focus:ring-[var(--color-primary)] focus:outline-none"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3">
                            <Icons.AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                            <p className="text-sm text-red-500">{error}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-[var(--color-border)] flex gap-3 bg-[var(--color-bg)]/50">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-3 rounded-xl text-sm font-medium bg-[var(--color-bg)] border border-[var(--color-border)] hover:bg-[var(--color-card)] transition-colors"
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading}
                        className="flex-1 px-4 py-3 rounded-xl text-sm font-medium bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-50 transition-all shadow-lg shadow-[var(--color-primary)]/20 flex items-center justify-center gap-2"
                    >
                        {loading && <Icons.Loader className="w-4 h-4 animate-spin" />}
                        {!loading && <Icons.Refresh className="w-4 h-4" />}
                        {t('videoCard.retranscribe')}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )
}

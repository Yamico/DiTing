import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { transcribeBilibili, transcribeYoutube, transcribeDouyin, transcribeNetwork, getPrompts } from '../api'
import type { Prompt } from '../api/types'
import { useEscapeKey } from '../hooks/useEscapeKey'
import Icons from './ui/Icons'

interface AddVideoModalProps {
    onClose: () => void
    onSuccess: () => void
}

// Common media file extensions
const MEDIA_EXTENSIONS = ['.mp4', '.mp3', '.wav', '.m4a', '.webm', '.ogg', '.flac', '.aac']

// URL pattern matching with B站短链接支持
function detectPlatform(url: string): 'bilibili' | 'youtube' | 'douyin' | 'network' | null {
    url = url.trim()

    // Check for direct media URLs first
    const urlLower = url.toLowerCase()

    // Direct media file extensions
    if (MEDIA_EXTENSIONS.some(ext => urlLower.endsWith(ext) || urlLower.includes(ext + '?'))) {
        return 'network'
    }

    // Douyin CDN direct links (treated as network, not douyin)
    if (urlLower.includes('douyin.com/aweme/v1/play') || urlLower.includes('bytecdn.cn')) {
        return 'network'
    }

    // Bilibili (including short links)
    if (url.includes('bilibili.com') || url.includes('b23.tv') || url.match(/^BV[a-zA-Z0-9]+$/)) {
        return 'bilibili'
    }

    // YouTube
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
        return 'youtube'
    }

    // Douyin page links (not direct CDN)
    if (url.includes('douyin.com') || url.includes('iesdouyin.com')) {
        return 'douyin'
    }

    // Generic HTTP/HTTPS media URL heuristic
    if ((url.startsWith('http://') || url.startsWith('https://')) &&
        !url.includes('bilibili') && !url.includes('youtube') && !url.includes('douyin')) {
        // Assume it's a direct media link
        return 'network'
    }

    return null
}

export default function AddVideoModal({ onClose, onSuccess }: AddVideoModalProps) {
    useEscapeKey(onClose)
    const { t } = useTranslation()
    const [mode, setMode] = useState<'transcribe' | 'cache' | 'bookmark'>('transcribe')
    const [url, setUrl] = useState('')
    const [useUvr, setUseUvr] = useState(false)
    const [subtitleMode, setSubtitleMode] = useState<'auto' | 'only_sub' | 'force_asr'>('auto')
    const [showAdvanced, setShowAdvanced] = useState(false)
    const [showHintDetails, setShowHintDetails] = useState(false)
    const [language, setLanguage] = useState('zh')
    const [quality, setQuality] = useState('best')
    const [outputFormat, setOutputFormat] = useState('text') // text | srt | srt_char
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [clipboardHint, setClipboardHint] = useState('')
    const [autoAnalyze, setAutoAnalyze] = useState(() => localStorage.getItem('diting_auto_analyze') === 'true')
    const [selectedPromptId, setSelectedPromptId] = useState<number | ''>('')
    const [prompts, setPrompts] = useState<Prompt[]>([])
    const [stripSubtitle, setStripSubtitle] = useState(true)
    const inputRef = useRef<HTMLInputElement>(null)

    // Load prompts
    useEffect(() => {
        getPrompts().then(data => {
            setPrompts(data)
            if (data && data.length > 0 && data[0]?.id) {
                // Ensure the most used prompt is selected by default
                setSelectedPromptId(data[0].id)
            }
        }).catch(err => console.error("Failed to load prompts:", err))
    }, [])

    // Helper: extract a clean URL from clipboard text (handles share text like B站/抖音)
    const extractUrl = (text: string): string => {
        const b23Match = text.match(/https?:\/\/b23\.tv\/[a-zA-Z0-9]+(?:\?[^\s]*)?/)
        if (b23Match) return b23Match[0]
        const biliMatch = text.match(/https?:\/\/(?:www\.)?bilibili\.com\/video\/[a-zA-Z0-9]+\/?(?:\?[^\s]*)?/)
        if (biliMatch) return biliMatch[0]
        // Douyin short link (v.douyin.com/xxx)
        const dyShortMatch = text.match(/https?:\/\/v\.douyin\.com\/[a-zA-Z0-9]+\/?/)
        if (dyShortMatch) return dyShortMatch[0]
        // Douyin full link (www.douyin.com/video/xxx)
        const dyFullMatch = text.match(/https?:\/\/(?:www\.)?douyin\.com\/video\/\d+\/?/)
        if (dyFullMatch) return dyFullMatch[0]
        return text.trim()
    }

    // Auto-read clipboard on modal open (desktop only, silently fails on mobile)
    useEffect(() => {
        const readClipboard = async () => {
            try {
                const text = await navigator.clipboard.readText()
                if (!text?.trim()) return
                const cleaned = extractUrl(text)
                if (detectPlatform(cleaned)) {
                    setUrl(cleaned)
                    setClipboardHint(t('addVideo.clipboardAutoFilled'))
                    setTimeout(() => setClipboardHint(''), 3000)
                }
            } catch {
                // Clipboard API unavailable (mobile/non-HTTPS) — silently ignore
            }
        }
        readClipboard()
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

    // Handle native paste event (works on ALL platforms including mobile)
    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault()
        const text = e.clipboardData.getData('text')
        if (!text?.trim()) return
        const cleaned = extractUrl(text)
        setUrl(cleaned)
    }

    // Paste button: try Clipboard API, fallback to focusing input for native paste
    // IMPORTANT: must be synchronous to preserve user-gesture context on mobile
    const handlePasteFromClipboard = () => {
        // Check synchronously if Clipboard API is available (requires secure context/HTTPS)
        if (typeof navigator.clipboard?.readText === 'function') {
            navigator.clipboard.readText().then(text => {
                if (text?.trim()) {
                    const cleaned = extractUrl(text)
                    setUrl(cleaned)
                    // Auto-switch to bookmark if Douyin
                    if (detectPlatform(cleaned) === 'douyin') {
                        setMode('bookmark')
                    }
                }
            }).catch(() => {
                // Permission denied — can't refocus here (gesture context already lost)
            })
            return
        }
        // Clipboard API not available (mobile/HTTP) — focus input immediately
        // This runs synchronously within the click gesture, so focus() works on mobile
        if (inputRef.current) {
            inputRef.current.focus()
            inputRef.current.setSelectionRange(0, inputRef.current.value.length)
        }
    }

    const platform = url ? detectPlatform(url) : null

    // Auto-switch mode when url is manual-typed
    useEffect(() => {
        if (platform === 'douyin' && mode !== 'bookmark') {
            setMode('bookmark');
        }
    }, [platform]);

    const handleSubmit = async () => {
        if (!url.trim()) {
            setError(t('addVideo.enterUrl'))
            return
        }

        if (!platform) {
            setError(t('addVideo.unsupportedFormat'))
            return
        }

        setLoading(true)
        setError('')

        try {
            // Determine parameters based on mode
            const task_type = mode === 'cache' ? 'cache_only' : (outputFormat === 'text' ? 'transcribe' : 'subtitle')
            const isBookmark = mode === 'bookmark'

            const request = {
                url: url.trim(),
                use_uvr: useUvr,
                language,
                task_type: task_type as 'transcribe' | 'subtitle' | 'cache_only',
                quality,
                output_format: outputFormat,
                bookmark_only: isBookmark,
                only_get_subtitles: subtitleMode === 'only_sub',
                force_transcription: subtitleMode === 'force_asr',
                auto_analyze_prompt: autoAnalyze && selectedPromptId ? prompts.find(p => p.id === selectedPromptId)?.content : undefined,
                auto_analyze_prompt_id: autoAnalyze && typeof selectedPromptId === 'number' ? selectedPromptId : undefined,
                auto_analyze_strip_subtitle: autoAnalyze ? stripSubtitle : undefined
            }

            if (platform === 'bilibili') {
                // Extract BVID if present to ensure standardized source_id
                const bvMatch = url.match(/(BV[a-zA-Z0-9]{10})/)
                if (bvMatch) {
                    // Start task with explicit source_id 
                    await transcribeBilibili({ ...request, source_id: bvMatch[1] })
                } else {
                    await transcribeBilibili(request)
                }
            } else if (platform === 'youtube') {
                await transcribeYoutube(request)
            } else if (platform === 'douyin') {
                await transcribeDouyin(request)
            } else if (platform === 'network') {
                await transcribeNetwork(request)
            }

            onSuccess()
        } catch (e) {
            setError((e as Error).message)
        } finally {
            setLoading(false)
        }
    }

    const platformBadge = () => {
        if (!platform) return null
        const badges: Record<string, { icon: string; name: string; color: string }> = {
            bilibili: { icon: '📺', name: t('dashboard.sourceType.bilibili'), color: 'bg-pink-500/20 text-pink-400' },
            youtube: { icon: '▶️', name: t('dashboard.sourceType.youtube'), color: 'bg-red-500/20 text-red-400' },
            douyin: { icon: '🎵', name: t('dashboard.sourceType.douyin'), color: 'bg-cyan-500/20 text-cyan-400' },
            network: { icon: '🌐', name: t('dashboard.sourceType.network'), color: 'bg-orange-500/20 text-orange-400' },
        }
        const b = badges[platform]
        if (!b) return null
        return (
            <span className={`px-2 py-1 rounded text-xs ${b.color}`}>
                {b.icon} {b.name}
            </span>
        )
    }

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
            <div
                className="bg-[var(--color-card)] rounded-2xl w-full max-w-lg mx-4 overflow-hidden shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-bg)]/50">
                    <h2 className="text-lg font-medium flex items-center gap-2">
                        <Icons.Plus className="w-5 h-5 text-[var(--color-primary)]" />
                        {t('addVideo.title')}
                    </h2>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
                        <Icons.X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* URL Input */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-sm font-medium text-[var(--color-text-muted)]">{t('addVideo.urlLabel')}</label>
                            {platform && platformBadge()}
                        </div>
                        <div className="relative">
                            <input
                                ref={inputRef}
                                type="text"
                                value={url}
                                onPaste={handlePaste}
                                onChange={(e) => {
                                    const val = e.target.value
                                    const cleaned = extractUrl(val)
                                    setUrl(cleaned !== val.trim() ? cleaned : val)
                                }}
                                placeholder={t('addVideo.urlPlaceholder')}
                                className="w-full pl-10 pr-10 py-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/50 transition-all font-mono text-sm"
                            />
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
                                <Icons.ExternalLink className="w-4 h-4" />
                            </div>
                            <button
                                type="button"
                                onClick={handlePasteFromClipboard}
                                title={t('addVideo.pasteFromClipboard')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors"
                            >
                                <Icons.Clipboard className="w-4 h-4" />
                            </button>
                        </div>
                        {clipboardHint && (
                            <p className="text-xs text-green-500 flex items-center gap-1 animate-fade-in">
                                <Icons.Check className="w-3 h-3" />
                                {clipboardHint}
                            </p>
                        )}
                    </div>

                    {/* Mode Selector */}
                    <div className="flex bg-[var(--color-bg)] p-1 rounded-xl border border-[var(--color-border)]">
                        <button
                            onClick={() => setMode('transcribe')}
                            disabled={platform === 'douyin'}
                            className={`flex-1 py-2 text-sm font-medium rounded-lg flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${mode === 'transcribe'
                                ? 'bg-[var(--color-card)] text-[var(--color-primary)] shadow-sm'
                                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                                }`}
                        >
                            <Icons.Play className="w-3.5 h-3.5" />
                            {t('addVideo.mode.transcribe')}
                        </button>
                        <button
                            onClick={() => setMode('cache')}
                            disabled={platform === 'douyin'}
                            className={`flex-1 py-2 text-sm font-medium rounded-lg flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed ${mode === 'cache'
                                ? 'bg-[var(--color-card)] text-blue-500 shadow-sm'
                                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                                }`}
                        >
                            <Icons.Download className="w-3.5 h-3.5" />
                            {t('addVideo.mode.cache')}
                        </button>
                        <button
                            onClick={() => setMode('bookmark')}
                            className={`flex-1 py-2 text-sm font-medium rounded-lg flex items-center justify-center gap-1.5 transition-all ${mode === 'bookmark'
                                ? 'bg-[var(--color-card)] text-orange-500 shadow-sm'
                                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                                }`}
                        >
                            <Icons.Bookmark className="w-3.5 h-3.5" />
                            {t('addVideo.mode.bookmark')}
                        </button>
                    </div>

                    {/* Platform Hint (Only for Douyin) */}
                    {platform === 'douyin' && (
                        <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg overflow-hidden">
                            <div className="w-full p-3 flex items-start gap-3 text-left">
                                <Icons.Info className="w-5 h-5 text-cyan-500 shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <p className="text-sm text-cyan-600 dark:text-cyan-400">
                                        {t('addVideo.douyinHint')}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Options Area */}
                    {(mode === 'transcribe' || mode === 'cache') && (
                        <div className="space-y-4">
                            {/* Transcribe Mode Hint (Only for Bilibili/YouTube) */}
                            {mode === 'transcribe' && (platform === 'bilibili' || platform === 'youtube') && (
                                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg overflow-hidden">
                                    <button
                                        onClick={() => setShowHintDetails(!showHintDetails)}
                                        className="w-full p-3 flex items-start gap-3 text-left hover:bg-blue-500/5 transition-colors"
                                    >
                                        <Icons.Info className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                                        <div className="flex-1">
                                            <p className="text-sm text-blue-400">
                                                {t('addVideo.subtitlePriorityHint')}
                                            </p>
                                        </div>
                                        {showHintDetails ? (
                                            <Icons.ChevronUp className="w-4 h-4 text-blue-500/70 mt-0.5" />
                                        ) : (
                                            <Icons.ChevronDown className="w-4 h-4 text-blue-500/70 mt-0.5" />
                                        )}
                                    </button>

                                    <div
                                        className={`overflow-hidden transition-all duration-300 ease-in-out ${showHintDetails ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'
                                            }`}
                                    >
                                        <div className="px-3 pb-3 pl-11">
                                            <p className="text-xs text-blue-400/80 leading-relaxed">
                                                {t('addVideo.forceASRHint')}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Quality Selection (Cache Mode Only) */}
                            {mode === 'cache' && (
                                <div className="space-y-1">
                                    <label className="text-xs text-[var(--color-text-muted)]">{t('addVideo.qualityLabel')}</label>
                                    <div className="relative">
                                        <select
                                            value={quality}
                                            onChange={(e) => setQuality(e.target.value)}
                                            className="w-full pl-3 pr-8 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-sm appearance-none focus:ring-1 focus:ring-[var(--color-primary)]"
                                        >
                                            <option value="best">{t('addVideo.quality.best')}</option>
                                            <option value="medium">{t('addVideo.quality.medium')}</option>
                                            <option value="worst">{t('addVideo.quality.worst')}</option>
                                            <option value="audio">{t('addVideo.quality.audio')}</option>
                                        </select>
                                        <Icons.ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
                                    </div>
                                </div>
                            )}

                            {/* Advanced Options for Transcribe Mode */}
                            {mode === 'transcribe' && (
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
                                            {/* Language */}
                                            <div className="space-y-1">
                                                <label className="text-xs text-[var(--color-text-muted)]">{t('addVideo.languageLabel')}</label>
                                                <div className="relative">
                                                    <select
                                                        value={language}
                                                        onChange={(e) => setLanguage(e.target.value)}
                                                        className="w-full pl-3 pr-8 py-2 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg text-sm appearance-none focus:ring-1 focus:ring-[var(--color-primary)]"
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
                                                <p className="text-[10px] text-[var(--color-text-muted)] leading-tight">{t('addVideo.languageHint')}</p>
                                            </div>

                                            {/* Subtitle Mode */}
                                            <div className="space-y-1 mt-2">
                                                <label className="text-xs text-[var(--color-text-muted)]">{t('addVideo.subtitleModeLabel')}</label>
                                                <div className="relative">
                                                    <select
                                                        value={subtitleMode}
                                                        onChange={(e) => setSubtitleMode(e.target.value as any)}
                                                        className="w-full pl-3 pr-8 py-2 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg text-sm appearance-none focus:ring-1 focus:ring-[var(--color-primary)]"
                                                    >
                                                        <option value="auto">{t('addVideo.subtitleMode.auto')}</option>
                                                        <option value="only_sub">{t('addVideo.subtitleMode.only_sub')}</option>
                                                        <option value="force_asr">{t('addVideo.subtitleMode.force_asr')}</option>
                                                    </select>
                                                    <Icons.ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
                                                </div>
                                                <p className="text-[10px] text-[var(--color-text-muted)] leading-tight mt-1">
                                                    {subtitleMode === 'auto' && t('addVideo.subtitleModeHint.auto')}
                                                    {subtitleMode === 'only_sub' && t('addVideo.subtitleModeHint.only_sub')}
                                                    {subtitleMode === 'force_asr' && t('addVideo.subtitleModeHint.force_asr')}
                                                </p>
                                            </div>

                                            {/* Output Format (Segmented Control) */}
                                            {subtitleMode !== 'only_sub' && (
                                                <div className="space-y-1 mt-4">
                                                    <label className="text-xs text-[var(--color-text-muted)]">{t('addVideo.formatLabel')}</label>
                                                    <div className="flex bg-[var(--color-card)] p-1 rounded-lg border border-[var(--color-border)]">
                                                        {[
                                                            { id: 'text', label: t('addVideo.format.text') },
                                                            { id: 'srt', label: t('addVideo.format.srt') },
                                                            { id: 'srt_char', label: t('addVideo.format.srt_char') }
                                                        ].map((opt) => (
                                                            <button
                                                                key={opt.id}
                                                                onClick={() => setOutputFormat(opt.id)}
                                                                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${outputFormat === opt.id
                                                                    ? 'bg-[var(--color-primary)] text-white shadow-sm'
                                                                    : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                                                                    }`}
                                                            >
                                                                {opt.label.split(' ')[0]} {/* Simplified label */}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* UVR Checkbox */}
                                            {localStorage.getItem('diting_show_uvr5') === 'true' && (
                                                <label className="flex items-center gap-2 cursor-pointer mt-4">
                                                    <input
                                                        type="checkbox"
                                                        checked={useUvr}
                                                        onChange={(e) => setUseUvr(e.target.checked)}
                                                        className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                                                    />
                                                    <span className="text-sm">{t('addVideo.enableUVR')}</span>
                                                </label>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Auto Analyze — outside advanced options, visible for all transcribe sub-modes */}
                    {mode === 'transcribe' && (
                        <div className="space-y-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={autoAnalyze}
                                    onChange={(e) => {
                                        const checked = e.target.checked
                                        setAutoAnalyze(checked)
                                        localStorage.setItem('diting_auto_analyze', checked ? 'true' : 'false')
                                    }}
                                    className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                                />
                                <span className="text-sm font-medium">{t('addVideo.autoAnalyze')}</span>
                            </label>

                            {autoAnalyze && (
                                <div className="space-y-2 pl-6">
                                    {/* Prompt dropdown */}
                                    <select
                                        value={selectedPromptId}
                                        onChange={(e) => setSelectedPromptId(e.target.value ? Number(e.target.value) : '')}
                                        className="w-full px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-sm focus:ring-1 focus:ring-[var(--color-primary)] focus:outline-none"
                                    >
                                        <option value="">{t('addVideo.selectPrompt')}</option>
                                        {prompts.map(p => (
                                            <option key={p.id} value={p.id} title={p.content}>
                                                {p.name}{p.use_count > 0 ? ` (${p.use_count})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    {/* Strip subtitle preprocessing */}
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={stripSubtitle}
                                            onChange={(e) => setStripSubtitle(e.target.checked)}
                                            className="w-4 h-4 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]"
                                        />
                                        <span className="text-xs text-[var(--color-text-muted)]">{t('addVideo.stripSubtitle')}</span>
                                    </label>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3">
                            <Icons.AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                            <p className="text-sm text-red-500">{error}</p>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="px-6 py-4 border-t border-[var(--color-border)] flex gap-3 bg-[var(--color-bg)]/50">
                    <button
                        onClick={handleSubmit}
                        disabled={loading || !platform || (platform === 'douyin' && mode !== 'bookmark')}
                        className={`flex-1 px-4 py-3 rounded-xl font-medium disabled:opacity-50 transition-all shadow-lg flex items-center justify-center gap-2 ${mode === 'transcribe'
                            ? 'bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)] shadow-[var(--color-primary)]/20'
                            : mode === 'cache'
                                ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-500/20'
                                : 'bg-[var(--color-card)] text-[var(--color-text)] border border-[var(--color-border)] hover:bg-[var(--color-bg)]'
                            }`}
                    >
                        {loading && <Icons.Loader className="w-5 h-5 animate-spin" />}
                        {!loading && mode === 'transcribe' && <Icons.Play className="w-5 h-5" />}
                        {!loading && mode === 'cache' && <Icons.Download className="w-5 h-5" />}
                        {!loading && mode === 'bookmark' && <Icons.Bookmark className="w-5 h-5" />}

                        <span>
                            {mode === 'transcribe' && t('addVideo.startTranscribe')}
                            {mode === 'cache' && t('addVideo.startCache')}
                            {mode === 'bookmark' && t('addVideo.addToLibrary')}
                        </span>
                    </button>
                </div>
            </div>
        </div>
    )
}

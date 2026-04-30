/**
 * useTranscriptionPrefs — 集中管理转录偏好的持久化
 *
 * 读取时从 localStorage 加载上次值；提交转录成功后调用 saveAll() 持久化。
 */
import { useState, useCallback } from 'react'

const KEYS = {
    language: 'diting_pref_language',
    subtitleMode: 'diting_pref_subtitle_mode',
    outputFormat: 'diting_pref_output_format',
    autoAnalyze: 'diting_auto_analyze',
    promptId: 'diting_pref_prompt_id',
    stripSubtitle: 'diting_pref_strip_subtitle',
    autoGenerateNote: 'diting_auto_generate_note',
    noteStyle: 'diting_pref_note_style',
    noteScreenshotDensity: 'diting_pref_note_screenshot_density',
} as const

function load<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key)
        if (raw === null) return fallback
        // boolean
        if (fallback === true || fallback === false) return (raw === 'true') as unknown as T
        // number
        if (typeof fallback === 'number') {
            const n = Number(raw)
            return (isNaN(n) ? fallback : n) as unknown as T
        }
        return raw as unknown as T
    } catch {
        return fallback
    }
}

export function useTranscriptionPrefs() {
    const [language, setLanguage] = useState(() => load(KEYS.language, 'zh'))
    const [subtitleMode, setSubtitleMode] = useState<'auto' | 'only_sub' | 'force_asr'>(
        () => load(KEYS.subtitleMode, 'auto') as 'auto' | 'only_sub' | 'force_asr'
    )
    const [outputFormat, setOutputFormat] = useState(() => load(KEYS.outputFormat, 'text'))
    const [autoAnalyze, setAutoAnalyze] = useState(() => load(KEYS.autoAnalyze, false))
    const [selectedPromptId, setSelectedPromptId] = useState<number | ''>(() => {
        const raw = localStorage.getItem(KEYS.promptId)
        if (raw === null || raw === '') return ''
        const n = Number(raw)
        return isNaN(n) ? '' : n
    })
    const [stripSubtitle, setStripSubtitle] = useState(() => load(KEYS.stripSubtitle, true))
    const [autoGenerateNote, setAutoGenerateNote] = useState(() => load(KEYS.autoGenerateNote, false))
    const [noteStyle, setNoteStyle] = useState<'concise' | 'detailed' | 'outline'>(
        () => load(KEYS.noteStyle, 'detailed') as 'concise' | 'detailed' | 'outline'
    )
    const [noteScreenshotDensity, setNoteScreenshotDensity] = useState<'' | 'few' | 'moderate' | 'dense'>(
        () => load(KEYS.noteScreenshotDensity, '') as '' | 'few' | 'moderate' | 'dense'
    )

    /** 提交成功后调用，把当前偏好全部持久化 */
    const saveAll = useCallback(() => {
        localStorage.setItem(KEYS.language, language)
        localStorage.setItem(KEYS.subtitleMode, subtitleMode)
        localStorage.setItem(KEYS.outputFormat, outputFormat)
        localStorage.setItem(KEYS.autoAnalyze, autoAnalyze ? 'true' : 'false')
        localStorage.setItem(KEYS.promptId, String(selectedPromptId))
        localStorage.setItem(KEYS.stripSubtitle, stripSubtitle ? 'true' : 'false')
        localStorage.setItem(KEYS.autoGenerateNote, autoGenerateNote ? 'true' : 'false')
        localStorage.setItem(KEYS.noteStyle, noteStyle)
        localStorage.setItem(KEYS.noteScreenshotDensity, noteScreenshotDensity)
    }, [language, subtitleMode, outputFormat, autoAnalyze, selectedPromptId, stripSubtitle, autoGenerateNote, noteStyle, noteScreenshotDensity])

    return {
        language, setLanguage,
        subtitleMode, setSubtitleMode,
        outputFormat, setOutputFormat,
        autoAnalyze, setAutoAnalyze,
        selectedPromptId, setSelectedPromptId,
        stripSubtitle, setStripSubtitle,
        autoGenerateNote, setAutoGenerateNote,
        noteStyle, setNoteStyle,
        noteScreenshotDensity, setNoteScreenshotDensity,
        saveAll,
    }
}

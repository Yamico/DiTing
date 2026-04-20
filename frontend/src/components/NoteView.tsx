import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { useTranslation } from 'react-i18next'

import type { Segment, VideoNote, LLMProvider, Task, Video } from '../api/types'
import {
    getNotes, generateNote, updateNote, resetNote, activateNote, deleteNote,
    getLLMProviders, getTasks, cancelTask, retranscribe, uploadNoteScreenshot
} from '../api/client'
import { useToast } from '../contexts/ToastContext'
import Icons from './ui/Icons'
import { preprocessLaTeX } from '../utils/markdown'
import { useNoteStreamObserver } from '../hooks/useNoteStreamObserver'
import {
    loadPreferredLLMModelId,
    resolvePreferredLLMModelId,
    savePreferredLLMModelId,
} from '../utils/preferredLLMModel'

interface NoteViewProps {
    sourceId: string
    segments: Segment[]
    video?: Video
    onSeek: (timeSeconds: number) => void
    playerRef?: React.RefObject<HTMLVideoElement | HTMLAudioElement>
    onOpenMindmap?: () => void
    onOpenDetail?: () => void
    /** Imperative handle: set to a fn to scroll the note to a heading by text */
    scrollToHeadingRef?: React.MutableRefObject<((headingText: string) => void) | null>
    /** Fired when the user scrolls to a different heading */
    onActiveHeadingChange?: (headingText: string | null) => void
    isZenMode?: boolean
    zenToolbarMode?: 'tools' | 'tabs'
    onToggleZenToolbar?: (mode: 'tools' | 'tabs') => void
    onExitZenMode?: () => void
}

const REMARK_PLUGINS = [remarkGfm, remarkMath]

interface TocItem {
    level: number  // 1=h1, 2=h2, 3=h3
    text: string
    id: string
    lineNumber: number  // 1-indexed line number in the markdown source
}

/** Parse "hh:mm:ss" or "mm:ss" → seconds */
function parseTimestamp(ts: string): number {
    const parts = ts.split(':').map(Number)
    if (parts.length === 3) return (parts[0]! * 3600) + (parts[1]! * 60) + parts[2]!
    if (parts.length === 2) return (parts[0]! * 60) + parts[1]!
    return 0
}

/** Format date string for version display */
function fmtDate(iso: string) {
    try { return new Date(iso).toLocaleString() } catch { return iso }
}

/** Extract TOC items from Markdown content */
function extractToc(content: string): TocItem[] {
    const lines = content.split('\n')
    const items: TocItem[] = []
    let idx = 0
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx]!
        const m = line.match(/^(#{1,6})\s+(.+)/)
        if (m) {
            // Strip inline markdown (bold, timestamp emoji, etc.)
            const rawText = m[2]!.replace(/\*\*/g, '').replace(/⏱\s*[\d:]+/g, '').trim()
            items.push({ level: m[1]!.length, text: rawText, id: `note-h-${idx++}`, lineNumber: lineIdx + 1 })
        }
    }
    return items
}

// ---- TOC Sub-component ----
const TOC_MIN_WIDTH = 120
const TOC_MAX_WIDTH = 480
const TOC_DEFAULT_WIDTH = 180

function NoteTOC({ items, activeId, onItemClick, isZenMode, showToc }: {
    items: TocItem[]
    activeId: string | null
    onItemClick: (id: string) => void
    isZenMode?: boolean
    showToc: boolean
}) {
    const { t } = useTranslation()
    const [collapsed, _setCollapsed] = useState(() => {
        return localStorage.getItem('note-toc-collapsed') === 'true'
    })
    
    const setCollapsed = useCallback((val: React.SetStateAction<boolean>) => {
        _setCollapsed(prev => {
            const next = typeof val === 'function' ? val(prev) : val
            localStorage.setItem('note-toc-collapsed', String(next))
            return next
        })
    }, [])
    const [tocWidth, setTocWidth] = useState(() => {
        const saved = localStorage.getItem('note-toc-width')
        return saved ? Math.max(TOC_MIN_WIDTH, Math.min(TOC_MAX_WIDTH, Number(saved))) : TOC_DEFAULT_WIDTH
    })
    const [tocHeight, setTocHeight] = useState<number | undefined>(() => {
        const saved = localStorage.getItem('note-toc-height')
        return saved ? Number(saved) : undefined
    })

    const [position, setPosition] = useState<{ right: number; top: number }>(() => {
        const saved = localStorage.getItem('note-toc-position')
        if (saved) {
            try {
                return JSON.parse(saved)
            } catch (e) {}
        }
        return { right: 24, top: 120 } // default right offset 24px, top 120px
    })

    const [isPinned, setIsPinned] = useState<boolean>(() => {
        return localStorage.getItem('note-toc-pinned') !== 'false'
    })

    const isSnappedToEdge = position.right < 40

    // Dynamic max level filter
    const availableMaxLevel = useMemo(() => items.reduce((max, item) => Math.max(max, item.level), 1), [items])
    const [maxLevel, setMaxLevel] = useState(6)

    // Update max level if we switch to a note with shallower headings
    useEffect(() => {
        if (maxLevel > availableMaxLevel) {
            setMaxLevel(availableMaxLevel)
        }
    }, [availableMaxLevel])

    const isDragging = useRef(false)

    const handleDragStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        isDragging.current = true
        const startX = e.clientX
        const startY = e.clientY
        const startWidth = tocWidth
        
        // Grab the container's rendered height as the baseline if it's currently auto
        const container = (e.target as HTMLElement).closest('.note-toc')
        const startHeight = container ? container.getBoundingClientRect().height : (tocHeight || 400)

        // Change cursor to indicate 2D scaling
        document.body.style.cursor = 'nwse-resize'
        document.body.style.userSelect = 'none'

        const onMove = (ev: MouseEvent) => {
            if (!isDragging.current) return
            // Dragging left = wider. Dragging down = taller.
            const deltaX = startX - ev.clientX
            const deltaY = ev.clientY - startY
            
            const newWidth = Math.max(TOC_MIN_WIDTH, Math.min(TOC_MAX_WIDTH, startWidth + deltaX))
            // Apply a minimum height of roughly 150px
            const newHeight = Math.max(150, startHeight + deltaY)
            
            setTocWidth(newWidth)
            setTocHeight(newHeight)
        }
        const onUp = () => {
            isDragging.current = false
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
            // Persist both
            setTocWidth(w => { localStorage.setItem('note-toc-width', String(w)); return w })
            setTocHeight(h => { if (h) localStorage.setItem('note-toc-height', String(h)); return h })
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
    }, [tocWidth, tocHeight])

    const isMoving = useRef(false)
    const handleMoveStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        // Only allow dragging from header element itself, not its button children
        if ((e.target as HTMLElement).tagName.toLowerCase() === 'button' || (e.target as HTMLElement).tagName.toLowerCase() === 'input') return
        
        e.preventDefault()
        e.stopPropagation()
        isMoving.current = true

        const isTouch = 'touches' in e;
        const clientX = isTouch ? ((e as React.TouchEvent).touches[0]?.clientX ?? 0) : (e as React.MouseEvent).clientX
        const clientY = isTouch ? ((e as React.TouchEvent).touches[0]?.clientY ?? 0) : (e as React.MouseEvent).clientY
        
        const startX = clientX
        const startY = clientY
        const startPos = position

        document.body.style.userSelect = 'none'

        const onMove = (ev: MouseEvent | TouchEvent) => {
            if (!isMoving.current) return
            const isTouchEvent = 'touches' in ev;
            const cX = isTouchEvent ? ((ev as TouchEvent).touches[0]?.clientX ?? 0) : (ev as MouseEvent).clientX
            const cY = isTouchEvent ? ((ev as TouchEvent).touches[0]?.clientY ?? 0) : (ev as MouseEvent).clientY
            
            const deltaX = startX - cX
            const deltaY = cY - startY
            
            setPosition({
                right: (startPos?.right ?? 24) + deltaX,
                top: (startPos?.top ?? 120) + deltaY
            })
        }
        
        const onUp = () => {
            isMoving.current = false
            document.body.style.userSelect = ''
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
            window.removeEventListener('touchmove', onMove)
            window.removeEventListener('touchend', onUp)
            
            setPosition((p: { right: number; top: number }) => {
                const snappedPosition = { ...p }
                // Edge Snapping Threshold: 40px
                if (snappedPosition.right < 40) {
                    snappedPosition.right = 16 // Dock back to default right padding
                }
                localStorage.setItem('note-toc-position', JSON.stringify(snappedPosition))
                return snappedPosition
            })
        }
        
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
        window.addEventListener('touchmove', onMove, { passive: false })
        window.addEventListener('touchend', onUp)
    }, [position])

    const handleDoubleClick = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setTocWidth(TOC_DEFAULT_WIDTH)
    }, [])

    if (!showToc || items.length < 2) return null

    // Option 1: Edge Snapped Collapsed Tab
    if (collapsed) {
        return (
            <div 
                className="note-toc-edge-collapsed"
                onClick={() => setCollapsed(false)}
                onMouseEnter={() => {
                    if (!isPinned && isSnappedToEdge) setCollapsed(false)
                }}
                onMouseDown={handleMoveStart}
                onTouchStart={handleMoveStart}
                style={{ top: `${position.top}px` }}
                title={t('detail.aiNotes.tocExpand', '展开目录')}
            >
                <Icons.ChevronLeft className="w-4 h-4 text-[var(--color-primary)] mb-1 opacity-70" />
                <Icons.List />
                <span>{t('detail.aiNotes.toc', '目录')}</span>
            </div>
        )
    }

    return (
        <div
            className={`note-toc ${
                isZenMode 
                    ? 'fixed z-[100] bg-[var(--color-card)]/90 backdrop-blur-md shadow-2xl rounded-xl border opacity-30 hover:opacity-100 transition-opacity duration-300' 
                    : 'fixed z-[40]'
            } ${isSnappedToEdge ? 'note-toc-snapped' : ''}`}
            style={{ width: tocWidth, height: tocHeight, right: `${position.right}px`, top: `${position.top}px` }}
            onMouseLeave={(e) => {
                // Ensure the mouse actually left the entire container, not just moved between children
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    if (!isPinned && isSnappedToEdge && !isDragging.current && !isMoving.current) {
                        setCollapsed(true)
                    }
                }
            }}
        >
            {/* Drag handle on left edge (width) */}
            {!isZenMode && (
                <div
                    className="note-toc-resize-handle"
                    onMouseDown={handleDragStart}
                    onDoubleClick={handleDoubleClick}
                    title={t('detail.aiNotes.tocResizeHint', 'Drag to resize, double-click to reset')}
                />
            )}
            
            {/* 2D Drag handle on bottom-left corner (width & height) */}
            {!isZenMode && (
                <div
                    className="note-toc-resize-handle-corner"
                    onMouseDown={handleDragStart}
                    title={t('detail.aiNotes.tocResizeHint', 'Drag to resize, double-click to reset')}
                />
            )}
            <div className="note-toc-header-container cursor-move" onMouseDown={handleMoveStart} onTouchStart={handleMoveStart}>
                <div
                    className="note-toc-header flex items-center"
                    title={collapsed ? t('detail.aiNotes.tocExpand', '展开目录') : undefined}
                >
                    <Icons.List className="w-3 h-3" />
                    <>
                        <span className="ml-1.5">{t('detail.aiNotes.toc')}</span>
                        <div className="ml-auto flex items-center gap-0.5">
                            <button 
                                onClick={() => setIsPinned(v => {
                                    const next = !v;
                                    localStorage.setItem('note-toc-pinned', String(next));
                                    return next;
                                })} 
                                className={`p-1 hover:bg-[var(--color-bg-muted)] rounded transition-colors ${isPinned ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)] opacity-60'}`} 
                                title={isPinned ? t('detail.aiNotes.tocUnpin', '取消固定 (自动隐藏)') : t('detail.aiNotes.tocPin', '固定目录')}
                            >
                                {isPinned ? <Icons.Pin className="w-3.5 h-3.5" /> : <Icons.PinOff className="w-3.5 h-3.5" />}
                            </button>
                            <button 
                                onClick={() => setCollapsed(v => !v)} 
                                className="p-1 hover:bg-[var(--color-bg-muted)] rounded transition-colors text-[var(--color-text-muted)] hover:text-inherit" 
                                title={t('detail.aiNotes.tocCollapse', '收起目录')}
                            >
                                <Icons.ChevronRight className="w-3.5 h-3.5 transition-transform" />
                            </button>
                        </div>
                    </>
                </div>
                {!collapsed && availableMaxLevel > 1 && (
                    <div className="note-toc-filter px-[10px] pb-2 flex items-center gap-2">
                        <span className="text-[10px] text-[var(--color-primary)] font-medium w-4 shrink-0">H{maxLevel}</span>
                        <input
                            type="range"
                            min="1"
                            max={availableMaxLevel}
                            step="1"
                            value={maxLevel}
                            onChange={(e) => setMaxLevel(Number(e.target.value))}
                            className="note-toc-slider flex-1"
                            title={t('detail.aiNotes.tocFilterHint', `Show headings up to level ${maxLevel}`)}
                        />
                    </div>
                )}
            </div>
            {!collapsed && (
                <ul className="note-toc-list">
                    {items.filter(item => item.level <= maxLevel).map(item => (
                        <li key={item.id}
                            className={`note-toc-item note-toc-item--h${item.level} ${activeId === item.id ? 'active' : ''}`}
                            onClick={() => onItemClick(item.id)}
                            title={item.text}
                        >
                            {item.text}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}

// ---- Generate Config Panel ----
function GeneratePanel({
    style, setStyle,
    selectedModelId, setSelectedModelId,
    screenshotDensity, setScreenshotDensity,
    segments,
    selectedTransVersion, setSelectedTransVersion,
    providers,
    onGenerate,
    onCancel,
    isPending,
    activeTask,
    onCancelTask,
    customPrompt,
    setCustomPrompt,
    showGenStages,
    setShowGenStages,
}: {
    style: string
    setStyle: (s: 'concise' | 'detailed' | 'outline') => void
    selectedModelId: number | ''
    setSelectedModelId: (id: number | '') => void
    screenshotDensity: string
    setScreenshotDensity: (v: string) => void
    segments: Segment[]
    selectedTransVersion: string
    setSelectedTransVersion: (v: string) => void
    providers: LLMProvider[]
    onGenerate: () => void
    onCancel: () => void
    isPending: boolean
    activeTask: Task | null
    onCancelTask: () => void
    customPrompt: string
    setCustomPrompt: (v: string) => void
    showGenStages: boolean
    setShowGenStages: (v: boolean) => void
}) {
    const { t } = useTranslation()
    const [showGenConfig, setShowGenConfig] = useState(false)
    const displayPrompt = activeTask?.meta?.prompt ?? customPrompt
    const displayStyle = activeTask?.meta?.style ?? style
    const displayDensity = activeTask?.meta?.screenshot_density ?? screenshotDensity
    const displayModelId = activeTask?.meta?.llm_model_id ?? selectedModelId
    const displayTransVersion = activeTask?.meta?.transcription_version ?? selectedTransVersion

    const displayModelName = useMemo(() => {
        if (!displayModelId) return ''
        for (const p of providers) {
            const m = p.models.find(mod => mod.id === displayModelId)
            if (m) return m.model_name
        }
        return ''
    }, [displayModelId, providers])

    return (
        <div className="note-gen-panel">
            {!activeTask && (
                <div className="note-gen-panel-body">
                    {/* Style selector */}
                    <div className="note-gen-field">
                        <label className="note-gen-label">{t('detail.aiNotes.style')}</label>
                        <div className="note-gen-segmented">
                            {(['concise', 'detailed', 'outline'] as const).map(s => (
                                <button
                                    key={s}
                                    className={`note-gen-seg-btn ${style === s ? 'active' : ''}`}
                                    onClick={() => setStyle(s)}
                                >
                                    {t(`detail.aiNotes.style${s.charAt(0).toUpperCase() + s.slice(1)}`)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Model selector */}
                    <div className="note-gen-field">
                        <label className="note-gen-label">{t('detail.aiNotes.model')}</label>
                        <select
                            className="note-gen-select"
                            value={selectedModelId}
                            onChange={e => setSelectedModelId(e.target.value ? Number(e.target.value) : '')}
                        >
                            <option value="">{t('detail.aiNotes.defaultModel')}</option>
                            {providers.map(p => (
                                <optgroup key={p.id} label={p.name}>
                                    {p.models?.map(m => (
                                        <option key={m.id} value={m.id}>{m.model_name}</option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                    </div>

                    {/* Transcription source selector (Always visible) */}
                    <div className="note-gen-field">
                        <label className="note-gen-label">{t('detail.aiNotes.transSource')}</label>
                        <select
                            className="note-gen-select"
                            value={selectedTransVersion}
                            onChange={e => setSelectedTransVersion(e.target.value)}
                        >
                            <option value="__all__">{t('detail.aiNotes.transSourceAllConcat', { count: segments.length })}</option>
                            <optgroup label={t('detail.aiNotes.transSourceSegments')}>
                                {segments.map((seg, idx) => {
                                    const timeStr = new Date(seg.timestamp).toLocaleString()
                                    const badge = seg.asr_model ? `[${seg.asr_model}]` : ''
                                    const pinnedStr = seg.is_pinned ? `(${t('detail.aiNotes.transSourcePinned')})` : ''
                                    const label = `Segment ${idx + 1} - ${timeStr} ${badge} ${pinnedStr}`.trim()
                                    return (
                                        <option key={seg.id} value={seg.asr_model || String(seg.id)}>{label}</option>
                                    )
                                })}
                            </optgroup>
                        </select>
                    </div>

                    {/* Screenshot density */}
                    <div className="note-gen-field">
                        <label className="note-gen-label">{t('detail.aiNotes.screenshots')}</label>
                        <div className="note-gen-segmented">
                            {(['', 'few', 'moderate', 'dense'] as const).map(d => (
                                <button
                                    key={d}
                                    className={`note-gen-seg-btn ${screenshotDensity === d ? 'active' : ''}`}
                                    onClick={() => setScreenshotDensity(d)}
                                >
                                    {t(`detail.aiNotes.density${d ? d.charAt(0).toUpperCase() + d.slice(1) : 'Off'}`)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Additional instructions */}
                    <div className="note-gen-field" style={{ flexBasis: '100%' }}>
                        <label className="note-gen-label">{t('detail.aiNotes.customPrompt')}</label>
                        <textarea
                            className="note-gen-textarea"
                            value={customPrompt}
                            onChange={e => setCustomPrompt(e.target.value)}
                            placeholder={t('detail.aiNotes.customPromptPlaceholder')}
                            rows={2}
                        />
                    </div>
                </div>
            )}
            <div
                className={`note-gen-panel-footer`}
                style={activeTask ? { marginTop: 0, paddingTop: 0, borderTop: 'none' } : undefined}
            >
                {activeTask ? (
                    /* ---- Progress view ---- */
                    <div className="note-gen-progress w-full">
                        {/* Config Summary View */}
                        <div className="mb-4 bg-[var(--color-bg-subtle)] rounded-lg text-xs border border-[var(--color-border)] shadow-inner overflow-hidden">
                            <button
                                className="w-full flex items-center justify-between p-2.5 hover:bg-[var(--color-hover-bg)] transition-colors"
                                onClick={() => setShowGenConfig(!showGenConfig)}
                            >
                                <span className="font-medium text-[var(--color-text-muted)] flex items-center gap-1.5">
                                    <Icons.Settings className="w-3.5 h-3.5" />
                                    {t('detail.aiNotes.genParams', '生成参数')}
                                </span>
                                <Icons.ChevronDown className={`w-3.5 h-3.5 text-[var(--color-text-muted)] transition-transform ${showGenConfig ? 'rotate-180' : ''}`} />
                            </button>

                            {showGenConfig && (
                                <div className="p-3 pt-0 flex flex-col gap-2 border-t border-[var(--color-border)] mt-1">
                                    {displayPrompt && (
                                        <div className="flex gap-2 items-start text-opacity-80 pb-2 border-b border-[var(--color-border)]">
                                            <Icons.MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[var(--color-primary)]" />
                                            <span className="break-all whitespace-pre-wrap">{displayPrompt}</span>
                                        </div>
                                    )}
                                    <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] opacity-80 mt-1">
                                        <span className="flex items-center gap-1.5">
                                            <Icons.List className="w-3 h-3 text-[var(--color-primary)] opacity-70" />
                                            {t(`detail.aiNotes.style${displayStyle.charAt(0).toUpperCase() + displayStyle.slice(1)}`)}
                                        </span>
                                        {displayDensity && (
                                            <span className="flex items-center gap-1.5">
                                                <Icons.Camera className="w-3 h-3 text-[var(--color-primary)] opacity-70" />
                                                {t(`detail.aiNotes.density${displayDensity.charAt(0).toUpperCase() + displayDensity.slice(1)}`)}
                                            </span>
                                        )}
                                        {displayTransVersion && (
                                            <span className="flex items-center gap-1.5" title={displayTransVersion}>
                                                <Icons.FileText className="w-3 h-3 text-[var(--color-primary)] opacity-70" />
                                                {displayTransVersion === '__all__' ? t('detail.aiNotes.transSourceAllConcat', { count: segments.length }).split(' ')[0] : 'Segment'}
                                            </span>
                                        )}
                                        <span className="flex items-center gap-1.5">
                                            <Icons.Cpu className="w-3 h-3 text-[var(--color-primary)] opacity-70" />
                                            {displayModelName || t('detail.aiNotes.defaultModel')}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div
                            className="note-gen-progress-bar-wrap cursor-pointer group"
                            onClick={() => setShowGenStages(!showGenStages)}
                            title={t('detail.aiNotes.toggleStages', '点击查看/隐藏各阶段耗时')}
                        >
                            <div
                                className="note-gen-progress-bar"
                                style={{ width: `${activeTask.progress ?? 0}%` }}
                            />
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-white/50 group-hover:text-white/80 transition-colors">
                                <Icons.ChevronRight className={`w-3.5 h-3.5 transition-transform ${showGenStages ? 'rotate-90' : ''}`} />
                            </div>
                        </div>
                        <div className="note-gen-progress-meta">
                            <span className="note-gen-progress-msg flex items-center gap-2">
                                <Icons.Loader className="w-3.5 h-3.5 animate-spin text-[var(--color-primary)] opacity-80" />
                                {activeTask.message || t('detail.aiNotes.genStageProcessing')}
                            </span>
                            <span className="note-gen-progress-pct">{Math.round(activeTask.progress ?? 0)}%</span>
                        </div>

                        {/* Expandable Stages View */}
                        {showGenStages && activeTask.stages && activeTask.stages.length > 0 && (
                            <div className="mt-3 bg-[var(--color-bg-subtle)] rounded-lg p-3 text-xs border border-[var(--color-border)] shadow-inner">
                                <ul className="space-y-1.5">
                                    {activeTask.stages.map((stage, i) => (
                                        <li key={i} className="flex items-center justify-between text-[var(--color-text-muted)]">
                                            <span className="flex items-center gap-2 truncate pr-4">
                                                <Icons.Check className="w-3.5 h-3.5 text-green-500 shrink-0" />
                                                <span className="truncate">{stage.name}</span>
                                            </span>
                                            <span className="font-mono text-[10px] bg-[var(--color-border)] px-1.5 py-0.5 rounded shrink-0">
                                                {stage.duration.toFixed(1)}s
                                            </span>
                                        </li>
                                    ))}
                                    {/* Current active stage indicator */}
                                    {activeTask.status !== 'completed' && activeTask.status !== 'failed' && (
                                        <li className="flex items-center justify-between text-[var(--color-primary)] font-medium pt-1 mt-1 border-t border-[var(--color-border)]">
                                            <span className="flex items-center gap-2 truncate pr-4">
                                                <Icons.Loader className="w-3.5 h-3.5 animate-spin shrink-0" />
                                                <span className="truncate">{activeTask.message || t('detail.aiNotes.genStageProcessing')}</span>
                                            </span>
                                            <span className="font-mono text-[10px] animate-pulse">...</span>
                                        </li>
                                    )}
                                </ul>
                            </div>
                        )}

                        <div className="note-gen-progress-actions mt-3">
                            <button
                                className="note-btn note-btn-secondary"
                                onClick={onCancelTask}
                                style={{ fontSize: '0.78rem', padding: '4px 12px' }}
                            >
                                {t('detail.aiNotes.cancelGenerate')}
                            </button>
                        </div>
                    </div>
                ) : (
                    /* ---- Normal config footer ---- */
                    <>
                        <button className="note-btn note-btn-secondary" onClick={onCancel}>
                            {t('detail.aiNotes.cancel')}
                        </button>
                        <button
                            className="note-btn note-btn-primary"
                            onClick={onGenerate}
                            disabled={isPending}
                        >
                            ✨ {isPending ? t('detail.aiNotes.generating') : t('detail.aiNotes.startGenerate')}
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}

// ---- Main Component ----
export default function NoteView({
    sourceId,
    segments,
    video,
    onSeek,
    playerRef,
    onOpenMindmap: _onOpenMindmap,
    onOpenDetail,
    scrollToHeadingRef,
    onActiveHeadingChange,
    isZenMode,
    zenToolbarMode,
    onToggleZenToolbar,
    onExitZenMode
}: NoteViewProps) {
    const { t } = useTranslation()
    const { showToast } = useToast()
    const queryClient = useQueryClient()
    const contentRef = useRef<HTMLDivElement>(null)

    // UI states
    const [isEditing, setIsEditing] = useState(false)
    const [editContent, setEditContent] = useState('')
    const [style, setStyle] = useState<'concise' | 'detailed' | 'outline'>('detailed')
    const [showVersions, setShowVersions] = useState(false)
    const [showGenPanel, setShowGenPanel] = useState(false)
    const [selectedModelId, setSelectedModelId] = useState<number | ''>('')
    const [screenshotDensity, setScreenshotDensity] = useState('')
    const [selectedTransVersion, setSelectedTransVersion] = useState('')
    const [customPrompt, setCustomPrompt] = useState('')
    const [showGenStages, setShowGenStages] = useState(false)
    const [pendingDelete, setPendingDelete] = useState<number | null>(null)
    const [pendingReset, setPendingReset] = useState<boolean>(false)
    const [activeTocId, setActiveTocId] = useState<string | null>(null)
    const [hideScreenshots, setHideScreenshots] = useState<boolean>(() => localStorage.getItem('note-hide-screenshots') === 'true')
    const [enableInlineScreenshots, setEnableInlineScreenshots] = useState<boolean>(() => localStorage.getItem('note-enable-inline-screenshots') !== 'false') // Default to true
    const [showToc, setShowToc] = useState<boolean>(() => localStorage.getItem('note-show-toc') !== 'false')
    const [isCapturing, setIsCapturing] = useState(false)
    const [expandedVersionId, setExpandedVersionId] = useState<number | null>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    const qkey = ['notes', sourceId]
    const hasSegments = segments.length > 0
    const handleSelectedModelIdChange = useCallback((modelId: number | '') => {
        setSelectedModelId(modelId)
        savePreferredLLMModelId(localStorage, modelId)
    }, [])

    // Auto-select initial transcription version
    useEffect(() => {
        if (!selectedTransVersion && segments.length > 0) {
            const pinned = segments.find(s => s.is_pinned)
            const latest = segments.reduce((prev, current) => (prev.id > current.id) ? prev : current)
            const target = pinned || latest
            if (target) {
                setSelectedTransVersion(target.asr_model || String(target.id))
            }
        }
    }, [segments, selectedTransVersion])

    // Queries

    const { data: notes = [], isLoading } = useQuery<VideoNote[]>({
        queryKey: qkey,
        queryFn: () => getNotes(sourceId),
        enabled: !!sourceId,
    })
    const { data: providers = [] } = useQuery<LLMProvider[]>({
        queryKey: ['llm_providers'],
        queryFn: getLLMProviders,
    })

    const activeNote = notes.find(n => n.is_active) ?? notes[0] ?? null

    useEffect(() => {
        if (providers.length === 0) return

        const storedModelId = loadPreferredLLMModelId(localStorage)
        const resolution = resolvePreferredLLMModelId(providers, storedModelId)

        if (resolution.shouldClearStoredPreference) {
            savePreferredLLMModelId(localStorage, '')
        }

        setSelectedModelId(prev => prev === resolution.selectedModelId ? prev : resolution.selectedModelId)
    }, [providers])

    // Sync edit buffer
    useEffect(() => {
        if (!isEditing && activeNote) setEditContent(activeNote.content)
    }, [activeNote?.id, isEditing])

    // TOC extraction
    const tocItems = useMemo(() =>
        activeNote ? extractToc(activeNote.content) : []
        , [activeNote?.id, activeNote?.content])

    // Expose scrollToHeading imperative handle
    useEffect(() => {
        if (!scrollToHeadingRef) return
        scrollToHeadingRef.current = (headingText: string) => {
            // Strip markdown formatting from search text for comparison
            const normalize = (s: string) =>
                s.replace(/\*\*/g, '').replace(/⏱\s*[\d:]+/g, '').trim().toLowerCase()
            const needle = normalize(headingText)
            const match = tocItems.find(item => normalize(item.text) === needle)
                ?? tocItems.find(item => normalize(item.text).includes(needle))
                ?? tocItems.find(item => needle.includes(normalize(item.text)))
            if (match) {
                const el = document.getElementById(match.id)
                if (el && contentRef.current) {
                    const containerTop = contentRef.current.getBoundingClientRect().top
                    const elTop = el.getBoundingClientRect().top
                    contentRef.current.scrollTo({
                        top: contentRef.current.scrollTop + (elTop - containerTop) - 10,
                        behavior: 'smooth'
                    })
                    setActiveTocId(match.id)
                }
            }
        }
        return () => { if (scrollToHeadingRef) scrollToHeadingRef.current = null }
    }, [tocItems, scrollToHeadingRef])

    const tocLineMap = useMemo(() => {
        const map = new Map<number, string>()
        for (const item of tocItems) {
            map.set(item.lineNumber, item.id)
        }
        return map
    }, [tocItems])

    // Scroll-based active heading tracking
    useEffect(() => {
        const container = contentRef.current
        if (!container || tocItems.length === 0 || isEditing) return

        const handleScroll = () => {
            const offset = 40 // breathing room below top

            let activeId: string | null = tocItems[0]?.id ?? null
            for (const item of tocItems) {
                const el = document.getElementById(item.id)
                if (!el) continue
                // el.offsetTop is relative to the offsetParent; we need position relative to the scroll container
                const elTop = el.getBoundingClientRect().top - container.getBoundingClientRect().top
                if (elTop <= offset) {
                    activeId = item.id
                } else {
                    break
                }
            }
            setActiveTocId(activeId)
        }

        // Run once immediately to set initial active heading
        handleScroll()

        container.addEventListener('scroll', handleScroll, { passive: true })
        return () => container.removeEventListener('scroll', handleScroll)
    }, [tocItems, isEditing, activeNote?.id])

    // Fire callback when active heading changes
    useEffect(() => {
        if (!onActiveHeadingChange) return
        if (!activeTocId) { onActiveHeadingChange(null); return }
        const item = tocItems.find(t => t.id === activeTocId)
        onActiveHeadingChange(item?.text ?? null)
    }, [activeTocId, tocItems, onActiveHeadingChange])

    // Active task progress tracking — survives page refresh via sessionStorage
    const taskStorageKey = `note_task_${sourceId}`
    const [pendingTaskId, _setPendingTaskId] = useState<number | null>(() => {
        const saved = sessionStorage.getItem(taskStorageKey)
        return saved ? Number(saved) : null
    })
    const setPendingTaskId = (id: number | null) => {
        _setPendingTaskId(id)
        if (id === null) sessionStorage.removeItem(taskStorageKey)
        else sessionStorage.setItem(taskStorageKey, String(id))
    }
    // Also open the panel on mount if a task was already in flight
    useEffect(() => {
        if (pendingTaskId !== null) setShowGenPanel(true)
    }, [])

    const { data: tasksMap } = useQuery<Record<string, Task>>({
        queryKey: ['tasks'],
        queryFn: getTasks,
        refetchInterval: 1200,
        enabled: pendingTaskId !== null,
    })

    const activeTask: Task | null = pendingTaskId !== null
        ? (tasksMap?.[String(pendingTaskId)] ?? null)
        : null

    // Stream observer for real-time note generation preview
    const noteStream = useNoteStreamObserver(pendingTaskId)

    // Watch task completion
    useEffect(() => {
        if (!activeTask || pendingTaskId === null) return
        if (activeTask.status === 'completed') {
            setPendingTaskId(null)
            setShowGenPanel(false)
            showToast('success', t('detail.aiNotes.generatedSuccess'))
            // Refresh note list a couple times to catch the new note
            queryClient.invalidateQueries({ queryKey: qkey })
            setTimeout(() => queryClient.invalidateQueries({ queryKey: qkey }), 2500)
        } else if (activeTask.status === 'failed' || activeTask.status === 'cancelled') {
            setPendingTaskId(null)
            showToast('error', t('detail.aiNotes.generateFailed'))
        }
    }, [activeTask?.status, pendingTaskId])

    // Mutations
    const generateMut = useMutation({
        mutationFn: () => generateNote(sourceId, {
            style,
            llmModelId: selectedModelId || undefined,
            screenshotDensity: screenshotDensity || undefined,
            transcriptionVersion: selectedTransVersion || undefined,
            prompt: customPrompt.trim() || undefined,
        }),
        onSuccess: (data) => {
            // data = { status, task_id }
            if ((data as any)?.task_id) {
                setPendingTaskId((data as any).task_id)
            } else {
                // fallback: no task id returned, close immediately
                setShowGenPanel(false)
                showToast('success', t('detail.aiNotes.generatedSuccess'))
                queryClient.invalidateQueries({ queryKey: qkey })
            }
        },
        onError: () => showToast('error', t('detail.aiNotes.generateFailed')),
    })

    const saveMut = useMutation({
        mutationFn: (content: string) => updateNote(activeNote!.id, content),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: qkey }); setIsEditing(false) },
        onError: () => showToast('error', t('detail.aiNotes.saveFailed')),
    })

    const resetMut = useMutation({
        mutationFn: () => resetNote(activeNote!.id),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: qkey }); setPendingReset(false) },
    })

    const activateMut = useMutation({
        mutationFn: (noteId: number) => activateNote(noteId),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: qkey }),
    })

    const deleteMut = useMutation({
        mutationFn: (noteId: number) => deleteNote(noteId),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: qkey }); setPendingDelete(null) },
        onError: () => showToast('error', t('detail.aiNotes.deleteFailed')),
    })

    // Handlers
    const handleStartEdit = () => {
        setEditContent(activeNote?.content ?? '')
        setIsEditing(true)
        setShowGenPanel(false)

        // Find line number of the active TOC item to scroll to
        let targetLine = 0
        if (activeTocId && tocItems.length > 0) {
            const activeItem = tocItems.find(t => t.id === activeTocId)
            if (activeItem) {
                targetLine = activeItem.lineNumber - 1 // 0-indexed
            }
        }

        setTimeout(() => {
            if (!textareaRef.current || !activeNote) return
            const el = textareaRef.current
            el.focus()

            if (targetLine > 0) {
                // Approximate scroll position by calculating character offset and lines
                const lines = activeNote.content.split('\n')
                const charsUpToLine = lines.slice(0, targetLine).join('\n').length

                // Set cursor position to the heading
                el.setSelectionRange(charsUpToLine, charsUpToLine)

                // Scroll the textarea so the cursor is near the top
                // We use a rough estimation of line height (24px)
                el.scrollTop = targetLine * 24
            }
        }, 50)
    }
    const restoreScrollPositionFromEditor = () => {
        if (!textareaRef.current || !activeNote) return

        // Find user's cursor position in the text
        const cursorPosition = textareaRef.current.selectionStart
        const textUpToCursor = textareaRef.current.value.substring(0, cursorPosition)
        const linesUpToCursor = textUpToCursor.split('\n')
        const currentLineNum = linesUpToCursor.length

        // Find the most recent heading before or at this line
        let closestHeadingId: string | null = null
        let closestHeadingLine = -1

        for (const item of tocItems) {
            if (item.lineNumber <= currentLineNum && item.lineNumber > closestHeadingLine) {
                closestHeadingId = item.id
                closestHeadingLine = item.lineNumber
            }
        }

        if (closestHeadingId) {
            // Need to wait for read mode to mount
            setTimeout(() => {
                const el = document.getElementById(closestHeadingId!)
                if (el && contentRef.current) {
                    const containerTop = contentRef.current.getBoundingClientRect().top
                    const elTop = el.getBoundingClientRect().top
                    contentRef.current.scrollTo({
                        top: contentRef.current.scrollTop + (elTop - containerTop) - 10,
                        behavior: 'instant' // Instant scroll to avoid jarring animation when switching modes
                    })
                }
            }, 50)
        }
    }

    const handleSave = () => {
        if (activeNote) {
            restoreScrollPositionFromEditor()
            saveMut.mutate(editContent)
        }
    }

    const handleCancelEdit = () => {
        restoreScrollPositionFromEditor()
        setIsEditing(false)
        setEditContent(activeNote?.content ?? '')
    }
    const handleExport = async () => {
        if (!activeNote) return
        try {
            const res = await fetch(`/api/notes/${activeNote.id}/export`)
            if (!res.ok) throw new Error('Export failed')
            const disposition = res.headers.get('Content-Disposition') || ''
            const nameMatch = disposition.match(/filename="([^"]+)"/) ||
                disposition.match(/filename=([^;]+)/)
            const filename = (nameMatch?.[1] ?? `note-${sourceId}.md`).trim()
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url; a.download = filename; a.click()
            URL.revokeObjectURL(url)
        } catch {
            showToast('error', t('detail.aiNotes.exportFailed'))
        }
    }
    const handleTocClick = (id: string) => {
        const el = document.getElementById(id)
        if (el && contentRef.current) {
            // Scroll the note-content container directly
            const containerTop = contentRef.current.getBoundingClientRect().top
            const elTop = el.getBoundingClientRect().top
            // Calculate scroll target (add the offset minus some breathing room)
            contentRef.current.scrollTo({
                top: contentRef.current.scrollTop + (elTop - containerTop) - 10,
                behavior: 'smooth'
            })
        }
    }
    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleSave() }
        if (e.key === 'Escape') handleCancelEdit()
    }, [editContent, activeNote])

    // ---- Manual Screenshot Capture ----
    const handleCapture = useCallback(async (eOrLine?: React.MouseEvent | number) => {
        const targetLineNumber = typeof eOrLine === 'number' ? eOrLine : undefined

        const video = playerRef?.current
        if (!video || !(video instanceof HTMLVideoElement)) {
            showToast('error', t('detail.aiNotes.captureVideoOnly'))
            return
        }
        if (!activeNote) return

        setIsCapturing(true)
        try {
            // 1. Draw current frame to canvas
            const canvas = document.createElement('canvas')
            canvas.width = video.videoWidth || 1280
            canvas.height = video.videoHeight || 720
            const ctx = canvas.getContext('2d')
            if (!ctx) throw new Error('Canvas not supported')
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

            // 2. Export to JPEG blob
            const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.85))
            if (!blob) throw new Error('Canvas export failed')

            // 3. Upload to backend
            const { url } = await uploadNoteScreenshot(sourceId, blob)

            // 4. Build markdown snippet
            const secs = video.currentTime
            const m = Math.floor(secs / 60)
            const s = Math.floor(secs % 60)
            const ts = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
            const imgMd = `\n![⏱ ${ts}](${url})\n`

            if (isEditing && textareaRef.current) {
                // ---- Edit mode: insert at cursor ----
                const el = textareaRef.current
                const start = el.selectionStart ?? el.value.length
                const end = el.selectionEnd ?? start
                const newContent = el.value.slice(0, start) + imgMd + el.value.slice(end)
                setEditContent(newContent)
                // Restore cursor after inserted text
                setTimeout(() => {
                    el.focus()
                    el.setSelectionRange(start + imgMd.length, start + imgMd.length)
                }, 0)
            } else {
                // ---- Read mode: insert after current active section ----
                const content = activeNote.content
                let insertPos = content.length // fallback: append

                if (targetLineNumber !== undefined) {
                    const lines = content.split('\n')
                    let charIndex = 0
                    for (let i = 0; i < targetLineNumber; i++) {
                        charIndex += (lines[i]?.length ?? 0) + 1 // +1 for the \n
                    }
                    insertPos = Math.min(charIndex, content.length)
                } else if (activeTocId) {
                    // Find the active TOC item's line number
                    const activeTocItem = tocItems.find(item => item.id === activeTocId)
                    if (activeTocItem) {
                        const lines = content.split('\n')
                        const headingLineIdx = activeTocItem.lineNumber - 1 // 0-indexed
                        const headingLevel = activeTocItem.level

                        // Find the end of this section: next heading of same or higher level
                        let sectionEndIdx = lines.length
                        for (let i = headingLineIdx + 1; i < lines.length; i++) {
                            const hm = lines[i]!.match(/^(#{1,6})\s/)
                            if (hm && hm[1]!.length <= headingLevel) {
                                sectionEndIdx = i
                                break
                            }
                        }

                        // Walk back past trailing blank lines to place screenshot before empty gap
                        while (sectionEndIdx > headingLineIdx + 1 && lines[sectionEndIdx - 1]!.trim() === '') {
                            sectionEndIdx--
                        }

                        // Compute char position
                        insertPos = lines.slice(0, sectionEndIdx).join('\n').length
                    }
                }

                const newContent = content.slice(0, insertPos) + imgMd + content.slice(insertPos)
                // Save directly without entering edit mode
                await updateNote(activeNote.id, newContent)
                queryClient.invalidateQueries({ queryKey: qkey })
            }

            showToast('success', t('detail.aiNotes.captureSuccess'))
        } catch (e: any) {
            console.error('Screenshot capture failed:', e)
            showToast('error', t('detail.aiNotes.captureFailed'))
        } finally {
            setIsCapturing(false)
        }
    }, [playerRef, activeNote, isEditing, editContent, activeTocId, tocItems, sourceId, queryClient])

    // Custom Markdown components — inject IDs on headings and clickable ⏱ timestamps

    // ---- Manual Image Deletion ----
    const handleDeleteImage = useCallback(async (src: string) => {
        if (!activeNote) return

        try {
            // Escape src for regex
            const escapedSrc = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            // Match exactly this image markdown, optionally with title: ![alt](src) or ![alt](src "title")
            // We use a non-global regex to only remove the first instance we find, to be safe.
            const regex = new RegExp(`!\\[.*?\\]\\(${escapedSrc}(?:\\s+".*?")?\\)`)

            const newContent = activeNote.content.replace(regex, '')

            if (newContent !== activeNote.content) {
                // Optimistic update to prevent scroll jumping
                queryClient.setQueryData(qkey, (old: VideoNote[] | undefined) => {
                    if (!old) return old
                    return old.map(n => n.id === activeNote.id ? { ...n, content: newContent } : n)
                })

                // Fire and forget, handle errors by invalidating
                updateNote(activeNote.id, newContent).catch((e: any) => {
                    console.error('Delete image failed:', e)
                    queryClient.invalidateQueries({ queryKey: qkey })
                    showToast('error', t('detail.aiNotes.deleteFailed', '删除失败'))
                })

                showToast('success', t('detail.aiNotes.imageDeleted', '图片已删除'))
            }
        } catch (e: any) {
            console.error('Delete image process failed:', e)
        }
    }, [activeNote, queryClient, qkey, showToast, t])

    // Stable wrapper for callbacks used inside markdown components to prevent component remounting
    const callbacksRef = useRef({ onSeek, tocLineMap, hideScreenshots, handleDeleteImage, handleCapture, isCapturing, enableInlineScreenshots, t })
    callbacksRef.current = { onSeek, tocLineMap, hideScreenshots, handleDeleteImage, handleCapture, isCapturing, enableInlineScreenshots, t }

    // Custom Markdown components — inject IDs on headings and clickable ⏱ timestamps
    const markdownComponents = useMemo(() => {
        function renderTimestamps(children: React.ReactNode): React.ReactNode {
            if (typeof children === 'string') {
                const parts = children.split(/(⏱\s*\d{1,2}:\d{2}(?::\d{2})?)/g)
                if (parts.length === 1) return children
                return parts.map((part, i) => {
                    const m = part.match(/⏱\s*(\d{1,2}:\d{2}(?::\d{2})?)/)
                    if (m) {
                        const secs = parseTimestamp(m[1]!)
                        return (
                            <button key={i}
                                onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    callbacksRef.current.onSeek(secs)
                                }}
                                onMouseDown={(e) => {
                                    // Prevent browser auto-focus which causes scroll jumps
                                    e.preventDefault()
                                }}
                                className="note-ts-btn" title={`Jump to ${m[1]}`}>
                                {part}
                            </button>
                        )
                    }
                    return part
                })
            }
            if (Array.isArray(children)) {
                return children.map((child, i) =>
                    typeof child === 'string' ? <span key={i}>{renderTimestamps(child)}</span> : child
                )
            }
            return children
        }

        const withInsertHover = (Tag: any) => ({ children, node, ...props }: any) => {
            const element = <Tag {...props}>{renderTimestamps(children)}</Tag>
            const endLine = node?.position?.end?.line
            if (!endLine || !callbacksRef.current.enableInlineScreenshots) return element

            return (
                <div className="group relative note-block-wrapper">
                    {element}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -bottom-3 left-0 w-full flex justify-center z-10 pointer-events-none">
                        <div className="absolute left-0 top-1/2 w-full h-[1px] bg-[var(--color-primary)] -z-10 opacity-30"></div>
                        <button
                            className="bg-[var(--color-primary)] text-white p-1 rounded-full shadow hover:scale-110 transition-transform pointer-events-auto"
                            onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                callbacksRef.current.handleCapture(endLine)
                            }}
                            disabled={callbacksRef.current.isCapturing}
                            title={callbacksRef.current.t('detail.aiNotes.insertScreenshotHere', '在此插入截图')}
                        >
                            <Icons.Camera className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            )
        }

        const makeHeading = (Tag: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') =>
            ({ children, node, ...props }: any) => {
                const { tocLineMap } = callbacksRef.current
                // Use the AST node's line number to look up the deterministic TOC id
                const line = node?.position?.start?.line
                const id = (line && tocLineMap.get(line)) || `note-h-unknown-${line ?? 'x'}`
                const element = <Tag id={id} {...props}>{renderTimestamps(children)}</Tag>

                const endLine = node?.position?.end?.line
                if (!endLine || !callbacksRef.current.enableInlineScreenshots) return element

                return (
                    <div className="group relative note-block-wrapper">
                        {element}
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -bottom-3 left-0 w-full flex justify-center z-10 pointer-events-none">
                            <div className="absolute left-0 top-1/2 w-full h-[1px] bg-[var(--color-primary)] -z-10 opacity-30"></div>
                            <button
                                className="bg-[var(--color-primary)] text-white p-1 rounded-full shadow hover:scale-110 transition-transform pointer-events-auto"
                                onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    callbacksRef.current.handleCapture(endLine)
                                }}
                                disabled={callbacksRef.current.isCapturing}
                                title={callbacksRef.current.t('detail.aiNotes.insertScreenshotHere', '在此插入截图')}
                            >
                                <Icons.Camera className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                )
            }

        return {
            h1: makeHeading('h1'),
            h2: makeHeading('h2'),
            h3: makeHeading('h3'),
            h4: makeHeading('h4'),
            h5: makeHeading('h5'),
            h6: makeHeading('h6'),
            p: withInsertHover('p'),
            blockquote: withInsertHover('blockquote'),
            pre: withInsertHover('pre'),
            ul: withInsertHover('ul'),
            ol: withInsertHover('ol'),
            li: ({ children, props }: any) => <li {...props}>{renderTimestamps(children)}</li>,
            img: ({ src, alt, ...props }: any) => {
                const { hideScreenshots, handleDeleteImage, t } = callbacksRef.current
                const isScreenshot = src && src.includes('/api/note-screenshots/')
                if (isScreenshot && hideScreenshots) return null
                return (
                    <span className="relative inline-block group note-image-container">
                        <img
                            src={src}
                            alt={alt}
                            className={isScreenshot ? 'note-screenshot' : undefined}
                            loading="lazy"
                            {...props}
                        />
                        <button
                            className="absolute top-2 right-2 bg-black/50 text-white rounded-md p-1 opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 shadow-sm"
                            onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                handleDeleteImage(src)
                            }}
                            title={t('detail.aiNotes.deleteImage', '删除图片')}
                        >
                            <Icons.X className="w-4 h-4" />
                        </button>
                    </span>
                )
            },
        }
    }, [])

    // ---- Render ----

    if (!hasSegments) {
        // Can only transcribe if video exists and we know its type
        const canTranscribe = video && (video.source_type === 'bilibili' || video.source_type === 'youtube' || video.source_type === 'douyin')
        const isBiliOrYt = video?.source_type === 'bilibili' || video?.source_type === 'youtube'

        const handleTranscribe = async (onlySub: boolean) => {
            if (!video || !canTranscribe) return
            try {
                await retranscribe({
                    source_id: video.source_id,
                    only_get_subtitles: onlySub
                })
                showToast('success', t('detail.aiNotes.transcribeStarted'))
                // Invalidate query to reflect pending status
                queryClient.invalidateQueries({ queryKey: ['video', sourceId] })
            } catch (e: any) {
                showToast('error', e.message || String(e))
            }
        }

        return (
            <div className="note-view-empty">
                <span className="note-empty-icon">📝</span>
                <p className="note-empty-title mb-4">{t('detail.aiNotes.noTranscription')}</p>
                <p className="text-sm text-[var(--color-text-muted)] mb-6 text-center max-w-sm">
                    {t('detail.aiNotes.noTranscriptionDesc')}
                </p>

                {canTranscribe ? (
                    <div className="flex flex-col gap-3 w-64 max-w-full">
                        <button
                            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[var(--color-primary)] text-white font-medium rounded-lg hover:bg-[var(--color-primary-hover)] transition-colors shadow-sm"
                            onClick={() => handleTranscribe(false)}
                            title={t('detail.aiNotes.autoTranscribeHint')}
                        >
                            <Icons.Mic className="w-4 h-4" />
                            {t('detail.aiNotes.autoTranscribe')}
                        </button>
                        {isBiliOrYt && (
                            <button
                                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[var(--color-bg)] border border-[var(--color-border)] text-[var(--color-text)] font-medium rounded-lg hover:bg-[var(--color-card)] transition-colors"
                                onClick={() => handleTranscribe(true)}
                                title={t('detail.aiNotes.onlyGetSubtitlesHint')}
                            >
                                <Icons.FileText className="w-4 h-4" />
                                {t('detail.aiNotes.onlyGetSubtitles')}
                            </button>
                        )}
                    </div>
                ) : (
                    <p className="text-xs text-amber-500/80 mt-2 bg-amber-500/10 px-3 py-1.5 rounded-md border border-amber-500/20">
                        {t('detail.aiNotes.transcribeUnsupported')}
                    </p>
                )}
            </div>
        )
    }

    if (isLoading) {
        return <div className="note-view-loading">{t('common.loading')}</div>
    }

    return (
        <div className={`note-view${isEditing ? ' note-view--editing' : ''} ${isZenMode ? 'relative h-full flex flex-col' : ''}`}>
            {/* ---- TOOLBAR ---- */}
            {(!isZenMode || zenToolbarMode === 'tools') && (
                <div className={`note-toolbar ${isZenMode ? 'absolute bottom-6 left-1/2 -translate-x-1/2 z-50 opacity-10 hover:opacity-100 focus-within:opacity-100 transition-opacity !flex-nowrap duration-300 bg-[var(--color-card)]/90 backdrop-blur-md rounded-full shadow-2xl border border-[var(--color-border)] p-1.5 h-auto max-w-[95vw] overflow-x-auto hide-scrollbar whitespace-nowrap' : ''}`}>
                    <div className={`note-toolbar-left ${isZenMode ? '!flex-nowrap shrink-0' : ''}`}>
                        {isZenMode && onToggleZenToolbar && (
                            <button
                                className="note-btn note-btn-icon"
                                onClick={() => onToggleZenToolbar('tabs')}
                                title={t('detail.layout.switchTabs', '切换视图')}
                            >
                                <Icons.LayoutDashboard />
                            </button>
                        )}
                        {/* Version history toggle */}
                    {notes.length > 0 && (
                        <button
                            className={`note-btn note-btn-icon ${showVersions ? 'active' : ''}`}
                            onClick={() => setShowVersions(v => !v)}
                            title={t('detail.aiNotes.versionLabel')}
                        >
                            <Icons.Clock />
                            <span>{notes.length}</span>
                        </button>
                    )}
                    {/* Open full detail page */}
                    {onOpenDetail && (
                        <button
                            className="note-btn note-btn-icon"
                            onClick={onOpenDetail}
                            title={t('detail.aiNotes.openDetail', '打开详情页')}
                        >
                            <Icons.ExternalLink />
                        </button>
                    )}
                </div>

                <div className={`note-toolbar-right ${isZenMode ? '!flex-nowrap shrink-0' : ''}`}>
                    {activeNote && !isEditing && (
                        <>
                            {activeNote.is_edited && (
                                <span className="note-edited-badge">{t('detail.aiNotes.editedBadge')}</span>
                            )}
                            <button className="note-btn" onClick={handleStartEdit}>
                                <Icons.Edit />
                                {t('detail.aiNotes.edit')}
                            </button>
                            {activeNote.is_edited && activeNote.original_content && (
                                <button className="note-btn note-btn-secondary"
                                    onClick={() => setPendingReset(true)}
                                    title={t('detail.aiNotes.resetToOriginal')}>
                                    <Icons.Undo />
                                </button>
                            )}
                            {/* Toggle TOC visibility */}
                            <button
                                className={`note-btn note-btn-icon ${showToc ? 'active' : ''}`}
                                onClick={() => setShowToc(v => {
                                    const next = !v
                                    localStorage.setItem('note-show-toc', String(next))
                                    // Reset TOC position when toggling from hidden to visible
                                    if (next) {
                                        localStorage.removeItem('note-toc-position')
                                        localStorage.removeItem('note-toc-width')
                                        localStorage.removeItem('note-toc-height')
                                    }
                                    return next
                                })}
                                title={showToc ? t('detail.aiNotes.hideToc', '隐藏目录') : t('detail.aiNotes.showToc', '显示目录')}
                            >
                                <Icons.List />
                            </button>
                            <button className="note-btn note-btn-icon" onClick={handleExport}
                                title={t('detail.aiNotes.exportMd')}>
                                <Icons.Download />
                            </button>
                            {/* Toggle screenshots visibility */}
                            <button
                                className={`note-btn note-btn-icon ${hideScreenshots ? 'active' : ''}`}
                                onClick={() => setHideScreenshots(v => {
                                    const next = !v
                                    localStorage.setItem('note-hide-screenshots', String(next))
                                    return next
                                })}
                                title={hideScreenshots ? t('detail.aiNotes.showScreenshots', '显示截图') : t('detail.aiNotes.hideScreenshots', '隐藏截图')}
                            >
                                <Icons.Image />
                            </button>
                            {/* Toggle inline screenshots */}
                            {playerRef?.current instanceof HTMLVideoElement && !hideScreenshots && !isEditing && (
                                <button
                                    className={`note-btn note-btn-icon ${enableInlineScreenshots ? 'active' : ''}`}
                                    onClick={() => setEnableInlineScreenshots(v => {
                                        const next = !v
                                        localStorage.setItem('note-enable-inline-screenshots', String(next))
                                        return next
                                    })}
                                    title={enableInlineScreenshots ? t('detail.aiNotes.disableInlineScreenshots', '关闭段落间截图按钮') : t('detail.aiNotes.enableInlineScreenshots', '开启段落间截图按钮')}
                                >
                                    <Icons.Layers />
                                </button>
                            )}
                            {/* Capture screenshot button — only for video (not audio) */}
                            {playerRef?.current instanceof HTMLVideoElement && (
                                <button
                                    className="note-btn note-btn-icon"
                                    onClick={handleCapture}
                                    disabled={isCapturing}
                                    title={t('detail.aiNotes.captureScreenshot')}
                                >
                                    {isCapturing ? <Icons.Loader className="animate-spin" /> : <Icons.Camera />}
                                </button>
                            )}
                            {/* Regenerate → opens config panel */}
                            {!activeTask && (
                                <button
                                    className={`note-btn note-btn-primary ${showGenPanel ? 'active' : ''}`}
                                    onClick={() => setShowGenPanel(v => !v)}
                                >
                                    <Icons.Refresh />
                                    {t('detail.aiNotes.regenerate')}
                                </button>
                            )}
                        </>
                    )}

                    {/* Active task toggle button (shows in all modes if generating) */}
                    {activeTask && (
                        <button
                            className={`note-btn note-btn-primary ${showGenPanel ? 'active' : ''} animate-pulse`}
                            onClick={() => setShowGenPanel(v => !v)}
                        >
                            <Icons.Loader className="animate-spin w-4 h-4" />
                            <span className="max-w-[100px] truncate">{activeTask.message || t('detail.aiNotes.generating')}</span>
                            <Icons.ChevronDown className={`w-3.5 h-3.5 transition-transform ${showGenPanel ? 'rotate-180' : ''}`} />
                        </button>
                    )}

                    {activeNote && isEditing && (
                        <>
                            {/* Capture screenshot button in edit mode too */}
                            {playerRef?.current instanceof HTMLVideoElement && (
                                <button
                                    className="note-btn note-btn-icon"
                                    onClick={handleCapture}
                                    disabled={isCapturing}
                                    title={t('detail.aiNotes.captureScreenshot')}
                                >
                                    {isCapturing ? <Icons.Loader className="animate-spin" /> : <Icons.Camera />}
                                </button>
                            )}
                            <button className="note-btn note-btn-secondary" onClick={handleCancelEdit}>
                                {t('detail.aiNotes.cancel')}
                            </button>
                            <button className="note-btn note-btn-primary" onClick={handleSave}
                                disabled={saveMut.isPending}>
                                {t('detail.aiNotes.save')}
                            </button>
                        </>
                    )}

                    {!activeNote && !activeTask && (
                        /* Generate button → opens config panel */
                        <button
                            className={`note-btn note-btn-primary ${showGenPanel ? 'active' : ''}`}
                            onClick={() => setShowGenPanel(v => !v)}
                        >
                            ✨ {t('detail.aiNotes.generate')}
                        </button>
                    )}

                    {isZenMode && onExitZenMode && (
                        <>
                            <div className="w-px h-6 bg-[var(--color-border)] mx-1 self-center opacity-50 hidden sm:block"></div>
                            <button
                                className="note-btn note-btn-icon text-[var(--color-primary)] hover:bg-[var(--color-primary)]/10 ml-1"
                                onClick={onExitZenMode}
                                title={t('detail.layout.exitZenMode', '退出专注模式')}
                            >
                                <Icons.Minimize />
                            </button>
                        </>
                    )}
                </div>
            </div>
            )}

            {/* ---- GENERATE CONFIG PANEL ---- */}
            {showGenPanel && (
                <GeneratePanel
                    style={style}
                    setStyle={setStyle}
                    selectedModelId={selectedModelId}
                    setSelectedModelId={handleSelectedModelIdChange}
                    screenshotDensity={screenshotDensity}
                    setScreenshotDensity={setScreenshotDensity}
                    segments={segments}
                    selectedTransVersion={selectedTransVersion}
                    setSelectedTransVersion={setSelectedTransVersion}
                    providers={providers}
                    onGenerate={() => generateMut.mutate()}
                    onCancel={() => setShowGenPanel(false)}
                    isPending={generateMut.isPending}
                    activeTask={activeTask}
                    onCancelTask={() => pendingTaskId !== null && cancelTask(pendingTaskId).then(() => setPendingTaskId(null))}
                    customPrompt={customPrompt}
                    setCustomPrompt={setCustomPrompt}
                    showGenStages={showGenStages}
                    setShowGenStages={setShowGenStages}
                />
            )}
            {/* ---- VERSION HISTORY PANEL ---- */}
            {showVersions && notes.length > 0 && (
                <div className="note-version-panel">
                    {notes.map(note => {
                        const isExpanded = expandedVersionId === note.id
                        return (
                            <div key={note.id} className="flex flex-col mb-2 last:mb-0">
                                <div
                                    className={`note-version-item ${note.is_active ? 'active' : ''} cursor-pointer hover:bg-[var(--color-bg-muted)]`}
                                    onClick={() => setExpandedVersionId(isExpanded ? null : note.id)}
                                >
                                    <button className="note-version-select flex-1 text-left"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (!note.is_active) {
                                                activateMut.mutate(note.id);
                                            } else {
                                                setExpandedVersionId(isExpanded ? null : note.id)
                                            }
                                        }}>
                                        <span className="note-version-model">{note.model ?? 'AI'}</span>
                                        <span className="note-version-date">{fmtDate(note.created_at)}</span>
                                        {note.is_edited && <span className="note-version-edited">✏️</span>}
                                        {note.style && <span className="note-version-style">{note.style}</span>}
                                    </button>

                                    <div className="flex items-center gap-1 shrink-0 ml-2">
                                        <button
                                            className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-primary)] hover:bg-[var(--color-bg-muted)] rounded transition-colors"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setExpandedVersionId(isExpanded ? null : note.id)
                                            }}
                                            title={t('detail.aiNotes.showDetails', '查看生成参数')}
                                        >
                                            {isExpanded ? <Icons.ChevronUp className="w-3.5 h-3.5" /> : <Icons.ChevronDown className="w-3.5 h-3.5" />}
                                        </button>
                                        <button className="p-1.5 text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setPendingDelete(note.id)
                                            }}
                                            title={t('detail.aiNotes.deleteVersion')}>
                                            <Icons.Trash className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Expanded Details Inline */}
                                {isExpanded && (
                                    <div className="mt-1 ml-4 pl-3 pr-2 py-2 border-l-2 border-[var(--color-primary)]/30 bg-[var(--color-card)] rounded-r-md text-xs text-[var(--color-text-muted)] space-y-1.5 animate-in slide-in-from-top-1 fade-in duration-200">
                                        {note.gen_params?.user_prompt && (
                                            <div className="flex gap-2 items-start">
                                                <Icons.MessageSquare className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[var(--color-primary)]" />
                                                <span className="break-all whitespace-pre-wrap">{note.gen_params.user_prompt}</span>
                                            </div>
                                        )}
                                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] opacity-80 mt-2">
                                            {note.gen_params?.screenshot_density && (
                                                <span className="flex items-center gap-1">
                                                    <Icons.Camera className="w-3 h-3" />
                                                    {note.gen_params.screenshot_density}
                                                </span>
                                            )}
                                            {note.gen_params?.transcription_version && (
                                                <span className="flex items-center gap-1">
                                                    <Icons.FileText className="w-3 h-3" />
                                                    {note.gen_params.transcription_version}
                                                </span>
                                            )}
                                            <span className="flex items-center gap-1">
                                                <Icons.Cpu className="w-3 h-3" />
                                                {note.model ?? 'AI'}
                                            </span>
                                        </div>
                                        {note.gen_params?.stages && note.gen_params.stages.length > 0 && (
                                            <div className="mt-3 pt-2 border-t border-[var(--color-border)]">
                                                <ul className="space-y-1">
                                                    {note.gen_params.stages.map((stage, i) => (
                                                        <li key={i} className="flex items-center justify-between text-opacity-80">
                                                            <span className="flex items-center gap-1.5 truncate pr-2 text-[11px]">
                                                                <Icons.Check className="w-3 h-3 text-green-500/70 shrink-0" />
                                                                <span className="truncate">{stage.name}</span>
                                                            </span>
                                                            <span className="font-mono text-[9px] bg-[var(--color-bg-muted)] px-1 py-0.5 rounded shrink-0 opacity-70">
                                                                {stage.duration.toFixed(1)}s
                                                            </span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* ---- EMPTY STATE ---- */}
            {!activeNote && !generateMut.isPending && !showGenPanel && pendingTaskId === null && (
                <div className="note-view-empty">
                    <span className="note-empty-icon">🧠</span>
                    <p className="note-empty-title">{t('detail.aiNotes.emptyTitle')}</p>
                    <p className="note-empty-desc">{t('detail.aiNotes.emptyDesc')}</p>
                    <button className="note-btn note-btn-primary note-btn-lg"
                        onClick={() => setShowGenPanel(true)}>
                        ✨ {t('detail.aiNotes.generate')}
                    </button>
                </div>
            )}

            {/* ---- GENERATING STATE (streaming preview) ---- */}
            {!activeNote && (generateMut.isPending || (pendingTaskId !== null && noteStream)) && (
                <div className="note-view-generating">
                    {noteStream && noteStream.text ? (
                        <div className="note-stream-preview">
                            <div className="note-stream-header">
                                <div className="note-generating-spinner" />
                                <span>{noteStream.model ? `${noteStream.model} ` : ''}{t('detail.aiNotes.generating')}</span>
                            </div>
                            <div className="note-content markdown-body">
                                <Markdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={[rehypeKatex]}>
                                    {preprocessLaTeX(noteStream.text)}
                                </Markdown>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="note-generating-spinner" />
                            <p>{t('detail.aiNotes.generating')}</p>
                        </>
                    )}
                </div>
            )}

            {/* ---- EDIT MODE ---- */}
            {activeNote && isEditing && (
                <div className="note-edit-area">
                    <textarea
                        ref={textareaRef}
                        className="note-textarea"
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        onKeyDown={handleKeyDown}
                        spellCheck={false}
                    />
                    <p className="note-edit-tip">Ctrl/Cmd + Enter 保存 · Esc 取消</p>
                </div>
            )}

            {/* ---- READ MODE (with TOC) ---- */}
            {activeNote && !isEditing && (
                <div className={`note-read-layout ${isZenMode ? 'w-full' : ''}`}>
                    <div className="note-content" ref={contentRef}>
                        <Markdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={[rehypeKatex]} components={markdownComponents}>
                            {preprocessLaTeX(activeNote.content)}
                        </Markdown>
                    </div>
                    <NoteTOC
                        items={tocItems}
                        activeId={activeTocId}
                        onItemClick={handleTocClick}
                        isZenMode={isZenMode}
                        showToc={showToc}
                    />
                </div>
            )}

            {/* ---- RESET CONFIRM ---- */}
            {pendingReset && (
                <div className="note-confirm-overlay" onClick={() => setPendingReset(false)}>
                    <div className="note-confirm-dialog" onClick={e => e.stopPropagation()}>
                        <p>{t('detail.aiNotes.resetConfirm')}</p>
                        <div className="note-confirm-actions">
                            <button className="note-btn note-btn-secondary" onClick={() => setPendingReset(false)}>
                                {t('detail.aiNotes.cancel')}
                            </button>
                            <button className="note-btn note-btn-danger"
                                onClick={() => resetMut.mutate()} disabled={resetMut.isPending}>
                                {t('detail.aiNotes.resetToOriginal')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ---- DELETE CONFIRM ---- */}
            {pendingDelete !== null && (
                <div className="note-confirm-overlay" onClick={() => setPendingDelete(null)}>
                    <div className="note-confirm-dialog" onClick={e => e.stopPropagation()}>
                        <p>{t('detail.aiNotes.deleteConfirm')}</p>
                        <div className="note-confirm-actions">
                            <button className="note-btn note-btn-secondary" onClick={() => setPendingDelete(null)}>
                                {t('detail.aiNotes.cancel')}
                            </button>
                            <button className="note-btn note-btn-danger"
                                onClick={() => deleteMut.mutate(pendingDelete)} disabled={deleteMut.isPending}>
                                {t('common.delete')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

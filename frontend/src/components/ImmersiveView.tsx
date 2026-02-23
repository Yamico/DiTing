
import { useEffect, useRef, useState, useMemo } from 'react'
import { Segment } from '../api/types'
import Icons from './ui/Icons'

interface ImmersiveViewProps {
    segments: Segment[]
    currentTime: number
    onSeek: (time: number) => void
    height?: string // Optional height override
}

interface SubLine {
    id: string
    text: string
    start: number
    end: number
    segmentId: number
    isPlain: boolean
}

// Parse text into finer sub-lines if possible
function parseSegment(segment: Segment): SubLine[] {
    const raw = segment.raw_text || ''
    const lines: SubLine[] = []

    // 1. SRT Format Check
    if (raw.includes('-->')) {
        const blocks = raw.split(/\n\s*\n/)
        blocks.forEach((block, idx) => {
            const parts = block.split('\n')
            if (parts.length >= 2) {
                // Find timestamp line (usually 2nd line, index 1)
                // Format: 00:00:00,000 --> 00:00:02,000
                const timeLineIdx = parts.findIndex(p => p.includes('-->'))
                if (timeLineIdx !== -1 && parts.length > timeLineIdx + 1) {
                    const timeLine = parts[timeLineIdx]
                    if (timeLine) {
                        const text = parts.slice(timeLineIdx + 1).join('\n')
                        const [startStr, endStr] = timeLine.split(' --> ')

                        const parseTime = (t: string | undefined) => {
                            if (!t) return 0
                            const [hms, ms] = t.replace(',', '.').split('.') // Handle , or . for ms keys
                            if (!hms) return 0
                            const [h, m, s] = hms.split(':').map(Number)
                            return (h || 0) * 3600 + (m || 0) * 60 + (s || 0) + (Number(ms) || 0) / 1000
                        }

                        if (startStr) {
                            lines.push({
                                id: `${segment.id}-srt-${idx}`,
                                text: text,
                                start: parseTime(startStr),
                                end: endStr ? parseTime(endStr) : parseTime(startStr) + 2,
                                segmentId: segment.id,
                                isPlain: false
                            })
                        }
                    }
                }
            }
        })
        if (lines.length > 0) return lines
    }

    // 2. SenseVoice Tags <|0.50|>
    const tagRegex = /<\|([\d\.]+)\|>/g
    if (tagRegex.test(raw)) {
        let lastIndex = 0
        let lastTime = segment.segment_start
        let match
        let idx = 0

        // Reset regex state
        tagRegex.lastIndex = 0

        // Check if starts with text before first tag
        // If the first match index > 0, there is text before. 
        // We assume it starts at segment.segment_start

        while ((match = tagRegex.exec(raw)) !== null) {
            const time = parseFloat(match[1] || '0')
            const text = raw.slice(lastIndex, match.index).trim()

            if (text) {
                lines.push({
                    id: `${segment.id}-tag-${idx++}`,
                    text: text,
                    start: lastTime,
                    end: time,
                    segmentId: segment.id,
                    isPlain: false
                })
            }
            lastTime = time
            lastIndex = tagRegex.lastIndex
        }

        // Trailing text
        if (lastIndex < raw.length) {
            const text = raw.slice(lastIndex).trim()
            if (text) {
                lines.push({
                    id: `${segment.id}-tag-${idx++}`,
                    text: text,
                    start: lastTime,
                    end: segment.segment_end ?? (lastTime + 2), // Fallback end
                    segmentId: segment.id,
                    isPlain: false
                })
            }
        }

        if (lines.length > 0) return lines
    }

    // 3. Fallback: Plain text (Use segment start/end)
    return [{
        id: `${segment.id}-plain`,
        text: segment.text || raw,
        start: segment.segment_start,
        end: segment.segment_end ?? (segment.segment_start + 5),
        segmentId: segment.id,
        isPlain: true
    }]
}

// Helper to clean SenseVoice emotion tags for display
function cleanText(text: string) {
    return text
        .replace(/<\|[a-z]{2,5}\|>/g, '') // <|zh|>, <|en|>
        .replace(/<\|withitn\|>/g, '')
        .replace(/<\|EMO_UNKNOWN\|>/g, '')
        .replace(/<\|(HAPPY|SAD|ANGRY|NEUTRAL|FEAR|SURPRISED)\|>/g, '') // Emotions
        .replace(/<\|(BGM|Speech|Applause|Laughter|Cry|Music|Bird|Bell)\|>/g, '') // Events
        .trim()
}

export default function ImmersiveView({ segments, currentTime, onSeek, height = '600px' }: ImmersiveViewProps) {
    const [viewMode, setViewMode] = useState<'list' | 'text'>('list')
    const [selectedSegmentId, setSelectedSegmentId] = useState<number | null>(null)
    const [showSourceMenu, setShowSourceMenu] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const activeRef = useRef<HTMLElement | null>(null)

    // Controls auto-hide + click-to-toggle
    const [controlsVisible, setControlsVisible] = useState(true)
    const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const startHideTimer = () => {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
        hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000)
    }

    const toggleControls = () => {
        if (controlsVisible) {
            if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
            setControlsVisible(false)
        } else {
            setControlsVisible(true)
            startHideTimer()
        }
    }

    // Show controls on mount, then auto-hide after 3s
    useEffect(() => {
        setControlsVisible(true)
        startHideTimer()
        return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current) }
    }, [])

    // Reset selection if segments change, default to pinned segment if any
    useEffect(() => {
        const pinned = segments.find(s => s.is_pinned)
        setSelectedSegmentId(pinned ? pinned.id : null)
    }, [segments])

    // Memoize parsed lines to avoid checking regex every render
    const allLines = useMemo(() => {
        const targetSegments = selectedSegmentId
            ? segments.filter(s => s.id === selectedSegmentId)
            : segments
        return targetSegments.flatMap(parseSegment)
    }, [segments, selectedSegmentId])

    // Find active line index
    const activeIndex = useMemo(() => {
        // Find the last line that started before or at currentTime
        // Optimization: Could use binary search for long transcripts
        // For now, linear scan is fine for typical length
        for (let i = allLines.length - 1; i >= 0; i--) {
            const line = allLines[i]
            if (line && currentTime >= line.start) {
                return i
            }
        }
        return -1
    }, [currentTime, allLines])

    // Auto-scroll logic
    useEffect(() => {
        if (activeRef.current && containerRef.current) {
            const container = containerRef.current
            const activeEl = activeRef.current

            if (viewMode === 'list') {
                // Center scroll for list mode
                const target = activeEl.offsetTop - (container.clientHeight / 2) + (activeEl.clientHeight / 2)
                container.scrollTo({ top: target, behavior: 'smooth' })
            } else {
                // Ensure visible for text mode
                const containerRect = container.getBoundingClientRect()
                const activeRect = activeEl.getBoundingClientRect()

                // If out of view, scroll
                if (activeRect.top < containerRect.top || activeRect.bottom > containerRect.bottom) {
                    const target = activeEl.offsetTop - (container.clientHeight / 2) + (activeEl.clientHeight / 2)
                    container.scrollTo({ top: target, behavior: 'smooth' })
                }
            }
        }
    }, [activeIndex, viewMode])

    return (
        <div className="flex flex-col h-full bg-[var(--color-bg)] rounded-xl overflow-hidden border border-[var(--color-border)] relative group">

            {/* Controls (auto-hide, click content to toggle) */}
            <div
                className={`
                    absolute top-0 left-0 right-0 z-20 flex gap-2 transition-all duration-300
                    p-2 justify-center bg-black/40 backdrop-blur-sm border-b border-white/10
                    lg:top-4 lg:right-4 lg:left-auto lg:border-b-0 lg:border lg:border-white/10 lg:p-1.5 lg:rounded-lg lg:justify-start lg:bg-black/50
                    ${controlsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'}
                `}
                onClick={() => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current) }}
                onMouseEnter={() => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current) }}
                onMouseLeave={() => startHideTimer()}
            >
                {/* Source Selector */}
                {segments.length > 1 && (
                    <div className="relative">
                        <button
                            onClick={() => setShowSourceMenu(!showSourceMenu)}
                            className={`p-1.5 rounded-md transition-all ${selectedSegmentId ? 'bg-[var(--color-primary)] text-white shadow-sm' : 'text-white/70 hover:bg-white/10'}`}
                            title="选择字幕源"
                        >
                            <Icons.Layers className="w-4 h-4" />
                        </button>
                        {showSourceMenu && (
                            <div className="absolute left-0 lg:right-0 lg:left-auto top-full mt-2 w-48 max-w-[calc(100vw-2rem)] bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg shadow-xl overflow-hidden py-1 z-30 text-xs">
                                <button
                                    onClick={() => {
                                        setSelectedSegmentId(null)
                                        setShowSourceMenu(false)
                                    }}
                                    className={`w-full text-left px-3 py-2 hover:bg-[var(--color-bg)] transition-colors flex items-center justify-between ${!selectedSegmentId ? 'text-[var(--color-primary)] font-medium' : 'text-[var(--color-text)]'}`}
                                >
                                    <span>全部内容 (自动拼接)</span>
                                    {!selectedSegmentId && <Icons.Check className="w-3 h-3" />}
                                </button>
                                <div className="border-t border-[var(--color-border)] my-1 opacity-50" />
                                <div className="max-h-60 overflow-y-auto">
                                    {segments.map((seg, idx) => (
                                        <button
                                            key={seg.id}
                                            onClick={() => {
                                                setSelectedSegmentId(seg.id)
                                                setShowSourceMenu(false)
                                            }}
                                            className={`w-full text-left px-3 py-2 hover:bg-[var(--color-bg)] transition-colors flex items-center justify-between ${selectedSegmentId === seg.id ? 'text-[var(--color-primary)] font-medium' : 'text-[var(--color-text)]'}`}
                                        >
                                            <span className="truncate flex items-center gap-1.5 text-xs">
                                                {seg.is_pinned && <Icons.Pin className="w-3 h-3 text-amber-500 shrink-0" />}
                                                <span>片段 {idx + 1} ({Math.floor(seg.segment_start / 60)}:{String(Math.floor(seg.segment_start % 60)).padStart(2, '0')})</span>
                                            </span>
                                            {selectedSegmentId === seg.id && <Icons.Check className="w-3 h-3" />}
                                        </button>
                                    ))}
                                </div>
                                <div className="fixed inset-0 z-[-1]" onClick={() => setShowSourceMenu(false)} />
                            </div>
                        )}
                    </div>
                )}
                {segments.length > 1 && <div className="w-px h-4 bg-white/20 mx-1 self-center" />}
                <button
                    onClick={() => setViewMode('list')}
                    className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-[var(--color-primary)] text-white shadow-sm' : 'text-white/70 hover:bg-white/10'}`}
                    title="滚动歌词模式"
                >
                    <Icons.List className="w-4 h-4" />
                </button>
                <button
                    onClick={() => setViewMode('text')}
                    className={`p-1.5 rounded-md transition-all ${viewMode === 'text' ? 'bg-[var(--color-primary)] text-white shadow-sm' : 'text-white/70 hover:bg-white/10'}`}
                    title="全文模式"
                >
                    <Icons.FileText className="w-4 h-4" />
                </button>
            </div>

            {/* Main Content */}
            <div
                ref={containerRef}
                className="flex-1 overflow-y-auto scroll-smooth relative"
                onClick={() => toggleControls()}
                style={{
                    height,
                    // Gradient mask for list mode
                    maskImage: viewMode === 'list'
                        ? 'linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)'
                        : 'none',
                    WebkitMaskImage: viewMode === 'list'
                        ? 'linear-gradient(to bottom, transparent, black 15%, black 85%, transparent)'
                        : 'none'
                }}
            >
                <div className={`
                    ${viewMode === 'list' ? 'px-8 py-[40vh] text-center space-y-6' : 'p-8 text-left leading-loose'}
                `}>
                    {allLines.length === 0 ? (
                        <div className="text-[var(--color-text-muted)] text-center py-20">暂无歌词内容</div>
                    ) : (
                        allLines.map((line, idx) => {
                            const isActive = idx === activeIndex

                            // Render logic based on mode
                            if (viewMode === 'list') {
                                return (
                                    <div
                                        key={line.id}
                                        ref={(el) => {
                                            if (isActive && el) activeRef.current = el
                                        }}
                                        onClick={() => onSeek(line.start)}
                                        className={`
                                            transition-all duration-300 cursor-pointer rounded-lg px-4 py-2 select-none
                                            ${isActive
                                                ? 'text-[var(--color-primary)] font-bold scale-110 opacity-100 z-10'
                                                : 'text-[var(--color-text-muted)] scale-100 hover:text-[var(--color-text)] hover:bg-[var(--color-bg-muted)]/50'
                                            }
                                            ${isActive ? 'text-lg sm:text-xl lg:text-2xl' : 'text-base opacity-60'}
                                        `}
                                    >
                                        {cleanText(line.text)}
                                    </div>
                                )
                            } else {
                                // Text Mode
                                return (
                                    <span
                                        key={line.id}
                                        ref={(el) => {
                                            if (isActive && el) activeRef.current = el
                                        }}
                                        onClick={() => onSeek(line.start)}
                                        className={`
                                            inline-block mr-1.5 px-1.5 py-0.5 rounded cursor-pointer transition-all duration-200
                                            ${isActive
                                                ? 'text-[var(--color-primary)] font-bold'
                                                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-muted)]'
                                            }
                                        `}
                                        title={`${new Date(line.start * 1000).toISOString().substr(14, 5)}`}
                                    >
                                        {cleanText(line.text)}
                                    </span>
                                )
                            }
                        })
                    )}
                </div>
            </div>
        </div>
    )
}

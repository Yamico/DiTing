import { useState, useMemo, useRef, useEffect } from 'react'
import type { Segment } from '../api/types'
import { updateSegmentText, deleteSegment, deleteSummary, toggleSegmentPin } from '../api'
import { useToast } from '../contexts/ToastContext'
import { useQueryClient } from '@tanstack/react-query'
import Icons from './ui/Icons'
import { cleanEmotionTags, formatTime, buildSummaryTree, stripSubtitleMetadata, hasSrtMetadata } from './segmentHelpers'
import SummaryNode from './SummaryNode'

export interface RefineContext {
    parentId: number
    contextText: string
}

interface SegmentCardProps {
    segment: Segment
    onRefresh: () => void
    onPlay?: (start: number) => void
    isExpandedDefault?: boolean
    onOpenAiModal?: (segment: Segment, refineContext?: RefineContext) => void
    highlightText?: string
}

export default function SegmentCard({ segment, onRefresh, isExpandedDefault = false, onOpenAiModal, highlightText }: SegmentCardProps) {
    const { showUndoableDelete, showToast } = useToast()
    const queryClient = useQueryClient()
    const [isExpanded, setIsExpanded] = useState(isExpandedDefault)
    const [isPinned, setIsPinned] = useState(!!segment.is_pinned)

    // Sync local state with prop when parent re-renders with new data
    useEffect(() => {
        setIsPinned(!!segment.is_pinned)
    }, [segment.is_pinned])
    const [isEditing, setIsEditing] = useState(false)
    const [text, setText] = useState(segment.text || '')

    // Highlight text logic
    const highlightedText = useMemo(() => {
        const displayText = segment.text || ''
        if (!highlightText) return displayText
        const parts = displayText.split(new RegExp(`(${highlightText})`, 'gi'))
        return parts.map((part, i) =>
            part.toLowerCase() === highlightText.toLowerCase() ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 text-black dark:text-white rounded px-0.5">{part}</mark> : part
        )
    }, [segment.text, highlightText])

    // AI Summary State
    const [hiddenSummaryIds, setHiddenSummaryIds] = useState<Set<number>>(new Set())
    const summaryTree = useMemo(() => buildSummaryTree((segment.summaries || []).filter(s => !hiddenSummaryIds.has(s.id))), [segment.summaries, hiddenSummaryIds])
    const [activeSummaryRootId, setActiveSummaryRootId] = useState<number | null>(() => {
        const tree = buildSummaryTree(segment.summaries || [])
        return tree[0]?.id ?? null
    })
    const activeSummaryRoot = useMemo(() => summaryTree.find(s => s.id === activeSummaryRootId), [summaryTree, activeSummaryRootId])

    const hasVisibleAi = summaryTree.length > 0
    const [showTranscription, setShowTranscription] = useState(!hasVisibleAi)
    const [showPreprocessPreview, setShowPreprocessPreview] = useState(false)
    const previewRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (showPreprocessPreview && previewRef.current && !previewRef.current.contains(event.target as Node)) {
                setShowPreprocessPreview(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [showPreprocessPreview])

    const aiSectionRef = useRef<HTMLDivElement>(null)

    const handleSave = async () => {
        if (text === (segment.text || '')) return setIsEditing(false)
        try {
            await updateSegmentText(segment.id, text)
            showToast('success', '文本已更新')
            segment.text = text // Optimistic update
            setIsEditing(false)
            onRefresh()
        } catch (e) {
            showToast('error', '保存失败: ' + (e as Error).message)
        }
    }

    const [isDeleted, setIsDeleted] = useState(false)

    const handleDelete = () => {
        setIsDeleted(true)
        showUndoableDelete(
            '正在删除片段...',
            async () => {
                await deleteSegment(segment.id)
                onRefresh()
            },
            () => {
                setIsDeleted(false)
                showToast('info', '删除已撤销')
            }
        )
    }

    const handleTogglePin = async (e: React.MouseEvent) => {
        e.stopPropagation()
        const newStatus = !isPinned
        const sourceId = segment.source

        // Instant local state toggle
        setIsPinned(newStatus)

        // Optimistic UI update across React Query caches
        const updateCache = (oldData: Segment[] | undefined) => {
            if (!oldData) return oldData
            return oldData.map(s => {
                if (s.id === segment.id) {
                    return { ...s, is_pinned: newStatus }
                } else if (newStatus) {
                    return { ...s, is_pinned: false } // only one allowed
                }
                return s
            }).sort((a, b) => {
                if (a.is_pinned && !b.is_pinned) return -1
                if (!a.is_pinned && b.is_pinned) return 1
                return b.segment_start - a.segment_start
            })
        }

        queryClient.setQueryData(['segments', sourceId], updateCache)
        queryClient.setQueryData(['panel-segments', sourceId], updateCache)

        try {
            await toggleSegmentPin(segment.id, newStatus)
            showToast('success', newStatus ? '片段已置顶' : '已取消置顶')
        } catch (e) {
            showToast('error', '置顶操作失败: ' + (e as Error).message)
            setIsPinned(!newStatus) // Revert local
            onRefresh() // Trigger full refresh to revert
        }
    }

    const handleDeleteSummary = (summaryId: number) => {
        setHiddenSummaryIds(prev => new Set(prev).add(summaryId))
        showUndoableDelete(
            '正在删除 AI 总结...',
            async () => {
                await deleteSummary(summaryId)
                onRefresh()
            },
            () => {
                setHiddenSummaryIds(prev => {
                    const next = new Set(prev)
                    next.delete(summaryId)
                    return next
                })
            }
        )
    }

    const handleAiClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        onOpenAiModal?.(segment)
    }

    if (isDeleted) return null

    return (
        <div id={`segment-${segment.id}`} className={`@container bg-[var(--color-card)] rounded-lg border ${isPinned ? 'border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.1)]' : 'border-[var(--color-border)]'} overflow-hidden transition-colors hover:border-[var(--color-border-hover)]`}>
            {/* Header */}
            <div
                className="px-3 @min-[480px]:px-4 py-2.5 @min-[480px]:py-3 flex items-center gap-1.5 @min-[480px]:gap-3 cursor-pointer hover:bg-[var(--color-border)]/30 flex-wrap"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                {/* Time */}
                <span className="text-xs font-mono text-[var(--color-text-muted)] flex items-center gap-1 shrink-0 whitespace-nowrap">
                    <Icons.Clock className="w-3 h-3 @min-[480px]:w-3.5 @min-[480px]:h-3.5" /> {formatTime(segment.segment_start)} - {segment.segment_end ? formatTime(segment.segment_end) : '结束'}
                </span>

                {/* Model Badge - Click to toggle transcription */}
                <button
                    className={`shrink-0 whitespace-nowrap px-[6px] py-[1px] border rounded transition-all cursor-pointer ${showTranscription
                        ? 'border-[var(--color-border)] bg-green-500/10 text-emerald-600 dark:text-[#1bfe9d] opacity-90'
                        : 'border-[var(--color-text-muted)] bg-transparent text-[var(--color-text-muted)] opacity-60'
                        } ${segment.asr_model === 'Subtitle' ? '!bg-blue-500/10 !text-blue-500 !border-blue-500/20' : ''}`}
                    style={{ fontSize: '0.65rem' }}
                    onClick={(e) => {
                        e.stopPropagation()
                        setShowTranscription(!showTranscription)
                    }}
                    title={showTranscription ? '点击收起转录文本' : '点击展开转录文本'}
                >
                    <div className="flex items-center gap-1">
                        {segment.asr_model === 'Subtitle'
                            ? <Icons.FileText className="w-3 h-3" />
                            : hasSrtMetadata(segment.text || '')
                                ? <Icons.Subtitles className="w-3 h-3" />
                                : <Icons.Mic className="w-3 h-3" />
                        }
                        <span className="hidden @min-[480px]:inline">{segment.asr_model === 'Subtitle' ? 'Subtitle' : (segment.asr_model || 'Unknown')}</span>
                        {showTranscription ? '▼' : '▶'}
                    </div>
                </button>

                {/* AI Summary Button */}
                {hasVisibleAi ? (
                    <button
                        className="shrink-0 whitespace-nowrap px-1.5 py-[2px] border border-emerald-500/50 text-emerald-500 rounded-full hover:bg-emerald-500/10 transition-colors"
                        style={{ fontSize: '0.65rem' }}
                        onClick={(e) => {
                            e.stopPropagation()
                            if (!isExpanded) setIsExpanded(true)
                            setTimeout(() => {
                                aiSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                            }, 200)
                        }}
                        title="查看 AI 总结"
                    >
                        <div className="flex items-center gap-1"><Icons.CheckCircle className="w-3 h-3" /><span className="hidden @min-[480px]:inline">AI 完成</span></div>
                    </button>
                ) : onOpenAiModal && (
                    <button
                        className="shrink-0 whitespace-nowrap px-1.5 py-[2px] border border-[var(--color-primary)] text-[var(--color-primary)] rounded-full hover:bg-[var(--color-primary)]/10 transition-colors font-semibold"
                        style={{ fontSize: '0.65rem' }}
                        onClick={handleAiClick}
                    >
                        <div className="flex items-center gap-1"><Icons.Sparkles className="w-3 h-3" /><span className="hidden @min-[480px]:inline">AI 总结</span></div>
                    </button>
                )}


                {/* Right Actions Cluster */}
                <div className="ml-auto flex items-center" onClick={e => e.stopPropagation()}>
                    <span className="text-xs text-[var(--color-text-muted)] hidden sm:inline mr-3">
                        {new Date(segment.timestamp).toLocaleDateString()}
                    </span>

                    {/* Edit/Delete */}
                    <div className="flex items-center gap-1 pl-3 border-l border-[var(--color-border)]">
                        <button
                            onClick={handleTogglePin}
                            className={`p-1.5 rounded-full transition-colors ${isPinned ? 'text-amber-500 bg-amber-500/10 hover:bg-amber-500/20' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text)]'}`}
                            title={isPinned ? "取消置顶" : "置顶"}
                        >
                            <Icons.Pin className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={() => setIsEditing(true)}
                            className="p-1.5 hover:bg-[var(--color-bg-hover)] rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                            title="编辑"
                        >
                            <Icons.Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                            onClick={handleDelete}
                            className="p-1.5 hover:bg-red-500/10 rounded-full text-[var(--color-text-muted)] hover:text-red-500 transition-colors"
                            title="删除"
                        >
                            <Icons.Trash className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {/* Expand Toggle Chevron */}
                    <div className="ml-3 pl-3 border-l border-[var(--color-border)] flex items-center">
                        <button
                            className={`w-7 h-7 rounded-full flex items-center justify-center hover:bg-[var(--color-text)]/5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-all duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                            onClick={(e) => {
                                e.stopPropagation()
                                setIsExpanded(!isExpanded)
                            }}
                        >
                            <Icons.ChevronDown className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Expanded Body with Smooth Animation */}
            <div
                className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                    }`}
            >
                <div className="overflow-hidden">
                    <div className="px-4 pb-4 border-t border-[var(--color-border)]">
                        {/* Text Content */}
                        {isEditing ? (
                            <div className="mt-4 space-y-3">
                                <textarea
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    className="w-full h-32 p-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-sm resize-none focus:border-[var(--color-primary)] focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] transition-all"
                                />
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleSave}
                                        className="px-4 py-1.5 text-sm bg-[var(--color-primary)] text-white rounded-lg hover:bg-[var(--color-primary)]/90 transition-colors shadow-sm shadow-[var(--color-primary)]/20"
                                    >
                                        保存
                                    </button>
                                    <button
                                        onClick={() => setIsEditing(false)}
                                        className="px-4 py-1.5 text-sm bg-[var(--color-border)] rounded-lg hover:bg-[var(--color-border)]/80 transition-colors"
                                    >
                                        取消
                                    </button>
                                </div>
                            </div>
                        ) : showTranscription ? (
                            <div className="mt-4">
                                {/* Preprocess preview bar — shown inline when text has SRT metadata */}
                                {hasSrtMetadata(segment.text || '') && (
                                    <div className="relative mb-3" ref={previewRef}>
                                        <button
                                            className="text-[11px] px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors flex items-center gap-1.5"
                                            onClick={() => setShowPreprocessPreview(!showPreprocessPreview)}
                                            title="预览去除时间戳后的文本"
                                        >
                                            <Icons.Subtitles className="w-3 h-3" />
                                            预处理预览
                                            {(() => {
                                                const originalLen = (segment.text || '').length
                                                const newLen = stripSubtitleMetadata(segment.text || '').length
                                                const pct = originalLen > 0 ? ((originalLen - newLen) / originalLen * 100).toFixed(0) : '0'
                                                return <span className="text-emerald-500 font-mono">-{pct}%</span>
                                            })()}
                                        </button>
                                        {showPreprocessPreview && (
                                            <div
                                                className="mt-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg overflow-hidden"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <div className="p-3 text-xs leading-5 text-[var(--color-text-muted)] max-h-48 overflow-y-auto whitespace-pre-wrap font-mono select-text cursor-text">
                                                    {stripSubtitleMetadata(segment.text || '') || <span className="italic opacity-50">暂无内容</span>}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <p className="text-sm leading-7 text-[var(--color-text)] whitespace-pre-wrap selection:bg-[var(--color-primary)]/30">
                                    {highlightText ? highlightedText : cleanEmotionTags(segment.text || '')}
                                </p>
                            </div>
                        ) : null}

                        {/* AI Actions */}
                        {!isEditing && (
                            <>
                                {hasVisibleAi ? (
                                    <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
                                        <div
                                            ref={aiSectionRef}
                                            className="flex items-center justify-between gap-2 mb-2 scroll-mt-3"
                                        >
                                            <div className="flex items-center gap-3 overflow-hidden flex-1">
                                                <h4 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider whitespace-nowrap flex-shrink-0">
                                                    AI 分析
                                                </h4>

                                                {/* Tabs */}
                                                <div className="flex-1 overflow-x-auto no-scrollbar flex gap-1">
                                                    {summaryTree.map(root => {
                                                        const isActive = root.id === activeSummaryRootId
                                                        return (
                                                            <button
                                                                key={root.id}
                                                                onClick={() => setActiveSummaryRootId(prev => prev === root.id ? null : root.id)}
                                                                className={`
                                                                    text-[10px] px-2 py-1 rounded border transition-all flex items-center gap-1 whitespace-nowrap
                                                                    ${isActive
                                                                        ? 'bg-[var(--color-primary)]/10 border-[var(--color-primary)] text-[var(--color-primary)]'
                                                                        : 'bg-[var(--color-bg)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-text-muted)]'
                                                                    }
                                                                `}
                                                            >
                                                                <Icons.Bot className="w-3 h-3" /> {root.model}
                                                            </button>
                                                        )
                                                    })}
                                                </div>
                                            </div>

                                            <button
                                                className="flex-shrink-0 text-xs px-2 py-1 bg-[var(--color-primary)]/10 text-[var(--color-primary)] rounded hover:bg-[var(--color-primary)]/20 transition-colors flex items-center gap-1"
                                                onClick={handleAiClick}
                                            >
                                                <Icons.Sparkles className="w-3 h-3" /> <span>提问</span>
                                            </button>
                                        </div>

                                        {activeSummaryRoot && (
                                            <div className="pl-1">
                                                <SummaryNode
                                                    node={activeSummaryRoot}
                                                    transcriptionId={segment.id}
                                                    onDelete={handleDeleteSummary}
                                                    onResync={() => onOpenAiModal?.(segment)}
                                                    onRefine={(node) => onOpenAiModal?.(segment, { parentId: node.id, contextText: node.summary })}
                                                    onRefresh={onRefresh}
                                                />
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <div className="mt-4 pt-3 border-t border-[var(--color-border)] flex justify-end">
                                        <button
                                            className="text-xs px-3 py-1.5 bg-[var(--color-primary)]/10 text-[var(--color-primary)] rounded-full hover:bg-[var(--color-primary)]/20 transition-colors font-medium flex items-center gap-1"
                                            onClick={handleAiClick}
                                        >
                                            <Icons.Sparkles className="w-3 h-3" /> 生成 AI 总结
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

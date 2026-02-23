import { useState, useRef, useEffect } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AISummary } from '../api/types'
import { createManualSummary, updateManualSummary } from '../api'
import Icons from './ui/Icons'
import DiffModal from './DiffModal'

interface SummaryNodeProps {
    node: AISummary & { children?: AISummary[] }
    transcriptionId: number
    onDelete: (id: number) => void
    onResync: (node: AISummary) => void
    onRefine: (node: AISummary) => void
    onRefresh: () => void
    parentSummary?: string
}

export default function SummaryNode({ node, transcriptionId, onDelete, onResync, onRefine, onRefresh, parentSummary }: SummaryNodeProps) {
    const [showPrompt, setShowPrompt] = useState(false)
    const [showRaw, setShowRaw] = useState(false)
    const [copied, setCopied] = useState(false)
    const [showMenu, setShowMenu] = useState(false)
    const [editing, setEditing] = useState(false)
    const [editText, setEditText] = useState(node.summary)
    const [saving, setSaving] = useState(false)
    const [showDiff, setShowDiff] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)

    // Reset local state when node changes
    useEffect(() => {
        setEditText(node.summary)
        setEditing(false)
    }, [node.summary])

    const handleCopy = () => {
        navigator.clipboard.writeText(node.summary)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowMenu(false)
            }
        }
        if (showMenu) {
            document.addEventListener('click', handleClickOutside)
            return () => document.removeEventListener('click', handleClickOutside)
        }
    }, [showMenu])

    const handleSaveEdit = async (overwrite = false) => {
        if (!editText.trim() || editText === node.summary) {
            setEditing(false)
            return
        }
        setSaving(true)
        try {
            if (overwrite) {
                await updateManualSummary(node.id, editText)
            } else {
                await createManualSummary({
                    transcription_id: transcriptionId,
                    summary: editText,
                    parent_id: node.id,
                    prompt: `Edited from: ${node.prompt.slice(0, 50)}...`
                })
            }
            onRefresh()
            setEditing(false)
        } catch (e) {
            alert('保存失败: ' + (e as Error).message)
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="relative pl-4 border-l-2 border-[var(--color-border)] ml-1 my-2">
            {/* Header */}
            <div className="flex justify-between items-center mb-2 flex-wrap gap-1">
                <div className="flex items-center gap-2">
                    <span
                        className="text-xs font-medium cursor-pointer hover:text-[var(--color-primary)] flex items-center gap-1"
                        onClick={() => setShowPrompt(!showPrompt)}
                        title="点击显示/隐藏提示词"
                    >
                        <Icons.Bot className="w-3.5 h-3.5" /> {node.model}
                    </span>
                    <span className="text-[10px] text-[var(--color-text-muted)] flex items-center gap-0.5">
                        {node.response_time ? <><Icons.Zap className="w-3 h-3" /> {node.response_time.toFixed(2)}s</> : ''}
                    </span>
                    <span className="text-[10px] text-[var(--color-text-muted)] opacity-60">
                        {new Date(node.timestamp).toLocaleString()}
                    </span>
                </div>
                <div className="flex gap-1 items-center">
                    {/* Raw/Markdown Toggle */}
                    <button
                        onClick={() => setShowRaw(!showRaw)}
                        className={`p-1.5 rounded transition-colors ${showRaw
                            ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]'
                            : 'hover:bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]'
                            }`}
                        title={showRaw ? '显示 Markdown 渲染' : '显示原始文本'}
                    >
                        {showRaw ? <Icons.FileText className="w-3.5 h-3.5" /> : <Icons.Code className="w-3.5 h-3.5" />}
                    </button>
                    {/* Copy */}
                    <button
                        onClick={handleCopy}
                        className={`p-1.5 rounded transition-colors ${copied
                            ? 'bg-emerald-500/20 text-emerald-500'
                            : 'hover:bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]'
                            }`}
                        title="复制内容"
                    >
                        {copied ? <Icons.Check className="w-3.5 h-3.5" /> : <Icons.Clipboard className="w-3.5 h-3.5" />}
                    </button>
                    {/* Delete */}
                    <button
                        onClick={() => onDelete(node.id)}
                        className="p-1.5 rounded hover:bg-red-500/10 text-[var(--color-text-muted)] hover:text-red-500 transition-colors"
                        title="删除"
                    >
                        <Icons.Trash className="w-3.5 h-3.5" />
                    </button>
                    {/* Advanced Tools Menu */}
                    <div className="relative" ref={menuRef}>
                        <button
                            onClick={() => setShowMenu(!showMenu)}
                            className={`p-1.5 rounded transition-colors ${showMenu
                                ? 'bg-[var(--color-primary)]/20 text-[var(--color-primary)]'
                                : 'hover:bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]'
                                }`}
                            title="高级工具"
                        >
                            <Icons.MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                        {showMenu && (
                            <div
                                className="absolute right-0 top-full mt-1 w-36 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg shadow-xl z-50 py-1"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <button
                                    onClick={() => { setEditing(true); setShowMenu(false); setEditText(node.summary) }}
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-bg-hover)] flex items-center gap-2"
                                >
                                    <Icons.Edit className="w-4 h-4" />
                                    编辑
                                </button>
                                {parentSummary && (
                                    <button
                                        onClick={() => { setShowDiff(true); setShowMenu(false) }}
                                        className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-bg-hover)] flex items-center gap-2"
                                    >
                                        <Icons.ArrowsHorizontal className="w-4 h-4" />
                                        版本对比
                                    </button>
                                )}
                                <button
                                    onClick={() => { onResync(node); setShowMenu(false) }}
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-bg-hover)] flex items-center gap-2"
                                >
                                    <Icons.RotateCw className="w-4 h-4" />
                                    重新总结
                                </button>
                                <button
                                    onClick={() => { onRefine(node); setShowMenu(false) }}
                                    className="w-full px-3 py-2 text-left text-sm hover:bg-[var(--color-bg-hover)] flex items-center gap-2"
                                >
                                    <Icons.MessageCircle className="w-4 h-4" />
                                    再度提问
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Prompt Box */}
            {showPrompt && (
                <div className="mb-2 bg-black/20 p-2 rounded text-xs text-[var(--color-text-muted)] font-mono whitespace-pre-wrap border border-[var(--color-border)]">
                    <div className="font-bold mb-1 opacity-50">Prompt:</div>
                    {node.prompt}
                </div>
            )}

            {/* Edit Mode */}
            {editing ? (
                <div className="space-y-2 mt-2">
                    <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="w-full h-48 p-3 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-sm font-mono resize-y focus:border-[var(--color-primary)] focus:outline-none"
                        placeholder="编辑总结内容..."
                    />
                    <div className="flex gap-2 justify-end">
                        <button
                            onClick={() => { setEditing(false); setEditText(node.summary) }}
                            className="px-3 py-1.5 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-bg-hover)] rounded border border-[var(--color-border)]"
                            disabled={saving}
                        >
                            取消
                        </button>
                        <button
                            onClick={() => handleSaveEdit(false)}
                            disabled={saving || !editText.trim()}
                            className="px-3 py-1.5 text-sm bg-[var(--color-primary)] text-white rounded hover:bg-[var(--color-primary)]/90 disabled:opacity-50 flex items-center gap-1"
                        >
                            {saving ? '保存中...' : <><Icons.Save className="w-3.5 h-3.5" /> 保存为新版本</>}
                        </button>
                        <button
                            onClick={() => handleSaveEdit(true)}
                            disabled={saving || !editText.trim()}
                            className="px-3 py-1.5 text-sm bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50 flex items-center gap-1"
                            title="直接修改当前版本，不创建新记录"
                        >
                            <Icons.AlertTriangle className="w-3.5 h-3.5" /> 覆盖当前
                        </button>
                    </div>
                </div>
            ) : showRaw ? (
                <div
                    className="text-sm whitespace-pre-wrap leading-relaxed font-mono p-4 rounded-lg border"
                    style={{
                        color: 'var(--color-text)',
                        background: 'var(--md-code-bg)',
                        borderColor: 'var(--color-border)',
                    }}
                >
                    {node.summary}
                </div>
            ) : (
                <div
                    className="ai-content-rendered"
                    style={{
                        padding: '14px',
                        background: 'var(--md-bg)',
                        border: '1px dashed var(--md-border)',
                        borderRadius: '8px',
                        fontSize: '0.85rem',
                        lineHeight: '1.6',
                    }}
                >
                    <div className="markdown-body">
                        <Markdown remarkPlugins={[remarkGfm]}>{node.summary}</Markdown>
                    </div>
                </div>
            )}

            {/* Diff Modal */}
            {showDiff && parentSummary && (
                <DiffModal
                    oldText={parentSummary}
                    newText={node.summary}
                    onClose={() => setShowDiff(false)}
                />
            )}

            {/* Children */}
            {node.children && node.children.length > 0 && (
                <div className="mt-3">
                    {node.children.map(child => (
                        <SummaryNode
                            key={child.id}
                            node={child}
                            transcriptionId={transcriptionId}
                            onDelete={onDelete}
                            onResync={onResync}
                            onRefine={onRefine}
                            onRefresh={onRefresh}
                            parentSummary={node.summary}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

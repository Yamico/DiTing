import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useTranslation } from 'react-i18next'
import {
    createQAConversation, getQAConversations, deleteQAConversation,
    getQAMessages, askQuestion, deleteQAMessage,
} from '../api/client'
import { getLLMProviders } from '../api/client'
import { useToast } from '../contexts/ToastContext'
import type { QAAttachment, QAMessage } from '../api/types'
import Icons from './ui/Icons'
import {
    loadPreferredLLMModelId,
    resolvePreferredLLMModelId,
    savePreferredLLMModelId,
} from '../utils/preferredLLMModel'

const API_BASE = '/api'
const MAX_PASTED_IMAGES = 4

interface QAPanelProps {
    sourceId: string
    onSeek?: (time: number) => void
}

interface PastedImage {
    file: File
    previewUrl: string
}

export default function QAPanel({ sourceId, onSeek }: QAPanelProps) {
    const { t } = useTranslation()
    const { showToast } = useToast()
    const queryClient = useQueryClient()
    const [activeConvId, setActiveConvId] = useState<number | null>(null)
    const [input, setInput] = useState('')
    const [streamingText, setStreamingText] = useState('')
    const [streamingModel, setStreamingModel] = useState('')
    const [isStreaming, setIsStreaming] = useState(false)
    const [selectedModelId, setSelectedModelId] = useState<number | ''>('')
    const [showConvList, setShowConvList] = useState(false)
    const [copiedMsgId, setCopiedMsgId] = useState<number | null>(null)
    const [pastedImages, setPastedImages] = useState<PastedImage[]>([])
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)
    const abortRef = useRef<AbortController | null>(null)
    const pastedImagesRef = useRef<PastedImage[]>([])
    const retainedPreviewUrlsRef = useRef<string[]>([])

    useEffect(() => {
        pastedImagesRef.current = pastedImages
    }, [pastedImages])

    useEffect(() => () => {
        pastedImagesRef.current.forEach(image => URL.revokeObjectURL(image.previewUrl))
        retainedPreviewUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
        retainedPreviewUrlsRef.current = []
    }, [])

    const { data: conversations = [] } = useQuery({
        queryKey: ['qa-conversations', sourceId],
        queryFn: () => getQAConversations(sourceId),
    })

    const { data: messages = [], refetch: refetchMessages } = useQuery({
        queryKey: ['qa-messages', activeConvId],
        queryFn: () => activeConvId ? getQAMessages(activeConvId) : Promise.resolve([]),
        enabled: !!activeConvId,
    })

    const { data: providers = [] } = useQuery({
        queryKey: ['llm-providers'],
        queryFn: getLLMProviders,
    })

    useEffect(() => {
        if (providers.length === 0) return

        const storedModelId = loadPreferredLLMModelId(localStorage)
        const resolution = resolvePreferredLLMModelId(providers, storedModelId)

        if (resolution.shouldClearStoredPreference) {
            savePreferredLLMModelId(localStorage, '')
        }

        setSelectedModelId(prev => prev === resolution.selectedModelId ? prev : resolution.selectedModelId)
    }, [providers])

    useEffect(() => {
        if (conversations.length > 0 && !activeConvId) {
            setActiveConvId(conversations[0]?.id ?? null)
        }
    }, [conversations, activeConvId])

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, streamingText])

    const createConv = useMutation({
        mutationFn: () => createQAConversation(sourceId),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['qa-conversations', sourceId] })
            setActiveConvId(data.id)
            setShowConvList(false)
        },
    })

    const deleteConv = useMutation({
        mutationFn: (id: number) => deleteQAConversation(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['qa-conversations', sourceId] })
            if (activeConvId) {
                const remaining = conversations.filter(c => c.id !== activeConvId)
                setActiveConvId(remaining.length > 0 ? remaining[0]?.id ?? null : null)
            }
        },
    })

    const deleteMsg = useMutation({
        mutationFn: (id: number) => deleteQAMessage(id),
        onSuccess: () => {
            refetchMessages()
        },
    })

    const handleCopyMessage = (msg: QAMessage) => {
        navigator.clipboard.writeText(msg.content)
        setCopiedMsgId(msg.id)
        setTimeout(() => setCopiedMsgId(null), 1500)
    }

    const handleDeleteMessage = (msg: QAMessage) => {
        if (confirm(t('detail.qa.deleteMessageConfirm', 'Are you sure you want to delete this message?'))) {
            deleteMsg.mutate(msg.id)
        }
    }

    const appendPastedImages = (files: File[]) => {
        if (files.length === 0) {
            return
        }

        setPastedImages(prev => {
            const remaining = MAX_PASTED_IMAGES - prev.length
            if (remaining <= 0) {
                showToast('error', t('detail.qa.imageLimit', { count: MAX_PASTED_IMAGES }))
                return prev
            }

            const accepted = files.slice(0, remaining).map(file => ({
                file,
                previewUrl: URL.createObjectURL(file),
            }))

            if (files.length > remaining) {
                showToast('error', t('detail.qa.imageLimit', { count: MAX_PASTED_IMAGES }))
            }

            return [...prev, ...accepted]
        })
    }

    const removePastedImage = (previewUrl: string) => {
        setPastedImages(prev => {
            const target = prev.find(image => image.previewUrl === previewUrl)
            if (target) {
                URL.revokeObjectURL(target.previewUrl)
            }
            return prev.filter(image => image.previewUrl !== previewUrl)
        })
    }

    const clearRetainedPreviewUrls = () => {
        retainedPreviewUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
        retainedPreviewUrlsRef.current = []
    }

    const observeStream = useCallback(async (taskId: number) => {
        const controller = new AbortController()
        abortRef.current = controller
        setIsStreaming(true)
        setStreamingText('')
        setStreamingModel('')

        try {
            const response = await fetch(`${API_BASE}/qa/stream/${taskId}`, {
                signal: controller.signal,
            })
            if (!response.ok) {
                setIsStreaming(false)
                await refetchMessages()
                clearRetainedPreviewUrls()
                return
            }

            const reader = response.body!.getReader()
            const decoder = new TextDecoder()
            let buffer = ''

            while (true) {
                const { done, value } = await reader.read()
                if (done) break

                buffer += decoder.decode(value, { stream: true })
                const parts = buffer.split('\n\n')
                buffer = parts.pop()!

                for (const part of parts) {
                    const dataLine = part.split('\n').find(line => line.startsWith('data: '))
                    if (!dataLine) continue
                    try {
                        const data = JSON.parse(dataLine.slice(6))
                        switch (data.type) {
                            case 'start':
                                setStreamingModel(data.model)
                                break
                            case 'chunk':
                                setStreamingText(prev => prev + data.text)
                                break
                            case 'done':
                                setIsStreaming(false)
                                setStreamingText('')
                                await refetchMessages()
                                clearRetainedPreviewUrls()
                                queryClient.invalidateQueries({ queryKey: ['qa-conversations', sourceId] })
                                break
                            case 'error':
                                setIsStreaming(false)
                                setStreamingText('')
                                await refetchMessages()
                                clearRetainedPreviewUrls()
                                break
                        }
                    } catch {
                        // Ignore malformed SSE chunks.
                    }
                }
            }
        } catch (e: any) {
            if (e.name !== 'AbortError') {
                setIsStreaming(false)
                setStreamingText('')
                await refetchMessages()
                clearRetainedPreviewUrls()
            }
        }
    }, [refetchMessages, queryClient, sourceId])

    const handleSend = async () => {
        const question = input.trim()
        if (!question || isStreaming) return

        let convId = activeConvId
        if (!convId) {
            const result = await createQAConversation(sourceId)
            convId = result.id
            setActiveConvId(convId)
            queryClient.invalidateQueries({ queryKey: ['qa-conversations', sourceId] })
        }

        const imagesForSend = pastedImages
        setInput('')

        const optimisticAttachments: QAAttachment[] = imagesForSend.map((image, index) => ({
            id: -(Date.now() + index),
            filename: image.file.name || `pasted-image-${index + 1}.png`,
            mime_type: image.file.type || 'image/png',
            url: image.previewUrl,
        }))

        const optimisticMsg: QAMessage = {
            id: -Date.now(),
            conversation_id: convId,
            role: 'user',
            content: question,
            model: null,
            response_time: null,
            created_at: new Date().toISOString(),
            attachments: optimisticAttachments,
        }
        queryClient.setQueryData<QAMessage[]>(['qa-messages', convId], prev => [...(prev || []), optimisticMsg])

        try {
            const { task_id } = await askQuestion(
                convId,
                question,
                selectedModelId || undefined,
                imagesForSend.map(image => image.file),
            )
            if (imagesForSend.length > 0) {
                retainedPreviewUrlsRef.current.push(...imagesForSend.map(image => image.previewUrl))
                setPastedImages([])
            }
            observeStream(task_id)
        } catch {
            refetchMessages()
        }
    }

    const renderTimestamps = (text: string) => {
        if (!onSeek) return text
        const parts = text.split(/(\[\d{1,2}:\d{2}\])/)
        return parts.map((part, i) => {
            const match = part.match(/^\[(\d{1,2}):(\d{2})\]$/)
            if (match) {
                const seconds = parseInt(match[1]!) * 60 + parseInt(match[2]!)
                return (
                    <button
                        key={i}
                        onClick={() => onSeek(seconds)}
                        className="inline-flex items-center px-1 py-0.5 text-xs font-mono rounded bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 transition-colors cursor-pointer"
                    >
                        {part}
                    </button>
                )
            }
            return <span key={i}>{part}</span>
        })
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const imageFiles = Array.from(e.clipboardData.items)
            .filter(item => item.type.startsWith('image/'))
            .map(item => item.getAsFile())
            .filter((file): file is File => !!file)

        if (imageFiles.length === 0) {
            return
        }

        appendPastedImages(imageFiles)
        e.preventDefault()
    }

    const handleModelChange = (value: string) => {
        const nextModelId: number | '' = value ? Number(value) : ''
        setSelectedModelId(nextModelId)
        savePreferredLLMModelId(localStorage, nextModelId)
    }

    const allModels = providers.flatMap(provider => provider.models.map(model => ({ ...model, providerName: provider.name })))
    const activeModel = allModels.find(model => model.is_active)

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--color-border)] shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                    <Icons.MessageCircle className="w-4 h-4 text-[var(--color-primary)] shrink-0" />
                    <span className="text-sm font-medium truncate">
                        {activeConvId
                            ? (conversations.find(c => c.id === activeConvId)?.title || t('detail.qa.newConversation', 'New Chat'))
                            : t('detail.qa.title', 'AI Q&A')}
                    </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        onClick={() => setShowConvList(!showConvList)}
                        className="p-1.5 rounded-md hover:bg-[var(--color-card-muted)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                        title={t('detail.qa.conversations', 'Conversations')}
                    >
                        <Icons.List className="w-3.5 h-3.5" />
                    </button>
                    <button
                        onClick={() => createConv.mutate()}
                        className="p-1.5 rounded-md hover:bg-[var(--color-card-muted)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                        title={t('detail.qa.newConversation', 'New Chat')}
                    >
                        <Icons.Plus className="w-3.5 h-3.5" />
                    </button>
                </div>
            </div>

            {showConvList && conversations.length > 0 && (
                <div className="border-b border-[var(--color-border)] bg-[var(--color-card-muted)] max-h-48 overflow-y-auto">
                    {conversations.map(conv => (
                        <div
                            key={conv.id}
                            className={`flex items-center justify-between px-4 py-2 text-sm cursor-pointer hover:bg-[var(--color-card)] transition-colors ${
                                conv.id === activeConvId ? 'bg-[var(--color-card)] text-[var(--color-primary)]' : 'text-[var(--color-text)]'
                            }`}
                            onClick={() => { setActiveConvId(conv.id); setShowConvList(false) }}
                        >
                            <span className="truncate">{conv.title || t('detail.qa.newConversation', 'New Chat')}</span>
                            <button
                                onClick={(e) => { e.stopPropagation(); deleteConv.mutate(conv.id) }}
                                className="p-1 rounded hover:bg-red-500/10 text-[var(--color-text-muted)] hover:text-red-500 transition-colors shrink-0"
                            >
                                <Icons.Trash className="w-3 h-3" />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-6">
                {messages.length === 0 && !isStreaming && (
                    <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-muted)] text-sm gap-2">
                        <Icons.MessageCircle className="w-8 h-8 opacity-30" />
                        <p>{t('detail.qa.emptyHint', 'Ask a question about the video')}</p>
                    </div>
                )}
                {messages.map(msg => (
                    <div key={msg.id} className={`group flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className="relative max-w-[85%]">
                            <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                                msg.role === 'user'
                                    ? 'bg-[var(--color-primary)] text-white rounded-br-md'
                                    : 'bg-[var(--color-card-muted)] text-[var(--color-text)] rounded-bl-md'
                            }`}>
                                {msg.attachments && msg.attachments.length > 0 && (
                                    <div className="mb-2 space-y-2">
                                        {msg.attachments.map(attachment => (
                                            <img
                                                key={`${msg.id}-${attachment.id}`}
                                                src={attachment.url}
                                                alt={attachment.filename}
                                                className={`block max-w-full max-h-56 rounded-xl border object-contain ${
                                                    msg.role === 'user'
                                                        ? 'border-white/20 bg-white/10'
                                                        : 'border-[var(--color-border)] bg-[var(--color-card)]'
                                                }`}
                                            />
                                        ))}
                                    </div>
                                )}
                                {msg.role === 'assistant' ? (
                                    <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5">
                                        <Markdown
                                            remarkPlugins={[remarkGfm]}
                                            components={{
                                                p: ({ children }) => <p>{typeof children === 'string' ? renderTimestamps(children) : children}</p>,
                                            }}
                                        >
                                            {msg.content}
                                        </Markdown>
                                    </div>
                                ) : (
                                    <p className="whitespace-pre-wrap">{msg.content}</p>
                                )}
                                {msg.role === 'assistant' && msg.model && (
                                    <div className="mt-1.5 text-[10px] text-[var(--color-text-muted)] opacity-60">
                                        {msg.model}{msg.response_time ? ` · ${msg.response_time}s` : ''}
                                    </div>
                                )}
                            </div>
                            {msg.id > 0 && (
                                <div className={`absolute -bottom-5 ${msg.role === 'user' ? 'right-1' : 'left-1'} flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity`}>
                                    <button
                                        onClick={() => handleCopyMessage(msg)}
                                        className="p-0.5 rounded hover:bg-[var(--color-card-muted)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                                        title={t('detail.qa.copyMessage', 'Copy')}
                                    >
                                        {copiedMsgId === msg.id
                                            ? <Icons.Check className="w-3 h-3 text-green-500" />
                                            : <Icons.Clipboard className="w-3 h-3" />}
                                    </button>
                                    <button
                                        onClick={() => handleDeleteMessage(msg)}
                                        className="p-0.5 rounded hover:bg-red-500/10 text-[var(--color-text-muted)] hover:text-red-500 transition-colors"
                                        title={t('detail.qa.deleteMessage', 'Delete')}
                                    >
                                        <Icons.Trash className="w-3 h-3" />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
                {isStreaming && (
                    <div className="flex justify-start">
                        <div className="max-w-[85%] rounded-2xl rounded-bl-md px-3.5 py-2.5 text-sm bg-[var(--color-card-muted)] text-[var(--color-text)] leading-relaxed">
                            {streamingText ? (
                                <div className="prose prose-sm dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5">
                                    <Markdown remarkPlugins={[remarkGfm]}>{streamingText}</Markdown>
                                </div>
                            ) : (
                                <div className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
                                    <div className="flex gap-0.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
                                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
                                        <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
                                    </div>
                                    {streamingModel && <span className="text-[10px] ml-1">{streamingModel}</span>}
                                </div>
                            )}
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-[var(--color-border)] px-3 py-2.5 shrink-0">
                {pastedImages.length > 0 && (
                    <div className="mb-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card-muted)] p-2.5">
                        <div className="mb-2 flex items-center justify-between gap-3">
                            <div className="min-w-0 flex-1">
                                <div className="text-xs font-medium text-[var(--color-text)]">
                                    {t('detail.qa.imageCount', { count: pastedImages.length })}
                                </div>
                                <div className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                                    {t('detail.qa.pasteHint', 'Take a screenshot and press Ctrl+V here to attach it')}
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {pastedImages.map((image, index) => (
                                <div key={image.previewUrl} className="relative overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]">
                                    <img
                                        src={image.previewUrl}
                                        alt={`${t('detail.qa.imageAttached', 'Image attached')} ${index + 1}`}
                                        className="h-24 w-full object-cover"
                                    />
                                    <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                                        <span className="truncate text-[10px] text-[var(--color-text-muted)]">
                                            {image.file.name || `image-${index + 1}.png`}
                                        </span>
                                        <button
                                            onClick={() => removePastedImage(image.previewUrl)}
                                            type="button"
                                            className="p-1 rounded-md hover:bg-[var(--color-card-muted)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors shrink-0"
                                            title={t('detail.qa.removeImage', 'Remove image')}
                                        >
                                            <Icons.X className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                <div className="flex items-center gap-2 mb-2">
                    <select
                        value={selectedModelId}
                        onChange={e => handleModelChange(e.target.value)}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-[var(--color-card-muted)] border border-[var(--color-border)] text-[var(--color-text-muted)] outline-none"
                    >
                        <option value="">{activeModel ? `${activeModel.model_name} (${t('common.default', 'Default')})` : t('detail.qa.selectModel', 'Select model')}</option>
                        {allModels.map(model => (
                            <option key={model.id} value={model.id}>{model.model_name} ({model.providerName})</option>
                        ))}
                    </select>
                </div>
                <div className="flex items-end gap-2">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onPaste={handlePaste}
                        placeholder={t('detail.qa.inputPlaceholder', 'Type your question...')}
                        rows={1}
                        className="flex-1 resize-none rounded-xl px-3 py-2 text-sm bg-[var(--color-card-muted)] border border-[var(--color-border)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none focus:ring-1 focus:ring-[var(--color-primary)] max-h-32 overflow-y-auto"
                        style={{ minHeight: '36px' }}
                        onInput={e => {
                            const el = e.target as HTMLTextAreaElement
                            el.style.height = 'auto'
                            el.style.height = Math.min(el.scrollHeight, 128) + 'px'
                        }}
                        disabled={isStreaming}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isStreaming}
                        className="p-2 rounded-xl bg-[var(--color-primary)] text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity shrink-0"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    )
}

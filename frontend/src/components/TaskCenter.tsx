import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import Icons from './ui/Icons'
import { getTasks, cancelTask } from '../api/client'
import { Task } from '../api/types'
import ConfirmModal from './ConfirmModal'

interface TaskCenterProps {
    isOpen: boolean
    onClose: () => void
}

export default function TaskCenter({ isOpen, onClose }: TaskCenterProps) {
    const { t } = useTranslation()
    const queryClient = useQueryClient()
    const [cancellingIds, setCancellingIds] = useState<number[]>([])

    // Use React Query for polling
    const { data: tasks } = useQuery({
        queryKey: ['tasks'],
        queryFn: getTasks,
        refetchInterval: 1000,
        enabled: isOpen, // Only poll when open
    })

    const cancelMutation = useMutation({
        mutationFn: cancelTask,
        onSuccess: (_, taskId) => {
            // Optimistic update or invalidate
            queryClient.setQueryData(['tasks'], (old: Record<string, Task> | undefined) => {
                if (!old) return old
                return {
                    ...old,
                    [taskId]: { ...old[taskId], status: 'cancelling' as const }
                }
            })
            queryClient.invalidateQueries({ queryKey: ['tasks'] })
        },
        onError: (error) => {
            console.error("Failed to cancel task", error)
            alert(t('taskCenter.cancelFailed'))
        },
        onSettled: (_, __, taskId) => {
            setCancellingIds(prev => prev.filter(id => id !== taskId))
        }
    })

    const [pendingCancelId, setPendingCancelId] = useState<number | null>(null)

    const handleCancel = (taskId: number) => {
        setPendingCancelId(null)
        setCancellingIds(prev => [...prev, taskId])
        cancelMutation.mutate(taskId)
    }

    // Effect to close Task Center on ESC (if no confirmation modal is open)
    useEffect(() => {
        if (!isOpen) return

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && pendingCancelId === null) {
                onClose()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, onClose, pendingCancelId])

    if (!isOpen) return null

    const taskList = Object.values(tasks || {}).sort((a, b) => b.id - a.id)
    const activeTasks = taskList.filter(t => ['processing', 'pending', 'cancelling'].includes(t.status))
    const completedTasks = taskList.filter(t => !['processing', 'pending', 'cancelling'].includes(t.status))

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-end p-4 sm:p-6 request-animation">
            <div className="fixed inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose}></div>

            <div className="relative w-full max-w-md bg-[var(--color-card)] border border-[var(--color-border)] rounded-xl shadow-2xl flex flex-col max-h-[80vh] animate-in slide-in-from-right-10 fade-in duration-200">
                <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-bg)] rounded-t-xl">
                    <h2 className="text-lg font-bold flex items-center gap-2">
                        <Icons.Cpu className="w-5 h-5 text-indigo-500" />
                        {t('taskCenter.title')}
                        {activeTasks.length > 0 && (
                            <span className="px-2 py-0.5 text-xs bg-indigo-500/10 text-indigo-500 rounded-full">
                                {t('taskCenter.activeCount', { count: activeTasks.length })}
                            </span>
                        )}
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-[var(--color-border)] rounded-full transition-colors">
                        <Icons.X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {taskList.length === 0 ? (
                        <div className="text-center py-8 text-[var(--color-text-muted)]">
                            <Icons.CheckCircle className="w-12 h-12 mx-auto mb-2 opacity-20" />
                            <p>{t('taskCenter.noTasks')}</p>
                        </div>
                    ) : (
                        <>
                            {/* Active Tasks */}
                            {activeTasks.length > 0 && (
                                <div className="space-y-3">
                                    <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                                        {t('taskCenter.active')}
                                    </h3>
                                    {activeTasks.map(task => (
                                        <TaskCard key={task.id} task={task} onCancel={(id) => setPendingCancelId(id)} isCancelling={cancellingIds.includes(task.id)} />
                                    ))}
                                </div>
                            )}

                            {/* History Tasks (Limit to last 5 maybe? Or just show all) */}
                            {completedTasks.length > 0 && (
                                <div className="space-y-3">
                                    <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mt-6">
                                        {t('taskCenter.history')}
                                    </h3>
                                    {completedTasks.slice(0, 10).map(task => (
                                        <TaskCard key={task.id} task={task} />
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            <ConfirmModal
                isOpen={pendingCancelId !== null}
                title={t('taskCenter.forceCancel')}
                message={t('taskCenter.confirmCancel')}
                variant="warning"
                onConfirm={() => pendingCancelId !== null && handleCancel(pendingCancelId)}
                onCancel={() => setPendingCancelId(null)}
            />
        </div>
    )
}

function TaskCard({ task, onCancel, isCancelling }: { task: Task & { meta?: any }, onCancel?: (id: number) => void, isCancelling?: boolean }) {
    const { t } = useTranslation()
    const isProcessing = ['processing', 'pending'].includes(task.status)
    const isCancelled = task.status === 'cancelled' || task.status === 'cancelling'
    const isFailed = task.status === 'failed'

    // Meta extraction
    const type = task.meta?.type || 'unknown'
    const name = task.meta?.filename || task.meta?.url || `Task #${task.id}`
    const simpleName = name.startsWith('http') ? (name.length > 40 ? name.substring(0, 40) + '...' : name) : name.split('/').pop()

    return (
        <div className={`p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] ${isProcessing ? 'border-l-4 border-l-indigo-500' : ''}`}>
            <div className="flex justify-between items-start gap-3">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wide
                            ${type === 'youtube' ? 'bg-red-500/10 text-red-500' :
                                type === 'bilibili' ? 'bg-pink-500/10 text-pink-500' :
                                    'bg-gray-500/10 text-gray-500'}`}>
                            {type}
                        </span>
                        <h4 className="font-medium text-sm truncate" title={name}>{simpleName}</h4>
                    </div>

                    <div className="space-y-1">
                        <div className="flex justify-between text-xs text-[var(--color-text-muted)]">
                            <span>{task.message || task.status}</span>
                            <span>{Math.round(task.progress)}%</span>
                        </div>
                        {isProcessing && (
                            <div className="h-1.5 w-full bg-[var(--color-border)] rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-indigo-500 transition-all duration-500"
                                    style={{ width: `${task.progress}%` }}
                                />
                            </div>
                        )}
                    </div>
                </div>

                {isProcessing && onCancel && (
                    <button
                        onClick={() => onCancel(task.id)}
                        disabled={isCancelling}
                        className="p-1.5 text-red-500 hover:bg-red-500/10 rounded transition-colors disabled:opacity-50"
                        title={t('taskCenter.forceCancel')}
                    >
                        {isCancelling ? <Icons.Loader className="w-4 h-4 animate-spin" /> : <Icons.XCircle className="w-4 h-4" />}
                    </button>
                )}

                {isCancelled && <span title={t('taskCenter.cancelled')}><Icons.Slash className="w-4 h-4 text-[var(--color-text-muted)]" /></span>}
                {isFailed && <span title={t('taskCenter.failed')}><Icons.AlertCircle className="w-4 h-4 text-red-500" /></span>}
                {task.status === 'completed' && <span title={t('taskCenter.completed')}><Icons.Check className="w-4 h-4 text-green-500" /></span>}
            </div>
        </div>
    )
}

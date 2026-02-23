/**
 * Global Toast Context
 * Provides toast notifications across the entire application
 * Supports: success, error, warning, info, and undoable delete operations
 */
import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import Icons from '../components/ui/Icons'

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'delete'

export interface Toast {
    id: string
    type: ToastType
    message: string
    duration?: number
    // For undoable delete operations
    onUndo?: () => void
    countdown?: number
}

interface ToastContextValue {
    toasts: Toast[]
    showToast: (type: ToastType, message: string, duration?: number) => void
    showUndoableDelete: (message: string, onConfirm: () => Promise<void>, onUndo?: () => void) => void
    dismissToast: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
    const ctx = useContext(ToastContext)
    if (!ctx) throw new Error('useToast must be used within ToastProvider')
    return ctx
}

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([])

    const dismissToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    const showToast = useCallback((type: ToastType, message: string, duration = 3000) => {
        const id = `${Date.now()}-${Math.random()}`
        setToasts(prev => [...prev, { id, type, message, duration }])

        if (duration > 0) {
            setTimeout(() => dismissToast(id), duration)
        }
    }, [dismissToast])

    const showUndoableDelete = useCallback((
        message: string,
        onConfirm: () => Promise<void>,
        onUndo?: () => void
    ) => {
        const id = `${Date.now()}-${Math.random()}`
        const DELAY = 3000

        // Add toast with countdown
        setToasts(prev => [...prev, {
            id,
            type: 'delete',
            message,
            countdown: 3,
            onUndo: () => {
                // Cancel the pending delete
                dismissToast(id)
                onUndo?.()
            }
        }])

        // Countdown effect
        let remaining = 3
        const countdownInterval = setInterval(() => {
            remaining -= 1
            setToasts(prev => prev.map(t =>
                t.id === id ? { ...t, countdown: remaining } : t
            ))
            if (remaining <= 0) clearInterval(countdownInterval)
        }, 1000)

        // Execute delete after delay
        const timer = setTimeout(async () => {
            clearInterval(countdownInterval)
            dismissToast(id)
            try {
                await onConfirm()
                showToast('success', '删除成功', 2000)
            } catch (e) {
                showToast('error', '删除失败: ' + (e as Error).message, 4000)
                onUndo?.() // Restore on failure
            }
        }, DELAY)

        // Store timer in toast for potential cleanup
        // Note: We handle undo by filtering out the toast which prevents the timeout from running the confirm
        // But we need to clear the timeout when undo is called
        // Workaround: wrap in closure
        setToasts(prev => prev.map(t =>
            t.id === id ? {
                ...t,
                onUndo: () => {
                    clearTimeout(timer)
                    clearInterval(countdownInterval)
                    dismissToast(id)
                    onUndo?.()
                }
            } : t
        ))
    }, [dismissToast, showToast])

    return (
        <ToastContext.Provider value={{ toasts, showToast, showUndoableDelete, dismissToast }}>
            {children}
            <ToastContainer toasts={toasts} onDismiss={dismissToast} />
        </ToastContext.Provider>
    )
}

// Toast Container Component
function ToastContainer({ toasts, onDismiss }: { toasts: Toast[], onDismiss: (id: string) => void }) {
    if (toasts.length === 0) return null

    return (
        <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
            {toasts.map(toast => (
                <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
            ))}
        </div>
    )
}

// Individual Toast Item
function ToastItem({ toast, onDismiss }: { toast: Toast, onDismiss: (id: string) => void }) {
    const bgColors = {
        success: 'border-green-500/50 bg-green-500/10',
        error: 'border-red-500/50 bg-red-500/10',
        warning: 'border-amber-500/50 bg-amber-500/10',
        info: 'border-blue-500/50 bg-blue-500/10',
        delete: 'border-amber-500/50 bg-[var(--color-card)]',
    }

    const iconColors = {
        success: 'text-green-500',
        error: 'text-red-500',
        warning: 'text-amber-500',
        info: 'text-blue-500',
        delete: 'text-amber-500',
    }

    const IconComponent = {
        success: Icons.Check,
        error: Icons.X,
        warning: Icons.AlertTriangle,
        info: Icons.Info,
        delete: Icons.Trash,
    }[toast.type]

    return (
        <div
            className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-2xl backdrop-blur-sm animate-in slide-in-from-right duration-300 ${bgColors[toast.type]}`}
        >
            <IconComponent className={`w-5 h-5 flex-shrink-0 ${iconColors[toast.type]}`} />

            <div className="flex-1 min-w-0">
                <span className="text-sm text-[var(--color-text)]">{toast.message}</span>
                {toast.type === 'delete' && toast.countdown !== undefined && (
                    <span className="text-xs text-[var(--color-text-muted)] ml-1">({toast.countdown}秒)</span>
                )}
            </div>

            {toast.type === 'delete' && toast.onUndo ? (
                <button
                    onClick={toast.onUndo}
                    className="px-3 py-1 text-sm bg-[var(--color-primary)] text-white rounded font-medium hover:bg-[var(--color-primary)]/80 transition-colors flex-shrink-0"
                >
                    撤销
                </button>
            ) : (
                <button
                    onClick={() => onDismiss(toast.id)}
                    className="p-1 hover:bg-[var(--color-hover-bg)] rounded transition-colors flex-shrink-0"
                >
                    <Icons.X className="w-4 h-4 text-[var(--color-text-muted)]" />
                </button>
            )}
        </div>
    )
}

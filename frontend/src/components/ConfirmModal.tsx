import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useEscapeKey } from '../hooks/useEscapeKey'
import Icons from './ui/Icons'

interface ConfirmModalProps {
    isOpen: boolean
    title: string
    message: string
    confirmText?: string
    cancelText?: string
    variant?: 'danger' | 'warning' | 'info'
    onConfirm: () => void
    onCancel: () => void
    tertiaryText?: string
    onTertiary?: () => void
    tertiaryVariant?: 'danger' | 'warning' | 'info'
}

export default function ConfirmModal({
    isOpen,
    title,
    message,
    confirmText,
    cancelText,
    variant = 'danger',
    onConfirm,
    onCancel,
    tertiaryText,
    onTertiary,
    tertiaryVariant = 'warning'
}: ConfirmModalProps) {
    const { t } = useTranslation()
    const resolvedConfirmText = confirmText ?? t('common.confirm')
    const resolvedCancelText = cancelText ?? t('common.cancel')
    useEscapeKey(onCancel, isOpen)

    if (!isOpen) return null

    const variantStyles = {
        danger: {
            icon: <Icons.AlertTriangle className="w-6 h-6 text-red-500" />,
            confirmBtn: 'bg-red-500 hover:bg-red-600 text-white',
            iconBg: 'bg-red-500/10'
        },
        warning: {
            icon: <Icons.AlertTriangle className="w-6 h-6 text-amber-500" />,
            confirmBtn: 'bg-amber-500 hover:bg-amber-600 text-white',
            iconBg: 'bg-amber-500/10'
        },
        info: {
            icon: <Icons.Info className="w-6 h-6 text-blue-500" />,
            confirmBtn: 'bg-blue-500 hover:bg-blue-600 text-white',
            iconBg: 'bg-blue-500/10'
        }
    }

    const styles = variantStyles[variant]

    return createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150" onClick={onCancel}>
            <div
                className="bg-[var(--color-card)] w-full max-w-md rounded-xl shadow-2xl border border-[var(--color-border)] animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Content */}
                <div className="p-6">
                    <div className="flex items-start gap-4">
                        {/* Icon */}
                        <div className={`p-3 rounded-full ${styles.iconBg} flex-shrink-0`}>
                            {styles.icon}
                        </div>

                        {/* Text */}
                        <div className="flex-1 pt-1">
                            <h3 className="text-lg font-semibold text-[var(--color-text)]">
                                {title}
                            </h3>
                            <p className="mt-2 text-sm text-[var(--color-text-muted)] leading-relaxed">
                                {message}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-bg)]/50 rounded-b-xl">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-medium rounded-lg bg-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-border)]/80 transition-colors mr-auto"
                    >
                        {resolvedCancelText}
                    </button>
                    {onTertiary && (
                        <button
                            onClick={onTertiary}
                            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${tertiaryVariant ? variantStyles[tertiaryVariant].confirmBtn : 'bg-[var(--color-border)] text-[var(--color-text)]'}`}
                        >
                            {tertiaryText}
                        </button>
                    )}
                    <button
                        onClick={onConfirm}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${styles.confirmBtn}`}
                    >
                        {resolvedConfirmText}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )
}

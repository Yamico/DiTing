import { useEffect, useState } from 'react'
import { diffLines, Change } from 'diff'
import Icons from './ui/Icons'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useTranslation } from 'react-i18next'

interface DiffModalProps {
    oldText: string
    newText: string
    onClose: () => void
}

export default function DiffModal({ oldText, newText, onClose }: DiffModalProps) {
    const { t } = useTranslation()
    useEscapeKey(onClose)
    const [changes, setChanges] = useState<Change[]>([])

    useEffect(() => {
        setChanges(diffLines(oldText, newText))
    }, [oldText, newText])

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
            {/* Modal Content */}
            <div className="bg-[var(--color-card)] w-full max-w-4xl max-h-[85vh] rounded-xl shadow-2xl flex flex-col border border-[var(--color-border)] animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                        <Icons.ArrowsHorizontal className="w-5 h-5" />
                        {t('diffModal.title')}
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-[var(--color-bg-hover)] rounded-full transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                        <Icons.X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-4 font-mono text-sm leading-relaxed bg-[var(--md-code-bg)]">
                    {changes.map((part, index) => {
                        const style = part.added ? 'bg-green-500/20 text-green-700 dark:text-green-400 border-l-2 border-green-500 pl-1' :
                            part.removed ? 'bg-red-500/20 text-red-700 dark:text-red-400 border-l-2 border-red-500 pl-1 decoration-dotted line-through opacity-70' :
                                'text-[var(--color-text)] opacity-80 pl-1.5';

                        return (
                            <span key={index} className={`whitespace-pre-wrap block ${style}`}>
                                {part.value}
                            </span>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

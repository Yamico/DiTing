import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEscapeKey } from '../hooks/useEscapeKey'
import Icons from './ui/Icons'
import LLMTab from './settings/LLMTab'
import ASRTab from './settings/ASRTab'
import PromptTab from './settings/PromptTab'
import SystemTab from './settings/SystemTab'
import AboutTab from './settings/AboutTab'

interface SettingsModalProps {
    onClose: () => void
}

type Tab = 'llm' | 'asr' | 'prompt' | 'system' | 'about'

export default function SettingsModal({ onClose }: SettingsModalProps) {
    const { t } = useTranslation()
    useEscapeKey(onClose)
    const [activeTab, setActiveTab] = useState<Tab>('asr')

    const tabs = [
        { key: 'asr', label: t('settings.tabs.asr'), icon: Icons.Music },
        { key: 'llm', label: t('settings.tabs.llm'), icon: Icons.Cpu },
        { key: 'prompt', label: t('settings.tabs.prompt'), icon: Icons.FileText },
        { key: 'system', label: t('settings.tabs.system'), icon: Icons.Settings },
        { key: 'about', label: t('settings.tabs.about'), icon: Icons.Info },
    ]

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="bg-[var(--color-card)] rounded-2xl w-full max-w-4xl mx-4 h-[740px] max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
                    <h2 className="text-lg font-medium flex items-center gap-2">
                        <Icons.Settings className="w-5 h-5" />
                        {t('settings.title')}
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-hover)] transition-colors"
                    >
                        <Icons.X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-[var(--color-border)] px-4 shrink-0 overflow-x-auto">
                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key as Tab)}
                            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.key
                                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                                : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                                }`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {activeTab === 'asr' && <ASRTab />}
                    {activeTab === 'llm' && <LLMTab />}
                    {activeTab === 'prompt' && <PromptTab />}
                    {activeTab === 'system' && <SystemTab onClose={onClose} />}
                    {activeTab === 'about' && <AboutTab />}
                </div>
            </div>
        </div>
    )
}

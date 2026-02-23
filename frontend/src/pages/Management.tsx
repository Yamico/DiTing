import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Icons from '../components/ui/Icons'
import OverviewTab from './management/OverviewTab'
import CacheEntriesTab from './management/CacheEntriesTab'
import BatchCacheTab from './management/BatchCacheTab'
import CleanupTab from './management/CleanupTab'

type Tab = 'overview' | 'entries' | 'cleanup' | 'batch'

export default function Management() {
    const { t } = useTranslation()
    const [activeTab, setActiveTab] = useState<Tab>('overview')

    const tabs = [
        { id: 'overview', label: t('management.tabs.overview'), icon: Icons.LayoutDashboard },
        { id: 'entries', label: t('management.tabs.entries'), icon: Icons.FileVideo },
        { id: 'batch', label: t('management.tabs.batch'), icon: Icons.Database },
        { id: 'cleanup', label: t('management.tabs.cleanup'), icon: Icons.Trash },
    ]

    return (
        <div className="pb-20">
            {/* Page Header */}
            <div className="bg-[var(--color-card)] border-b border-[var(--color-border)] px-8 py-6">
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-center gap-3">
                        <Icons.Database className="w-8 h-8 text-indigo-500" />
                        <div>
                            <h1 className="text-2xl font-bold">
                                {t('management.title')}
                            </h1>
                            <p className="text-[var(--color-text-muted)] text-sm">
                                {t('management.subtitle')}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-7xl mx-auto px-8 py-8">
                {/* Tabs */}
                <div className="flex gap-4 mb-8 border-b border-[var(--color-border)]">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as Tab)}
                            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors font-medium ${activeTab === tab.id
                                ? 'border-indigo-500 text-indigo-500'
                                : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                                }`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="space-y-6">
                    {activeTab === 'overview' && <OverviewTab />}
                    {activeTab === 'entries' && <CacheEntriesTab />}
                    {activeTab === 'batch' && <BatchCacheTab />}
                    {activeTab === 'cleanup' && <CleanupTab />}
                </div>
            </div>
        </div >
    )
}

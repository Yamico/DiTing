import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { getSystemConfig, setSystemConfig } from '../../api'
import { useToast } from '../../contexts/ToastContext'
import Icons from '../ui/Icons'

export default function SystemTab({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation()
    const { showToast } = useToast()
    const navigate = useNavigate()

    const [proxyUrl, setProxyUrl] = useState('')
    const [biliSessdata, setBiliSessdata] = useState('')
    const [showUvr5, setShowUvr5] = useState(() => localStorage.getItem('diting_show_uvr5') === 'true')

    // Fetch initial data
    useEffect(() => {
        getSystemConfig('proxy_url').then(val => setProxyUrl(val || ''))
        getSystemConfig('bilibili_sessdata').then(val => setBiliSessdata(val || ''))
    }, [])

    const saveProxyMutation = useMutation({
        mutationFn: (url: string) => setSystemConfig('proxy_url', url),
        onSuccess: () => showToast('success', t('settings.system.proxySaved')),
        onError: () => showToast('error', t('settings.system.proxySaveFailed')),
    })

    const saveBiliCookieMutation = useMutation({
        mutationFn: (val: string) => setSystemConfig('bilibili_sessdata', val),
        onSuccess: () => showToast('success', t('settings.system.biliCookieSaved')),
        onError: () => showToast('error', t('settings.system.biliCookieSaveFailed')),
    })

    return (
        <div className="space-y-8">
            {/* Proxy Settings */}
            <div className="space-y-4">
                <h3 className="font-medium flex items-center gap-2">
                    <Icons.Globe className="w-5 h-5" />
                    {t('settings.system.proxyTitle')}
                </h3>
                <div className="flex gap-2">
                    <input
                        type="text"
                        placeholder={t('settings.system.proxyPlaceholder')}
                        value={proxyUrl}
                        onChange={(e) => setProxyUrl(e.target.value)}
                        className="flex-1 px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-sm"
                    />
                    <button
                        onClick={() => saveProxyMutation.mutate(proxyUrl)}
                        className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-lg hover:opacity-90"
                    >
                        {t('settings.system.saveProxy')}
                    </button>
                </div>
                <p className="text-xs text-[var(--color-text-muted)]">
                    {t('settings.system.proxyHint')}
                </p>
            </div>

            <hr className="border-[var(--color-border)]" />

            {/* Bilibili Cookie */}
            <div className="space-y-4">
                <h3 className="font-medium flex items-center gap-2">
                    <Icons.Lock className="w-5 h-5" />
                    {t('settings.system.biliCookieTitle')}
                </h3>
                <div className="flex gap-2">
                    <input
                        type="password"
                        placeholder={t('settings.system.biliCookiePlaceholder')}
                        value={biliSessdata}
                        onChange={(e) => setBiliSessdata(e.target.value)}
                        className="flex-1 px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-sm font-mono"
                    />
                    <button
                        onClick={() => saveBiliCookieMutation.mutate(biliSessdata)}
                        className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-lg hover:opacity-90"
                    >
                        {t('common.save')}
                    </button>
                </div>
                <p className="text-xs text-[var(--color-text-muted)]">
                    {t('settings.system.biliCookieHint')}
                </p>
            </div>

            <hr className="border-[var(--color-border)]" />

            {/* Feature Toggles */}
            <div className="space-y-4">
                <h3 className="font-medium flex items-center gap-2">
                    <Icons.Settings className="w-5 h-5" />
                    {t('settings.system.featureToggleTitle')}
                </h3>

                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <label htmlFor="uvr5-toggle" className="text-sm font-medium cursor-pointer block">
                            {t('settings.system.showUvr5')}
                        </label>
                        <p className="text-xs text-[var(--color-text-muted)] max-w-xl">
                            {t('settings.system.showUvr5Hint')}
                        </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            id="uvr5-toggle"
                            className="sr-only peer"
                            checked={showUvr5}
                            onChange={(e) => {
                                const newValue = e.target.checked
                                localStorage.setItem('diting_show_uvr5', newValue ? 'true' : 'false')
                                setShowUvr5(newValue)
                            }}
                        />
                        <div className="w-11 h-6 bg-zinc-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[var(--color-primary)]"></div>
                    </label>
                </div>
            </div>

            <hr className="border-[var(--color-border)]" />

            {/* Media Retention -> Management Center */}
            <div className="space-y-4">
                <h3 className="font-medium flex items-center gap-2">
                    <Icons.Database className="w-5 h-5" />
                    {t('settings.system.storageTitle')}
                </h3>
                <div className="bg-[var(--color-bg)] p-4 rounded-lg border border-[var(--color-border)] flex items-center justify-between">
                    <div>
                        <div className="font-medium">{t('settings.system.cacheCenter')}</div>
                        <div className="text-sm text-[var(--color-text-muted)] mt-1">
                            {t('settings.system.cacheCenterDesc')}
                        </div>
                    </div>
                    <button
                        onClick={() => {
                            navigate('/management')
                            onClose()
                        }}
                        className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-lg hover:opacity-90"
                    >
                        {t('settings.system.goToCacheCenter')}
                    </button>
                </div>
            </div>
        </div>
    )
}

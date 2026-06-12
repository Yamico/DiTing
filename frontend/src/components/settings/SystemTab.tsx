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
    const [ytCookies, setYtCookies] = useState('')
    const [maxResolution, setMaxResolution] = useState('1080')
    const [showBiliCookie, setShowBiliCookie] = useState(false)
    const [showYtCookie, setShowYtCookie] = useState(false)

    // Fetch initial data
    useEffect(() => {
        getSystemConfig('proxy_url').then(val => setProxyUrl(val || ''))
        getSystemConfig('bilibili_sessdata').then(val => setBiliSessdata(val || ''))
        getSystemConfig('youtube_cookies').then(val => setYtCookies(val || ''))
        getSystemConfig('max_resolution').then(val => setMaxResolution(val || '1080'))
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

    const saveYtCookieMutation = useMutation({
        mutationFn: (val: string) => setSystemConfig('youtube_cookies', val),
        onSuccess: () => showToast('success', t('settings.system.ytCookieSaved')),
        onError: () => showToast('error', t('settings.system.ytCookieSaveFailed')),
    })

    const saveMaxResMutation = useMutation({
        mutationFn: (val: string) => setSystemConfig('max_resolution', val),
        onSuccess: () => showToast('success', t('settings.system.maxResSaved')),
        onError: () => showToast('error', t('settings.system.maxResSaveFailed')),
    })

    const handleMaxResChange = (val: string) => {
        setMaxResolution(val)
        saveMaxResMutation.mutate(val)
    }

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
                    <div className="relative flex-1">
                        <input
                            type={showBiliCookie ? "text" : "password"}
                            placeholder={t('settings.system.biliCookiePlaceholder')}
                            value={biliSessdata}
                            onChange={(e) => setBiliSessdata(e.target.value)}
                            className="w-full px-3 py-2 pr-10 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-sm font-mono"
                        />
                        <button
                            type="button"
                            onClick={() => setShowBiliCookie(!showBiliCookie)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors rounded-md hover:bg-[var(--color-bg-muted)]"
                            title={showBiliCookie ? t('common.hide', '隐藏') : t('common.show', '显示')}
                        >
                            {showBiliCookie ? <Icons.EyeOff className="w-4 h-4" /> : <Icons.Eye className="w-4 h-4" />}
                        </button>
                    </div>
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

            {/* YouTube Cookie */}
            <div className="space-y-4">
                <h3 className="font-medium flex items-center gap-2">
                    <Icons.Lock className="w-5 h-5" />
                    {t('settings.system.ytCookieTitle')}
                </h3>
                <div className="space-y-2">
                    <div className="relative">
                        {showYtCookie ? (
                            <textarea
                                rows={4}
                                placeholder={t('settings.system.ytCookiePlaceholder')}
                                value={ytCookies}
                                onChange={(e) => setYtCookies(e.target.value)}
                                className="w-full px-3 py-2 pr-10 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-sm font-mono resize-y flex-1"
                            />
                        ) : (
                            <input
                                type="password"
                                placeholder={t('settings.system.ytCookiePlaceholder')}
                                value={ytCookies}
                                onChange={(e) => setYtCookies(e.target.value)}
                                className="w-full px-3 py-2 pr-10 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-sm font-mono flex-1"
                            />
                        )}
                        <button
                            type="button"
                            onClick={() => setShowYtCookie(!showYtCookie)}
                            className="absolute right-2 top-2 p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors rounded-md hover:bg-[var(--color-bg-muted)]"
                            title={showYtCookie ? t('common.hide', '隐藏') : t('common.show', '显示')}
                        >
                            {showYtCookie ? <Icons.EyeOff className="w-4 h-4" /> : <Icons.Eye className="w-4 h-4" />}
                        </button>
                    </div>
                    <div className="flex justify-end">
                        <button
                            onClick={() => saveYtCookieMutation.mutate(ytCookies)}
                            className="px-4 py-2 bg-[var(--color-primary)] text-white text-sm rounded-lg hover:opacity-90"
                        >
                            {t('common.save')}
                        </button>
                    </div>
                </div>
                <p className="text-xs text-[var(--color-text-muted)]">
                    {t('settings.system.ytCookieHint')}
                </p>
            </div>

            <hr className="border-[var(--color-border)]" />

            {/* Default max download resolution */}
            <div className="space-y-4">
                <h3 className="font-medium flex items-center gap-2">
                    <Icons.SlidersHorizontal className="w-5 h-5" />
                    {t('settings.system.maxResTitle')}
                </h3>
                <div className="relative max-w-xs">
                    <select
                        value={maxResolution}
                        onChange={(e) => handleMaxResChange(e.target.value)}
                        className="w-full pl-3 pr-8 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-sm appearance-none focus:ring-1 focus:ring-[var(--color-primary)]"
                    >
                        <option value="2160">{t('settings.system.maxRes.2160')}</option>
                        <option value="1440">{t('settings.system.maxRes.1440')}</option>
                        <option value="1080">{t('settings.system.maxRes.1080')}</option>
                        <option value="720">{t('settings.system.maxRes.720')}</option>
                        <option value="480">{t('settings.system.maxRes.480')}</option>
                        <option value="unlimited">{t('settings.system.maxRes.unlimited')}</option>
                    </select>
                    <Icons.ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] pointer-events-none" />
                </div>
                <p className="text-xs text-[var(--color-text-muted)]">
                    {t('settings.system.maxResHint')}
                </p>
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

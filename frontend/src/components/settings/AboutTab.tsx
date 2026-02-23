import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { getSystemVersion, checkSystemUpdate } from '../../api'
import { useToast } from '../../contexts/ToastContext'
import Icons from '../ui/Icons'
import iconPng from '../../assets/icon.png'

export default function AboutTab() {
    const { t } = useTranslation()
    const { showToast } = useToast()
    const [updateInfo, setUpdateInfo] = useState<{
        update_available: boolean
        current_version: string
        latest_version: string
        release_notes: string
        download_url: string
    } | null>(null)

    // Fetch Version
    const { data: versionData, isLoading } = useQuery({
        queryKey: ['system-version'],
        queryFn: getSystemVersion,
    })

    const checkUpdateMutation = useMutation({
        mutationFn: checkSystemUpdate,
        onSuccess: (data) => {
            setUpdateInfo(data)
            if (data.update_available) {
                showToast('success', t('settings.about.updateAvailable'))
            } else {
                showToast('success', t('settings.about.alreadyLatest'))
            }
        },
        onError: (e) => showToast('error', t('settings.about.checkUpdateFailed') + ': ' + e.message)
    })

    return (
        <div className="space-y-6">
            <h3 className="font-medium">{t('settings.about.title')}</h3>

            <div className="bg-[var(--color-bg)] p-6 rounded-lg border border-[var(--color-border)] flex flex-col items-center justify-center gap-4 text-center">
                <div className="w-16 h-16 rounded-xl overflow-hidden shadow-lg">
                    <img src={iconPng} alt="DiTing" className="w-full h-full object-cover" />
                </div>

                <div>
                    <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-purple-600">
                        谛听 DiTing
                    </h2>
                    <div className="text-[var(--color-text-muted)] mt-1">
                        {t('settings.about.systemDesc')}
                    </div>
                    <div className="text-xs text-[var(--color-text-muted)] mt-1 opacity-60">
                        Made with ❤️ {t('settings.about.author')}
                    </div>
                </div>

                <div className="flex items-center gap-4 mt-2">
                    <div className="px-3 py-1 bg-[var(--color-card)] rounded-full border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] flex items-center gap-2">
                        <span>{t('settings.about.version')}</span>
                        <span className="font-mono font-medium text-[var(--color-text)]">
                            {isLoading ? '...' : versionData?.version || 'Unknown'}
                        </span>
                    </div>
                    {versionData?.build && (
                        <div className="px-3 py-1 bg-[var(--color-card)] rounded-full border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] flex items-center gap-2">
                            <span>{t('settings.about.build')}</span>
                            <span className="font-mono font-medium text-[var(--color-text)]">
                                {versionData.build}
                            </span>
                        </div>
                    )}
                </div>

                <div className="mt-4">
                    <button
                        onClick={() => checkUpdateMutation.mutate()}
                        disabled={checkUpdateMutation.isPending}
                        className="px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg hover:bg-[var(--color-primary-hover)] disabled:opacity-50 transition-all flex items-center gap-2"
                    >
                        {checkUpdateMutation.isPending ? (
                            <>
                                <Icons.Refresh className="w-4 h-4 animate-spin" />
                                {t('settings.about.checkingUpdate')}
                            </>
                        ) : (
                            <>
                                <Icons.Refresh className="w-4 h-4" />
                                {t('settings.about.checkUpdate')}
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Update Info Card */}
            {updateInfo && (
                <div className={`p-4 rounded-lg border ${updateInfo.update_available
                    ? 'bg-blue-500/10 border-blue-500/30'
                    : 'bg-green-500/10 border-green-500/30'
                    }`}>
                    <div className="flex items-start gap-3">
                        {updateInfo.update_available ? (
                            <Icons.AlertCircle className="w-5 h-5 text-blue-500 mt-0.5" />
                        ) : (
                            <Icons.CheckCircle className="w-5 h-5 text-green-500 mt-0.5" />
                        )}
                        <div>
                            <div className={`font-medium ${updateInfo.update_available ? 'text-blue-500' : 'text-green-500'
                                }`}>
                                {updateInfo.update_available ? t('settings.about.newVersionFound') : t('settings.about.currentIsLatest')}
                            </div>
                            <div className="text-sm mt-1 opacity-80">
                                {updateInfo.release_notes}
                            </div>
                            <div className="text-xs mt-2 opacity-60">
                                {t('settings.about.currentVersion')}: {updateInfo.current_version} | {t('settings.about.latestVersion')}: {updateInfo.latest_version}
                            </div>
                            {updateInfo.update_available && updateInfo.download_url && (
                                <a
                                    href={updateInfo.download_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 transition-colors"
                                >
                                    <Icons.ExternalLink className="w-3.5 h-3.5" />
                                    {t('settings.about.goToDownload')}
                                </a>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Links / Credits */}
            <div className="grid grid-cols-2 gap-4">
                <a
                    href="https://github.com/Yamico/DiTing"
                    target="_blank"
                    rel="noreferrer"
                    className="p-4 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-colors flex items-center gap-3 group"
                >
                    <div className="w-10 h-10 rounded-full bg-[var(--color-bg-hover)] flex items-center justify-center group-hover:bg-[var(--color-primary)]/10 group-hover:text-[var(--color-primary)] transition-colors">
                        <Icons.Github className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="font-medium group-hover:text-[var(--color-primary)] transition-colors">{t('settings.about.links.github')}</div>
                        <div className="text-xs text-[var(--color-text-muted)]">{t('settings.about.links.githubDesc')}</div>
                    </div>
                </a>

                <a
                    href="#"
                    onClick={(e) => e.preventDefault()}
                    className="p-4 bg-[var(--color-bg)] rounded-lg border border-[var(--color-border)] hover:border-[var(--color-primary)] transition-colors flex items-center gap-3 group"
                >
                    <div className="w-10 h-10 rounded-full bg-[var(--color-bg-hover)] flex items-center justify-center group-hover:bg-[var(--color-primary)]/10 group-hover:text-[var(--color-primary)] transition-colors">
                        <Icons.FileText className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="font-medium group-hover:text-[var(--color-primary)] transition-colors">{t('settings.about.links.docs')}</div>
                        <div className="text-xs text-[var(--color-text-muted)]">{t('settings.about.links.docsDesc')}</div>
                    </div>
                </a>
            </div>

            <div className="text-center text-xs text-[var(--color-text-muted)] pt-8">
                {t('settings.about.copyright', { year: new Date().getFullYear() })}
            </div>
        </div>
    )
}

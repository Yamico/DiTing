import React from 'react'
import { useTranslation } from 'react-i18next'
import Icons from './ui/Icons'
import { getVideoMediaUrl, type Video, type CacheEntry } from '../api'

export interface VideoPlayerProps {
    video: Video | null | undefined
    sourceId: string
    activeTab: 'local' | 'stream' | 'embed'
    setActiveTab: (tab: 'local' | 'stream' | 'embed') => void
    playerRef: React.RefObject<HTMLVideoElement | HTMLAudioElement>
    lastTimeRef: React.MutableRefObject<number>
    setCurrentTime: (time: number) => void
    mobileLayout: 'scroll' | 'split'
    selectedVersion: CacheEntry | null
    setSelectedVersion: (version: CacheEntry | null) => void
    setShowPolicyMenu: (show: boolean) => void
    showPolicyMenu: boolean
    setShowDeleteCacheConfirm: (show: boolean) => void
    showAppendCacheMenu: boolean
    setShowAppendCacheMenu: (show: boolean) => void
    updatePolicyMutation: any // from React Query
    handleAppendCache: (quality: string) => void
}

export default function VideoPlayer({
    video,
    sourceId,
    activeTab,
    setActiveTab,
    playerRef,
    lastTimeRef,
    setCurrentTime,
    mobileLayout,
    selectedVersion,
    setSelectedVersion,
    showPolicyMenu,
    setShowPolicyMenu,
    setShowDeleteCacheConfirm,
    showAppendCacheMenu,
    setShowAppendCacheMenu,
    updatePolicyMutation,
    handleAppendCache
}: VideoPlayerProps) {
    const { t } = useTranslation()

    if (!video) return null

    const localUrl = getVideoMediaUrl(sourceId, selectedVersion?.quality)
    // Determine file type for audio vs video player
    const isAudio = video.source_type === 'audio' ||
        (video.media_path?.endsWith('.mp3') || video.media_path?.endsWith('.m4a') || video.media_path?.endsWith('.wav'))

    let content = null

    // Throttled time update
    const handleTimeUpdate = () => {
        if (playerRef.current) {
            const now = playerRef.current.currentTime
            if (Math.abs(now - lastTimeRef.current) > 0.5) { // Update every 0.5s
                lastTimeRef.current = now
                setCurrentTime(now)
            }
        }
    }

    if (activeTab === 'local') {
        if (video.media_available) {
            content = isAudio ? (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900 absolute inset-0">
                    <Icons.Music className="w-16 h-16 text-gray-600 mb-4" />
                    <audio
                        ref={playerRef as React.RefObject<HTMLAudioElement>}
                        controls
                        className="w-full max-w-md"
                        src={localUrl}
                        onTimeUpdate={handleTimeUpdate}
                    />
                </div>
            ) : (
                <video
                    ref={playerRef as React.RefObject<HTMLVideoElement>}
                    controls
                    className="w-full h-full absolute inset-0"
                    src={localUrl}
                    onTimeUpdate={handleTimeUpdate}
                />
            )
        } else {
            content = (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--color-text-muted)] gap-2">
                    <Icons.Folder className="w-12 h-12 opacity-50" />
                    <span>{t('detail.player.noLocal')}</span>
                </div>
            )
        }
    } else if (activeTab === 'stream') {
        if (video.stream_url) {
            if (video.source_type === 'douyin') {
                content = (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--color-text-muted)] gap-4 bg-black/90">
                        <Icons.Globe className="w-12 h-12 opacity-50" />
                        <div className="text-center space-y-2">
                            <p className="text-sm">{t('detail.player.douyinLink')}</p>
                            <a
                                href={video.stream_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-primary)] text-white rounded-lg hover:opacity-90 transition-opacity text-sm"
                            >
                                <Icons.ExternalLink className="w-4 h-4" />
                                {t('detail.player.openNewWindow')}
                            </a>
                        </div>
                    </div>
                )
            } else {
                content = (
                    <video
                        ref={playerRef as React.RefObject<HTMLVideoElement>}
                        controls
                        className="w-full h-full absolute inset-0"
                        src={video.stream_url}
                        onTimeUpdate={handleTimeUpdate}
                        onError={(e) => {
                            e.preventDefault();
                        }}
                    />
                )
            }
        } else {
            content = (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--color-text-muted)] gap-2">
                    <Icons.Globe className="w-12 h-12 opacity-50" />
                    <span>{t('detail.player.noStream')}</span>
                </div>
            )
        }
    } else if (activeTab === 'embed') {
        if (video.source_type === 'youtube') {
            content = (
                <iframe
                    src={`https://www.youtube.com/embed/${video.source_id}`}
                    className="w-full h-full absolute inset-0"
                    allowFullScreen
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                />
            )
        } else if (video.embed_url) {
            const isDouyinEmbed = video.source_type === 'douyin'
            content = (
                <iframe
                    src={video.embed_url}
                    className={isDouyinEmbed
                        ? "w-full h-full absolute inset-0 bg-black"
                        : "w-full h-full absolute inset-0"
                    }
                    allowFullScreen
                    allow="autoplay; encrypted-media"
                    referrerPolicy="unsafe-url"
                />
            )
        } else {
            content = (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--color-text-muted)] gap-2">
                    <Icons.Layout className="w-12 h-12 opacity-50" />
                    <span>{t('detail.player.noEmbed')}</span>
                </div>
            )
        }
    }

    const isDouyinEmbedActive = activeTab === 'embed' && video.source_type === 'douyin' && video.embed_url

    return (
        <div className={`space-y-3 ${mobileLayout === 'split' ? 'mb-2 lg:mb-6' : 'mb-6'}`}>
            {/* 1. Tab Switcher */}
            <div className="flex flex-wrap bg-[var(--color-card-muted)] p-1 rounded-lg w-fit gap-1">
                <button
                    onClick={() => setActiveTab('local')}
                    disabled={!video.media_available}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md flex items-center gap-2 transition-all ${activeTab === 'local'
                        ? 'bg-[var(--color-card)] shadow-sm text-[var(--color-text)]'
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-50 disabled:cursor-not-allowed'
                        }`}
                    title={!video.media_available ? t('detail.player.fileNotFound') : ""}
                >
                    <Icons.Folder className="w-4 h-4" />
                    <span>{t('detail.player.local')}</span>
                </button>

                <button
                    onClick={() => setActiveTab('stream')}
                    disabled={!video.stream_url}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md flex items-center gap-2 transition-all ${activeTab === 'stream'
                        ? 'bg-[var(--color-card)] shadow-sm text-[var(--color-text)]'
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-50 disabled:cursor-not-allowed'
                        }`}
                >
                    <Icons.Globe className="w-4 h-4" />
                    <span>{t('detail.player.stream')}</span>
                    {video.stream_expired && <span className="text-[10px] bg-red-500/10 text-red-500 px-1 rounded">{t('detail.player.expired')}</span>}
                </button>

                <button
                    onClick={() => setActiveTab('embed')}
                    disabled={!video.embed_url && video.source_type !== 'youtube'}
                    className={`px-3 py-1.5 text-sm font-medium rounded-md flex items-center gap-2 transition-all ${activeTab === 'embed'
                        ? 'bg-[var(--color-card)] shadow-sm text-[var(--color-text)]'
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-50 disabled:cursor-not-allowed'
                        }`}
                >
                    <Icons.Layout className="w-4 h-4" />
                    <span>{t('detail.player.embed')}</span>
                </button>
            </div>

            {/* 2. Player Container */}
            <div className={`rounded-xl overflow-hidden bg-black relative group border border-[var(--color-border)] shadow-lg transition-all duration-300 ${isDouyinEmbedActive
                ? 'aspect-[9/16] max-h-[100vh] mx-auto max-w-[350px]'
                : 'aspect-video'
                }`}>
                {content}
            </div>

            {/* 3. Cache Info Bar */}
            {(video.media_available || ['bilibili', 'youtube', 'douyin'].includes(video.source_type)) && (
                <div className={`bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg px-4 py-2.5 text-sm space-y-2 ${mobileLayout === 'split' ? 'hidden lg:block' : ''}`}>
                    {/* Row 1: Cache Policy + Modify */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
                                <Icons.Save className="w-4 h-4" />
                                {t('detail.policy.label')}
                            </span>
                            <span className={`font-medium ${!video.media_available ? 'text-[var(--color-text-muted)]' : video.cache_policy === 'keep_forever' ? 'text-green-500' : 'text-[var(--color-text)]'}`}>
                                {(() => {
                                    if (!video.media_available) return t('detail.policy.notCached');
                                    if (video.cache_policy === 'keep_forever') return t('detail.policy.keepForever');
                                    if (video.cache_policy === 'custom') return t('detail.policy.custom', { date: new Date(video.cache_expires_at!).toLocaleString() });
                                    if (video.effective_expires_at) {
                                        if (video.effective_expires_at.startsWith('9999')) return t('detail.policy.global') + ' (' + t('detail.policy.keepForever') + ')';
                                        const isExpired = new Date(video.effective_expires_at) < new Date();
                                        return (
                                            <span className={isExpired ? 'text-red-500' : ''}>
                                                {isExpired
                                                    ? t('detail.policy.globalExpired')
                                                    : t('detail.policy.globalValid', { date: new Date(video.effective_expires_at).toLocaleString() })
                                                }
                                            </span>
                                        );
                                    }
                                    return t('detail.policy.global');
                                })()}
                            </span>
                        </div>
                        <div className="relative">
                            {video.media_available && (
                                <>
                                    <button
                                        onClick={() => setShowPolicyMenu(!showPolicyMenu)}
                                        className="text-[var(--color-primary)] hover:underline text-xs"
                                    >
                                        {t('detail.policy.modify')}
                                    </button>

                                    {/* Dropdown Menu */}
                                    {showPolicyMenu && (
                                        <div className="absolute right-0 bottom-full mb-2 w-48 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg shadow-xl overflow-hidden z-20">
                                            <button
                                                className="w-full text-left px-4 py-2 hover:bg-[var(--color-bg)] transition-colors text-sm flex items-center gap-2"
                                                onClick={() => updatePolicyMutation.mutate({ policy: 'keep_forever', expires: null })}
                                            >
                                                <Icons.Lock className="w-4 h-4 text-green-500" /> {t('detail.policy.setForever')}
                                            </button>
                                            <button
                                                className="w-full text-left px-4 py-2 hover:bg-[var(--color-bg)] transition-colors text-sm flex items-center gap-2"
                                                onClick={() => updatePolicyMutation.mutate({ policy: null, expires: null })}
                                            >
                                                <Icons.RotateCw className="w-4 h-4 text-[var(--color-text-muted)]" /> {t('detail.policy.setGlobal')}
                                            </button>
                                            {video.media_available && (
                                                <div className="border-t border-[var(--color-border)] p-1 mt-1">
                                                    <button
                                                        className="w-full text-left px-3 py-2 hover:bg-red-500/10 text-red-500 rounded flex items-center gap-2 text-xs transition-colors"
                                                        onClick={() => {
                                                            setShowPolicyMenu(false)
                                                            setShowDeleteCacheConfirm(true)
                                                        }}
                                                    >
                                                        <Icons.Trash className="w-3 h-3" /> {t('detail.policy.deleteCache')}
                                                    </button>
                                                </div>
                                            )}
                                            <div className="border-t border-[var(--color-border)] p-2">
                                                <p className="text-xs text-[var(--color-text-muted)] mb-1 pl-2">{t('detail.policy.customExpiry')}</p>
                                                <div className="px-2 pb-1">
                                                    <input
                                                        type="datetime-local"
                                                        className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-2 py-1 text-xs mb-2"
                                                        id="custom-expiry-input"
                                                        defaultValue={(() => {
                                                            const date = video.cache_expires_at ? new Date(video.cache_expires_at) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                                                            return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
                                                        })()}
                                                    />
                                                    <button
                                                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded px-2 py-1 text-xs"
                                                        onClick={() => {
                                                            const input = document.getElementById('custom-expiry-input') as HTMLInputElement;
                                                            if (input && input.value) {
                                                                const date = new Date(input.value);
                                                                updatePolicyMutation.mutate({
                                                                    policy: 'custom',
                                                                    expires: date.toISOString()
                                                                });
                                                            }
                                                        }}
                                                    >
                                                        {t('detail.policy.confirmModify')}
                                                    </button>
                                                </div>
                                                <div className="flex gap-1 px-2 mt-1">
                                                    <button
                                                        className="flex-1 bg-[var(--color-bg)] hover:bg-[var(--color-border)] rounded px-1 py-1 text-[10px] text-center"
                                                        onClick={() => {
                                                            const baseDate = video.cache_expires_at ? new Date(video.cache_expires_at) : new Date();
                                                            const newDate = new Date(baseDate.getTime() + 7 * 24 * 60 * 60 * 1000);
                                                            updatePolicyMutation.mutate({
                                                                policy: 'custom',
                                                                expires: newDate.toISOString()
                                                            })
                                                        }}
                                                    >
                                                        +7天
                                                    </button>
                                                    <button
                                                        className="flex-1 bg-[var(--color-bg)] hover:bg-[var(--color-border)] rounded px-1 py-1 text-[10px] text-center"
                                                        onClick={() => {
                                                            const baseDate = video.cache_expires_at ? new Date(video.cache_expires_at) : new Date();
                                                            const newDate = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000);
                                                            updatePolicyMutation.mutate({
                                                                policy: 'custom',
                                                                expires: newDate.toISOString()
                                                            })
                                                        }}
                                                    >
                                                        +30天
                                                    </button>
                                                </div>
                                            </div>
                                            <div
                                                className="fixed inset-0 z-[-1]"
                                                onClick={() => setShowPolicyMenu(false)}
                                            />
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Row 2: Version Selector + Append Cache */}
                    {((video.cache_versions?.length ?? 0) > 0 || ['bilibili', 'youtube', 'douyin'].includes(video.source_type)) && (
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)]/50 pt-2">
                            {video.cache_versions && video.cache_versions.length > 0 ? (
                                <div className="flex items-center gap-2 text-xs">
                                    <span className="text-[var(--color-text-muted)]">{t('detail.version.label')}</span>
                                    <select
                                        value={selectedVersion?.quality || ''}
                                        onChange={(e) => {
                                            const v = video.cache_versions!.find(x => x.quality === e.target.value)
                                            if (v) setSelectedVersion(v)
                                        }}
                                        className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-1.5 py-0.5 outline-none"
                                    >
                                        {video.cache_versions.map(v => (
                                            <option key={v.quality} value={v.quality}>
                                                {(() => {
                                                    const q = v.quality;
                                                    if (q === 'best') return t('detail.version.best');
                                                    if (q === 'medium') return t('detail.version.medium');
                                                    if (q === 'worst') return t('detail.version.worst');
                                                    if (q === 'audio' || q === 'audio_only') return t('detail.version.audio');
                                                    return q;
                                                })()} ({v.file_size ? (v.file_size / 1024 / 1024).toFixed(1) + 'MB' : '?'})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            ) : <div />}

                            {['bilibili', 'youtube'].includes(video.source_type) && (
                                <div className="relative">
                                    <button
                                        onClick={() => setShowAppendCacheMenu(!showAppendCacheMenu)}
                                        className="flex items-center gap-1 text-[var(--color-primary)] hover:underline text-xs"
                                    >
                                        <Icons.Download className="w-3 h-3" />
                                        {t('detail.version.append')}
                                    </button>
                                    {showAppendCacheMenu && (
                                        <div className="absolute right-0 bottom-full mb-2 w-36 bg-[var(--color-card)] border border-[var(--color-border)] rounded shadow-lg z-20 py-1">
                                            <button
                                                className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-bg)] text-xs"
                                                onClick={() => handleAppendCache('best')}
                                            >
                                                {t('detail.version.appendMenu.best')}
                                            </button>
                                            <button
                                                className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-bg)] text-xs"
                                                onClick={() => handleAppendCache('medium')}
                                            >
                                                {t('detail.version.appendMenu.medium')}
                                            </button>
                                            <button
                                                className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-bg)] text-xs"
                                                onClick={() => handleAppendCache('worst')}
                                            >
                                                {t('detail.version.appendMenu.worst')}
                                            </button>
                                            <button
                                                className="w-full text-left px-3 py-1.5 hover:bg-[var(--color-bg)] text-xs"
                                                onClick={() => handleAppendCache('audio_only')}
                                            >
                                                {t('detail.version.appendMenu.audio')}
                                            </button>
                                            <div
                                                className="fixed inset-0 z-[-1]"
                                                onClick={() => setShowAppendCacheMenu(false)}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

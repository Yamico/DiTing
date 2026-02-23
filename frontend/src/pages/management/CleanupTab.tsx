import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Icons from '../../components/ui/Icons'
import {
    getMediaGCCandidates,
    getCoverGCCandidates,
    getCacheIntegrity,
    triggerMediaGC,
    cleanCache,
    getMediaRetentionPolicy,
    updateMediaRetentionPolicy,
    cleanupCacheIntegrity,
    getMediaStats
} from '../../api/client'
import { useToast } from '../../contexts/ToastContext'
import { formatBytes } from './utils'
import ConfirmModal from '../../components/ConfirmModal'

export default function CleanupTab() {
    const queryClient = useQueryClient()
    const { t } = useTranslation()
    const { showToast } = useToast()
    const [selectedFSOrphans, setSelectedFSOrphans] = useState<string[]>([])
    const [selectedDBOrphans, setSelectedDBOrphans] = useState<number[]>([])
    const [selectedCovers, setSelectedCovers] = useState<string[]>([])

    // Data fetching queries
    const { data: gcCandidatesData, isLoading: gcLoading } = useQuery({
        queryKey: ['gc-candidates'],
        queryFn: getMediaGCCandidates,
        refetchInterval: 30000
    })

    const { data: coversData, isLoading: coversLoading } = useQuery({
        queryKey: ['cover-candidates'],
        queryFn: getCoverGCCandidates,
        refetchInterval: 30000
    })

    const { data: integrityReport, isLoading: integrityLoading } = useQuery({
        queryKey: ['cache-integrity'],
        queryFn: getCacheIntegrity,
        refetchInterval: 30000
    })

    const { data: retentionPolicy, isLoading: policyLoading } = useQuery({
        queryKey: ['retention-policy'],
        queryFn: getMediaRetentionPolicy
    })

    const { data: statsData, isLoading: statsLoading } = useQuery({
        queryKey: ['media-stats'],
        queryFn: getMediaStats,
        refetchInterval: 30000
    })

    const loading = gcLoading || coversLoading || integrityLoading || policyLoading || statsLoading
    const gcCandidates = gcCandidatesData?.items || []
    const coverCandidates = coversData?.items || []
    const nextGcTime = statsData?.next_gc_time

    // Mutations
    const refreshAll = () => {
        queryClient.invalidateQueries({ queryKey: ['gc-candidates'] })
        queryClient.invalidateQueries({ queryKey: ['cover-candidates'] })
        queryClient.invalidateQueries({ queryKey: ['cache-integrity'] })
        queryClient.invalidateQueries({ queryKey: ['retention-policy'] })
        queryClient.invalidateQueries({ queryKey: ['media-stats'] })
    }

    const cleanFSOrphansMutation = useMutation({
        mutationFn: async (targets: string[] | undefined) => {
            return await cleanupCacheIntegrity('fs_orphans', targets)
        },
        onSuccess: () => {
            showToast('success', t('common.success'))
            setSelectedFSOrphans([])
            refreshAll()
        },
        onError: (error) => {
            console.error(error)
            showToast('error', t('common.error'))
        }
    })

    const cleanDBOrphansMutation = useMutation({
        mutationFn: async (targets: number[] | undefined) => {
            return await cleanupCacheIntegrity('db_orphans', targets)
        },
        onSuccess: () => {
            showToast('success', t('common.success'))
            setSelectedDBOrphans([])
            refreshAll()
        },
        onError: (error) => {
            console.error(error)
            showToast('error', t('common.error'))
        }
    })

    const triggerGCMutation = useMutation({
        mutationFn: triggerMediaGC,
        onSuccess: () => {
            showToast('success', t('common.success'))
            refreshAll()
        },
        onError: (error) => {
            console.error(error)
            showToast('error', t('common.error'))
        }
    })

    const cleanCoversMutation = useMutation({
        mutationFn: async (targets: string[] | undefined) => {
            return await cleanCache(targets)
        },
        onSuccess: () => {
            showToast('success', t('common.success'))
            setSelectedCovers([])
            refreshAll()
        },
        onError: (error) => {
            console.error(error)
            showToast('error', t('common.error'))
        }
    })

    const updatePolicyMutation = useMutation({
        mutationFn: async ({ policy, days, cron_interval, capacity_gb }: { policy: string, days: number, cron_interval?: number, capacity_gb?: number }) => {
            return await updateMediaRetentionPolicy(policy, days, cron_interval, capacity_gb)
        },
        onSuccess: () => {
            showToast('success', t('common.success'))
            queryClient.invalidateQueries({ queryKey: ['retention-policy'] })
        },
        onError: (error) => {
            console.error(error)
            showToast('error', t('common.error'))
        }
    })

    const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)

    const handleCleanFSOrphans = () => {
        if (!integrityReport) return
        const targets = selectedFSOrphans.length > 0 ? selectedFSOrphans : undefined
        setPendingAction(() => () => cleanFSOrphansMutation.mutate(targets))
    }

    const handleCacheGC = () => {
        triggerGCMutation.mutate(undefined)
    }

    const handleCleanDBOrphans = () => {
        if (!integrityReport) return
        const targets = selectedDBOrphans.length > 0 ? selectedDBOrphans : undefined
        setPendingAction(() => () => cleanDBOrphansMutation.mutate(targets))
    }

    // Helper functions need to be inside the component to access state and mutations
    const toggleSelectFS = (filename: string) => {
        setSelectedFSOrphans(prev => prev.includes(filename) ? prev.filter(f => f !== filename) : [...prev, filename])
    }

    const toggleSelectDB = (id: number) => {
        setSelectedDBOrphans(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
    }

    const toggleSelectAllCovers = () => {
        if (selectedCovers.length === coverCandidates.length) {
            setSelectedCovers([])
        } else {
            setSelectedCovers(coverCandidates.map(c => c.filename))
        }
    }

    const toggleSelectCover = (filename: string) => {
        setSelectedCovers(prev =>
            prev.includes(filename)
                ? prev.filter(f => f !== filename)
                : [...prev, filename]
        )
    }

    const handleGC = () => {
        setPendingAction(() => () => triggerGCMutation.mutate(undefined))
    }

    const handleCleanCovers = () => {
        const targets = selectedCovers.length > 0 ? selectedCovers : undefined
        setPendingAction(() => () => cleanCoversMutation.mutate(targets))
    }

    const handleConfirmAction = () => {
        if (pendingAction) {
            pendingAction()
            setPendingAction(null)
        }
    }

    const handleUpdatePolicy = (policy: string, days: number, cron_interval?: number, capacity_gb?: number) => {
        // Use current values if not provided
        const currentCron = cron_interval !== undefined ? cron_interval : retentionPolicy?.cron_interval
        const currentCapacity = capacity_gb !== undefined ? capacity_gb : retentionPolicy?.capacity_gb

        updatePolicyMutation.mutate({
            policy,
            days,
            cron_interval: currentCron,
            capacity_gb: currentCapacity
        })
    }

    if (loading && !integrityReport && !gcCandidates.length) {
        return (
            <div className="flex justify-center py-20">
                <Icons.Loader className="w-8 h-8 animate-spin text-indigo-500" />
            </div>
        )
    }

    return (
        <div className="space-y-8">
            {/* System Health Dashboard */}
            <div className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] shadow-sm overflow-hidden">
                <div className="p-6 border-b border-[var(--color-border)] flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <Icons.Activity className="w-5 h-5 text-indigo-500" />
                            {t('management.cleanup.systemHealth.title')}
                        </h3>
                        <p className="text-sm text-[var(--color-text-muted)] mt-1">
                            {t('management.cleanup.systemHealth.desc')}
                        </p>
                    </div>
                    <button
                        onClick={() => refreshAll()}
                        disabled={loading}
                        className="p-2 hover:bg-[var(--color-bg)] rounded-full transition-colors"
                        title={t('common.refresh')}
                    >
                        <Icons.Refresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Overall Status */}
                    <div className={`col-span-1 md:col-span-2 lg:col-span-3 p-4 rounded-lg flex items-center gap-4 border ${integrityReport && (integrityReport.fs_orphans.length > 0 || integrityReport.db_orphans.length > 0)
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-600'
                        : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600'
                        }`}>
                        <div className={`p-2 rounded-full ${integrityReport && (integrityReport.fs_orphans.length > 0 || integrityReport.db_orphans.length > 0)
                            ? 'bg-amber-500/20'
                            : 'bg-emerald-500/20'
                            }`}>
                            {integrityReport && (integrityReport.fs_orphans.length > 0 || integrityReport.db_orphans.length > 0) ? (
                                <Icons.AlertTriangle className="w-6 h-6" />
                            ) : (
                                <Icons.CheckCircle className="w-6 h-6" />
                            )}
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-semibold text-lg">
                                    {integrityReport && (integrityReport.fs_orphans.length > 0 || integrityReport.db_orphans.length > 0)
                                        ? t('management.cleanup.systemHealth.issues')
                                        : t('management.cleanup.systemHealth.healthy')}
                                </h4>
                            </div>
                            <p className="text-sm opacity-90 mb-2">
                                {integrityReport && (integrityReport.fs_orphans.length > 0 || integrityReport.db_orphans.length > 0)
                                    ? t('management.cleanup.systemHealth.issuesDesc')
                                    : t('management.cleanup.systemHealth.healthyDesc')}
                            </p>
                            {nextGcTime && (
                                <div className="text-xs flex items-center gap-2 opacity-80 bg-black/10 px-2 py-1 rounded w-fit">
                                    <Icons.Clock className="w-3 h-3" />
                                    <span>{t('management.cleanup.systemHealth.nextGc', { time: new Date(nextGcTime).toLocaleString() })}</span>
                                    <div className="h-3 w-[1px] bg-current opacity-30 mx-1"></div>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleCacheGC();
                                        }}
                                        className="hover:text-[var(--color-primary)] hover:underline font-medium"
                                        disabled={loading}
                                    >
                                        {t('management.cleanup.systemHealth.runNow')}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* DB Orphans Card */}
                    <div className="bg-[var(--color-bg)] p-4 rounded-lg border border-[var(--color-border)]">
                        <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                                <Icons.Database className="w-4 h-4 text-[var(--color-text-muted)]" />
                                <span className="font-medium text-sm">{t('management.cleanup.dbOrphans.title')}</span>
                            </div>
                            {integrityReport && integrityReport.db_orphans.length > 0 && (
                                <span className="px-2 py-0.5 bg-red-500/10 text-red-500 text-xs rounded-full font-medium">
                                    {t('management.cleanup.dbOrphans.errors', { count: integrityReport.db_orphans.length })}
                                </span>
                            )}
                        </div>
                        <div className="mt-2">
                            <p className="text-2xl font-bold">
                                {integrityReport?.db_orphans.length || 0}
                            </p>
                            <p className="text-xs text-[var(--color-text-muted)] mt-1">
                                {t('management.cleanup.dbOrphans.desc')}
                            </p>
                        </div>
                        {integrityReport && integrityReport.db_orphans.length > 0 && (
                            <button
                                onClick={handleCleanDBOrphans}
                                className="mt-4 w-full py-2 bg-white dark:bg-zinc-800 border border-[var(--color-border)] hover:bg-[var(--color-bg)] text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                <Icons.Wrench className="w-3 h-3" />
                                {t('management.cleanup.dbOrphans.autoRepair')}
                            </button>
                        )}
                    </div>

                    {/* FS Orphans Card */}
                    <div className="bg-[var(--color-bg)] p-4 rounded-lg border border-[var(--color-border)]">
                        <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                                <Icons.HardDrive className="w-4 h-4 text-[var(--color-text-muted)]" />
                                <span className="font-medium text-sm">{t('management.cleanup.fsOrphans.title')}</span>
                            </div>
                            {integrityReport && integrityReport.fs_orphans.length > 0 && (
                                <span className="px-2 py-0.5 bg-orange-500/10 text-orange-500 text-xs rounded-full font-medium">
                                    {t('management.cleanup.fsOrphans.files', { count: integrityReport.fs_orphans.length })}
                                </span>
                            )}
                        </div>
                        <div className="mt-2">
                            <p className="text-2xl font-bold">
                                {formatBytes(integrityReport?.fs_orphans.reduce((acc, curr) => acc + curr.size, 0) || 0)}
                            </p>
                            <p className="text-xs text-[var(--color-text-muted)] mt-1">
                                {t('management.cleanup.fsOrphans.desc')}
                            </p>
                        </div>
                        {integrityReport && integrityReport.fs_orphans.length > 0 && (
                            <button
                                onClick={() => document.getElementById('fs-orphans-section')?.scrollIntoView({ behavior: 'smooth' })}
                                className="mt-4 w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                <Icons.Eye className="w-3 h-3" />
                                {t('management.cleanup.fsOrphans.reviewBtn')}
                            </button>
                        )}
                    </div>

                    {/* Cover Orphans Card */}
                    <div className="bg-[var(--color-bg)] p-4 rounded-lg border border-[var(--color-border)]">
                        <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                                <Icons.Image className="w-4 h-4 text-[var(--color-text-muted)]" />
                                <span className="font-medium text-sm">{t('management.cleanup.coverOrphans.title')}</span>
                            </div>
                            {coverCandidates.length > 0 && (
                                <span className="px-2 py-0.5 bg-orange-500/10 text-orange-500 text-xs rounded-full font-medium">
                                    {t('management.cleanup.coverOrphans.files', { count: coverCandidates.length })}
                                </span>
                            )}
                        </div>
                        <div className="mt-2">
                            <p className="text-2xl font-bold">
                                {formatBytes(coverCandidates.reduce((acc, curr) => acc + curr.size, 0) || 0)}
                            </p>
                            <p className="text-xs text-[var(--color-text-muted)] mt-1">
                                {t('management.cleanup.coverOrphans.desc')}
                            </p>
                        </div>
                        {coverCandidates.length > 0 && (
                            <button
                                onClick={() => document.getElementById('cover-orphans-section')?.scrollIntoView({ behavior: 'smooth' })}
                                className="mt-4 w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
                            >
                                <Icons.Eye className="w-3 h-3" />
                                {t('management.cleanup.coverOrphans.reviewBtn')}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Missing DB Entries (DB Orphans) */}
            {integrityReport && integrityReport.db_orphans.length > 0 && (
                <div className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-[var(--color-border)] flex justify-between items-center bg-yellow-500/5">
                        <div className="flex items-center gap-4">
                            <div>
                                <h3 className="font-semibold text-yellow-600">{t('management.cleanup.dbOrphans.sectionTitle')}</h3>
                                <p className="text-xs text-[var(--color-text-muted)]">{t('management.cleanup.dbOrphans.sectionDesc')}</p>
                            </div>
                            <div className="flex items-center gap-2 ml-4">
                                <input
                                    type="checkbox"
                                    checked={selectedDBOrphans.length === integrityReport.db_orphans.length}
                                    onChange={() => setSelectedDBOrphans(selectedDBOrphans.length === integrityReport.db_orphans.length ? [] : integrityReport.db_orphans.map(i => i.id))}
                                    className="rounded border-[var(--color-border)] cursor-pointer w-4 h-4 text-yellow-600 focus:ring-yellow-600"
                                />
                                <span className="text-sm text-[var(--color-text-muted)] cursor-pointer" onClick={() => setSelectedDBOrphans(selectedDBOrphans.length === integrityReport.db_orphans.length ? [] : integrityReport.db_orphans.map(i => i.id))}>{t('common.all')}</span>
                            </div>
                        </div>
                        <button
                            onClick={handleCleanDBOrphans}
                            className="px-4 py-2 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700 font-medium"
                        >
                            {t('management.cleanup.dbOrphans.removeBtn', { count: selectedDBOrphans.length > 0 ? selectedDBOrphans.length : integrityReport.db_orphans.length })}
                        </button>
                    </div>
                    <div className="overflow-x-auto max-h-64">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-[var(--color-bg)] text-[var(--color-text-muted)] uppercase text-xs sticky top-0">
                                <tr>
                                    <th className="px-6 py-3 w-10"></th>
                                    <th className="px-6 py-3">Source ID</th>
                                    <th className="px-6 py-3">Quality</th>
                                    <th className="px-6 py-3">Missing Path</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--color-border)]">
                                {integrityReport.db_orphans.map((item) => (
                                    <tr key={item.id} className="hover:bg-[var(--color-bg)]/50">
                                        <td className="px-6 py-4">
                                            <input
                                                type="checkbox"
                                                checked={selectedDBOrphans.includes(item.id)}
                                                onChange={() => toggleSelectDB(item.id)}
                                                className="rounded border-[var(--color-border)] cursor-pointer text-yellow-600 focus:ring-yellow-600"
                                            />
                                        </td>
                                        <td className="px-6 py-4 font-mono text-xs">{item.source_id}</td>
                                        <td className="px-6 py-4">{item.quality}</td>
                                        <td className="px-6 py-4 text-[var(--color-text-muted)] break-all">{item.media_path}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Orphaned Cache Files (FS Orphans) */}
            {integrityReport && integrityReport.fs_orphans.length > 0 && (
                <div id="fs-orphans-section" className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-[var(--color-border)] flex justify-between items-center bg-red-500/5">
                        <div className="flex items-center gap-4">
                            <div>
                                <h3 className="font-semibold text-red-500">{t('management.cleanup.fsOrphans.sectionTitle')}</h3>
                                <p className="text-xs text-[var(--color-text-muted)]">{t('management.cleanup.fsOrphans.sectionDesc')}</p>
                            </div>
                            <div className="flex items-center gap-2 ml-4">
                                <input
                                    type="checkbox"
                                    checked={selectedFSOrphans.length === integrityReport.fs_orphans.length}
                                    onChange={() => setSelectedFSOrphans(selectedFSOrphans.length === integrityReport.fs_orphans.length ? [] : integrityReport.fs_orphans.map(i => i.filename))}
                                    className="rounded border-[var(--color-border)] cursor-pointer w-4 h-4 text-red-500 focus:ring-red-500"
                                />
                                <span className="text-sm text-[var(--color-text-muted)] cursor-pointer" onClick={() => setSelectedFSOrphans(selectedFSOrphans.length === integrityReport.fs_orphans.length ? [] : integrityReport.fs_orphans.map(i => i.filename))}>{t('common.all')}</span>
                            </div>
                        </div>
                        <button
                            onClick={handleCleanFSOrphans}
                            className="px-4 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700 font-medium"
                        >
                            {t('management.cleanup.fsOrphans.deleteBtn', { count: selectedFSOrphans.length > 0 ? selectedFSOrphans.length : integrityReport.fs_orphans.length })}
                        </button>
                    </div>
                    <div className="overflow-x-auto max-h-64">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-[var(--color-bg)] text-[var(--color-text-muted)] uppercase text-xs sticky top-0">
                                <tr>
                                    <th className="px-6 py-3 w-10"></th>
                                    <th className="px-6 py-3">Filename</th>
                                    <th className="px-6 py-3">Size</th>
                                    <th className="px-6 py-3">Path</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--color-border)]">
                                {integrityReport.fs_orphans.map((item) => (
                                    <tr key={item.filename} className="hover:bg-[var(--color-bg)]/50">
                                        <td className="px-6 py-4">
                                            <input
                                                type="checkbox"
                                                checked={selectedFSOrphans.includes(item.filename)}
                                                onChange={() => toggleSelectFS(item.filename)}
                                                className="rounded border-[var(--color-border)] cursor-pointer text-red-500 focus:ring-red-500"
                                            />
                                        </td>
                                        <td className="px-6 py-4 font-mono text-xs">{item.filename}</td>
                                        <td className="px-6 py-4">{formatBytes(item.size)}</td>
                                        <td className="px-6 py-4 text-[var(--color-text-muted)] break-all">{item.path}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Retention Policy */}
            <div className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] shadow-sm p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <Icons.Clock className="w-5 h-5 text-indigo-500" />
                    {t('management.cleanup.retention.title')}
                </h3>

                <div className="space-y-6">
                    {/* Policy Strategy */}
                    <div className="flex flex-col md:flex-row gap-4 items-end md:items-center">
                        <div className="flex-1 w-full">
                            <label className="block text-sm font-medium mb-1">{t('management.cleanup.retention.defaultPolicy')}</label>
                            <select
                                value={retentionPolicy?.policy || 'always_keep'}
                                onChange={(e) => handleUpdatePolicy(e.target.value, retentionPolicy?.days || 0)}
                                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-3 py-2 text-sm"
                            >
                                <option value="always_keep">{t('management.cleanup.retention.policy.always_keep')}</option>
                                <option value="delete_after_asr">{t('management.cleanup.retention.policy.delete_after_asr')}</option>
                                <option value="keep_days">{t('management.cleanup.retention.policy.keep_days')}</option>
                            </select>
                        </div>
                        {retentionPolicy?.policy === 'keep_days' && (
                            <div className="w-full md:w-32">
                                <label className="block text-sm font-medium mb-1">{t('management.cleanup.retention.days')}</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={retentionPolicy.days}
                                    onChange={(e) => handleUpdatePolicy('keep_days', parseInt(e.target.value) || 1)}
                                    className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-3 py-2 text-sm"
                                />
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-[var(--color-border)]">
                        {/* Cleanup Interval */}
                        <div>
                            <label className="block text-sm font-medium mb-1">{t('management.cleanup.retention.scheduleInterval')}</label>
                            <div className="flex items-center gap-2">
                                <select
                                    value={retentionPolicy?.cron_interval || 1}
                                    onChange={(e) => handleUpdatePolicy(retentionPolicy?.policy || 'always_keep', retentionPolicy?.days || 0, parseFloat(e.target.value))}
                                    className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-3 py-2 text-sm"
                                >
                                    <option value="1">{t('management.cleanup.retention.interval.hourly')}</option>
                                    <option value="6">{t('management.cleanup.retention.interval.every6h')}</option>
                                    <option value="12">{t('management.cleanup.retention.interval.every12h')}</option>
                                    <option value="24">{t('management.cleanup.retention.interval.daily')}</option>
                                </select>
                            </div>
                            <p className="text-xs text-[var(--color-text-muted)] mt-1">
                                {t('management.cleanup.retention.scheduleDesc')}
                            </p>
                        </div>

                        {/* Disk Capacity Limit */}
                        <div>
                            <label className="block text-sm font-medium mb-1">{t('management.cleanup.retention.diskLimit')}</label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="number"
                                    min="0"
                                    step="0.5"
                                    value={retentionPolicy?.capacity_gb || 0}
                                    onChange={(e) => handleUpdatePolicy(retentionPolicy?.policy || 'always_keep', retentionPolicy?.days || 0, undefined, parseFloat(e.target.value) || 0)}
                                    className="flex-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded px-3 py-2 text-sm"
                                />
                                <span className="text-sm font-medium">GB</span>
                            </div>
                            <p className="text-xs text-[var(--color-text-muted)] mt-1">
                                {t('management.cleanup.retention.diskLimitDesc')}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* GC Candidates */}
            {gcCandidates.length > 0 && (
                <div className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-[var(--color-border)] flex justify-between items-center bg-red-500/5">
                        <div>
                            <h3 className="font-semibold text-red-500">{t('management.cleanup.gc.title')}</h3>
                            <p className="text-xs text-[var(--color-text-muted)]">{t('management.cleanup.gc.desc')}</p>
                        </div>
                        <button
                            onClick={handleGC}
                            className="px-4 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                        >
                            {t('management.cleanup.gc.deleteBtn', { count: gcCandidates.length })}
                        </button>
                    </div>
                    <div className="overflow-x-auto max-h-96">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-[var(--color-bg)] text-[var(--color-text-muted)] uppercase text-xs sticky top-0">
                                <tr>
                                    <th className="px-6 py-3">{t('management.cleanup.gc.table.video')}</th>
                                    <th className="px-6 py-3">{t('management.cleanup.gc.table.reason')}</th>
                                    <th className="px-6 py-3">{t('management.cleanup.gc.table.size')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--color-border)]">
                                {gcCandidates.map((c, i) => (
                                    <tr key={i}>
                                        <td className="px-6 py-4 font-medium">{c.title}</td>
                                        <td className="px-6 py-4 text-[var(--color-text-muted)]">{c.reason}</td>
                                        <td className="px-6 py-4">{formatBytes(c.filesize)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Cover GC Candidates */}
            <div id="cover-orphans-section" className="bg-[var(--color-card)] rounded-xl border border-[var(--color-border)] shadow-sm overflow-hidden mt-8">
                <div className="p-4 border-b border-[var(--color-border)] flex justify-between items-center bg-orange-500/5">
                    <div className="flex items-center gap-4">
                        <div>
                            <h3 className="font-semibold text-orange-500">{t('management.cleanup.coverOrphans.sectionTitle')}</h3>
                            <p className="text-xs text-[var(--color-text-muted)]">{t('management.cleanup.coverOrphans.sectionDesc')}</p>
                        </div>
                        {coverCandidates.length > 0 && (
                            <div className="flex items-center gap-2 ml-4">
                                <input
                                    type="checkbox"
                                    checked={selectedCovers.length === coverCandidates.length && coverCandidates.length > 0}
                                    onChange={toggleSelectAllCovers}
                                    className="rounded border-[var(--color-border)] cursor-pointer w-4 h-4 text-orange-500 focus:ring-orange-500"
                                />
                                <span className="text-sm text-[var(--color-text-muted)] cursor-pointer" onClick={toggleSelectAllCovers}>{t('common.all')}</span>
                            </div>
                        )}
                    </div>
                    {coverCandidates.length > 0 && (
                        <button
                            onClick={handleCleanCovers}
                            className="px-4 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] text-sm rounded hover:bg-[var(--color-border)] flex items-center gap-2 hover:text-red-500 transition-colors"
                        >
                            <Icons.Trash className="w-4 h-4" />
                            {selectedCovers.length > 0 ? t('management.cleanup.coverOrphans.deleteSelected', { count: selectedCovers.length }) : t('management.cleanup.coverOrphans.deleteAll')}
                        </button>
                    )}
                </div>

                {coverCandidates.length > 0 ? (
                    <div className="p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4 max-h-[600px] overflow-y-auto custom-scrollbar">
                        {coverCandidates.map((c, i) => (
                            <div
                                key={i}
                                className={`
                                    relative group border rounded-lg overflow-hidden cursor-pointer transition-all hover:shadow-md
                                    ${selectedCovers.includes(c.filename) ? 'border-orange-500 ring-2 ring-orange-500/20' : 'border-[var(--color-border)] hover:border-orange-500/50'}
                                `}
                                onClick={() => toggleSelectCover(c.filename)}
                            >
                                <div className="aspect-video bg-zinc-900 relative">
                                    <img
                                        src={`/covers/${encodeURIComponent(c.filename)}`}
                                        alt={c.filename}
                                        className="w-full h-full object-cover transition-opacity duration-300"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).src = '/placeholder.png';
                                            (e.target as HTMLImageElement).style.opacity = '0.3';
                                        }}
                                    />
                                    {/* Checkbox Overlay */}
                                    <div className="absolute top-2 left-2 z-10 transition-opacity opacity-0 group-hover:opacity-100 data-[checked=true]:opacity-100" data-checked={selectedCovers.includes(c.filename)}>
                                        <div className={`w-5 h-5 rounded border flex items-center justify-center ${selectedCovers.includes(c.filename) ? 'bg-orange-500 border-orange-500 text-white' : 'bg-black/50 border-white/50 hover:bg-black/70'}`}>
                                            {selectedCovers.includes(c.filename) && <Icons.Check className="w-3 h-3" />}
                                        </div>
                                    </div>
                                    {/* Size Badge */}
                                    <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 text-white text-[10px] rounded backdrop-blur-sm">
                                        {formatBytes(c.size)}
                                    </div>
                                </div>
                                <div className="p-2 bg-[var(--color-bg)] border-t border-[var(--color-border)]">
                                    <p className="text-xs truncate text-[var(--color-text-muted)] group-hover:text-[var(--color-text-primary)] transition-colors" title={c.filename}>
                                        {c.filename}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="p-12 text-center text-[var(--color-text-muted)] flex flex-col items-center justify-center min-h-[200px]">
                        <div className="bg-green-500/10 p-4 rounded-full mb-4">
                            <Icons.CheckCircle className="w-8 h-8 text-green-500" />
                        </div>
                        <p className="font-medium text-[var(--color-text-primary)]">{t('management.cleanup.coverOrphans.clean')}</p>
                        <p className="text-sm mt-1">{t('management.cleanup.coverOrphans.cleanDesc')}</p>
                    </div>
                )}
            </div>

            <ConfirmModal
                isOpen={pendingAction !== null}
                title={t('common.confirm')}
                message={t('common.confirm')}
                variant="danger"
                onConfirm={handleConfirmAction}
                onCancel={() => setPendingAction(null)}
            />
        </div>
    )
}


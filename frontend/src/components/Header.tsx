import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import Icons from './ui/Icons'
import iconPng from '../assets/icon.png'
import { searchTranscriptions, SearchResult, getASRStatus } from '../api'
import TaskCenter from './TaskCenter'

interface HeaderProps {
    onAddVideo?: () => void
    onOpenSettings?: () => void
    onUploadFile?: () => void
}

export default function Header({ onAddVideo, onOpenSettings, onUploadFile }: HeaderProps) {
    const navigate = useNavigate()
    const location = useLocation()
    const [searchParams, setSearchParams] = useSearchParams()
    const { t, i18n } = useTranslation()
    const [theme, setTheme] = useState<'auto' | 'light' | 'dark'>(
        (localStorage.getItem('theme') as 'auto' | 'light' | 'dark') || 'auto'
    )
    const [scrolled, setScrolled] = useState(false)
    const [showTaskCenter, setShowTaskCenter] = useState(false)
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    // ASR engine status polling
    const { data: asrStatus } = useQuery({
        queryKey: ['asr_status_header'],
        queryFn: () => getASRStatus(false),
        refetchInterval: 30_000,
        staleTime: 25_000,
    })

    const asrAvailable = (() => {
        if (!asrStatus) return { online: -1, total: 0, tooltip: '' }  // loading

        const { engines, config } = asrStatus
        const disabledSet = new Set(config.disabled_engines || [])

        if (config.strict_mode) {
            // Strict mode: only the primary (active) engine matters
            const primary = config.active_engine || config.priority?.[0]
            if (!primary) return { online: 0, total: 0 }
            const eng = engines[primary]
            const isOnline = eng?.online && !disabledSet.has(primary)
            return { online: isOnline ? 1 : 0, total: 1, engineName: primary }
        }

        // Normal mode: count enabled + online engines
        const enabledEngines = Object.entries(engines).filter(([key]) => !disabledSet.has(key))
        const onlineCount = enabledEngines.filter(([, e]) => e.online).length
        return { online: onlineCount, total: enabledEngines.length }
    })()

    const asrColor = asrAvailable.online === -1
        ? 'bg-gray-400'
        : asrAvailable.online > 0
            ? 'bg-emerald-500'
            : 'bg-red-500'
    const asrTooltip = asrAvailable.online === -1
        ? t('dashboard.header.asrLoading')
        : asrAvailable.online > 0
            ? t('dashboard.header.asrOnline', { count: asrAvailable.online, total: asrAvailable.total })
            : t('dashboard.header.asrOffline')

    // Search state
    const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '')
    const [searchResults, setSearchResults] = useState<SearchResult[]>([])
    const [isSearching, setIsSearching] = useState(false)
    const [showDropdown, setShowDropdown] = useState(false)

    // Sync external URL param with internal state
    useEffect(() => {
        const q = searchParams.get('q') || ''
        setSearchQuery(q)
    }, [searchParams])
    const searchRef = useRef<HTMLDivElement>(null)
    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 10)
        window.addEventListener('scroll', handleScroll)
        return () => window.removeEventListener('scroll', handleScroll)
    }, [])

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
                setShowDropdown(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    // Close mobile menu on route change
    useEffect(() => {
        setMobileMenuOpen(false)
    }, [location.pathname])

    // Debounced search
    const performSearch = useCallback(async (query: string) => {
        if (!query.trim()) {
            setSearchResults([])
            setShowDropdown(false)
            return
        }

        setIsSearching(true)
        try {
            const response = await searchTranscriptions(query, 10)
            setSearchResults(response.results)
            setShowDropdown(response.results.length > 0)
        } catch (e) {
            console.error('Search failed:', e)
            setSearchResults([])
        } finally {
            setIsSearching(false)
        }
    }, [])

    const handleSearchInput = (value: string) => {
        setSearchQuery(value)

        // Update URL param so Dashboard can filter by title
        setSearchParams(prev => {
            const next = new URLSearchParams(prev)
            if (value.trim()) {
                next.set('q', value.trim())
            } else {
                next.delete('q')
            }
            // Reset pagination if we are on dashboard
            if (location.pathname === '/') {
                next.set('page', '1')
            }
            return next
        }, { replace: true })

        // Clear previous timeout
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current)
        }

        // Debounce search
        searchTimeoutRef.current = setTimeout(() => {
            performSearch(value)
        }, 300)
    }

    const handleResultClick = (result: SearchResult) => {
        const query = searchQuery.trim()
        setShowDropdown(false)
        setSearchQuery('')
        setMobileMenuOpen(false)
        navigate(`/detail/${encodeURIComponent(result.source)}${query ? `?highlight=${encodeURIComponent(query)}` : ''}`)
    }

    const cycleTheme = () => {
        const themes: ('auto' | 'light' | 'dark')[] = ['auto', 'light', 'dark']
        const idx = themes.indexOf(theme)
        const next = themes[(idx + 1) % themes.length] ?? 'auto'
        setTheme(next)
        localStorage.setItem('theme', next)
        document.documentElement.setAttribute('data-theme', next === 'auto' ? '' : next)
    }

    const toggleLanguage = () => {
        const nextLang = i18n.language === 'zh' ? 'en' : 'zh'
        i18n.changeLanguage(nextLang)
        localStorage.setItem('language', nextLang)
    }

    const isTabActive = (path: string) => {
        if (path === '/' && location.pathname === '/') return true
        if (path !== '/' && location.pathname.startsWith(path)) return true
        return false
    }

    return (
        <header
            className={`sticky top-0 z-40 w-full transition-all duration-200 border-b ${scrolled || mobileMenuOpen
                ? 'bg-[var(--color-bg)]/80 backdrop-blur-md border-[var(--color-border)] shadow-sm'
                : 'bg-[var(--color-bg)] border-transparent'
                }`}
        >
            <div className="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
                {/* Left Section: Brand & Navigation */}
                <div className="flex items-center gap-8">
                    {/* Brand */}
                    <div className="flex items-center gap-2 group cursor-pointer flex-shrink-0" onClick={() => navigate('/')}>
                        <div className="w-8 h-8 rounded-lg overflow-hidden shadow-lg group-hover:scale-105 transition-transform duration-200">
                            <img src={iconPng} alt="DiTing" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex flex-col">
                            <h1 className="text-lg font-bold leading-tight tracking-tight whitespace-nowrap">
                                谛听<span className="text-indigo-500">DiTing</span>
                            </h1>
                            <span className="text-[10px] text-[var(--color-text-muted)] font-medium tracking-wider uppercase hidden sm:block flex items-center gap-1.5">
                                AI Transcription
                                <span
                                    className={`inline-block w-1.5 h-1.5 rounded-full ${asrColor} ${asrAvailable.online > 0 ? 'animate-pulse' : ''} cursor-help`}
                                    title={asrTooltip}
                                    onClick={(e) => { e.stopPropagation(); onOpenSettings?.() }}
                                />
                            </span>
                        </div>
                    </div>

                    {/* Desktop Navigation Tabs */}
                    <nav className="hidden md:flex items-center gap-6">
                        <button
                            onClick={() => navigate('/')}
                            className={`text-sm font-medium transition-colors hover:text-indigo-500 relative py-5 ${isTabActive('/') ? 'text-indigo-500' : 'text-[var(--color-text-muted)]'
                                }`}
                        >
                            {t('dashboard.header.dashboard')}
                            {isTabActive('/') && (
                                <span className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 rounded-t-full" />
                            )}
                        </button>
                        <button
                            onClick={() => navigate('/management')}
                            className={`text-sm font-medium transition-colors hover:text-indigo-500 relative py-5 ${isTabActive('/management') ? 'text-indigo-500' : 'text-[var(--color-text-muted)]'
                                }`}
                        >
                            {t('dashboard.header.management')}
                            {isTabActive('/management') && (
                                <span className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500 rounded-t-full" />
                            )}
                        </button>
                    </nav>
                </div>

                {/* Middle Section: Search (Hidden on Mobile) */}
                <div ref={searchRef} className="hidden md:block flex-1 max-w-md mx-4 relative">
                    <div className="relative group">
                        <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)] group-focus-within:text-indigo-500 transition-colors" />
                        <input
                            type="text"
                            placeholder={t('dashboard.header.searchPlaceholder')}
                            value={searchQuery}
                            onChange={(e) => handleSearchInput(e.target.value)}
                            onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                            className="w-full pl-10 pr-8 py-2 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all"
                        />
                        {searchQuery && !isSearching && (
                            <button
                                onClick={() => handleSearchInput('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                            >
                                <Icons.X className="w-4 h-4" />
                            </button>
                        )}
                        {isSearching && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                <Icons.Loader className="w-4 h-4 animate-spin text-[var(--color-text-muted)]" />
                            </div>
                        )}
                    </div>

                    {/* Results Dropdown */}
                    {showDropdown && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg shadow-xl overflow-hidden z-50 max-h-[400px] overflow-y-auto">
                            {searchResults.map((result) => (
                                <button
                                    key={result.id}
                                    onClick={() => handleResultClick(result)}
                                    className="w-full px-4 py-3 text-left hover:bg-[var(--color-bg)] transition-colors border-b border-[var(--color-border)] last:border-0"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-12 h-8 bg-[var(--color-border)] rounded flex items-center justify-center overflow-hidden flex-shrink-0">
                                            {result.cover ? (
                                                <img
                                                    src={result.cover.startsWith('http') ? result.cover : `/api/cover/${result.source}`}
                                                    alt=""
                                                    className="w-full h-full object-cover"
                                                    onError={(e) => {
                                                        e.currentTarget.style.display = 'none'
                                                        e.currentTarget.parentElement?.classList.add('fallback-icon')
                                                    }}
                                                />
                                            ) : (
                                                <Icons.Video className="w-4 h-4 text-[var(--color-text-muted)]" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm truncate bg-transparent">{result.title}</div>
                                            <div
                                                className="text-xs text-[var(--color-text-muted)] line-clamp-2 [&_mark]:bg-yellow-300/50 [&_mark]:px-0.5 [&_mark]:rounded bg-transparent"
                                                dangerouslySetInnerHTML={{ __html: result.snippet }}
                                            />
                                        </div>
                                    </div>
                                </button>
                            ))}
                            {searchResults.length === 0 && searchQuery && !isSearching && (
                                <div className="px-4 py-6 text-center text-[var(--color-text-muted)] text-sm">
                                    {t('dashboard.header.noResults', { query: searchQuery })}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Right Section: Actions & System */}
                <div className="flex items-center gap-2 sm:gap-4">
                    {/* Actions Group (Desktop) */}
                    <div className="hidden md:flex items-center gap-2 mr-2">
                        <button
                            onClick={() => setShowTaskCenter(true)}
                            className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-card)] rounded-md transition-all duration-200"
                            title={t('dashboard.header.tasks')}
                        >
                            <Icons.Cpu className="w-5 h-5" />
                        </button>

                        {onUploadFile && (
                            <button
                                onClick={onUploadFile}
                                className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-card)] rounded-md transition-all duration-200"
                                title={t('dashboard.header.upload')}
                            >
                                <Icons.Upload className="w-5 h-5" />
                            </button>
                        )}

                        {onAddVideo && (
                            <button
                                onClick={onAddVideo}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-200 active:scale-95 ml-2"
                            >
                                <Icons.Plus className="w-4 h-4" strokeWidth={3} />
                                <span className="hidden lg:inline">{t('dashboard.header.addVideo')}</span>
                                <span className="lg:hidden">{t('common.actions')}</span>
                            </button>
                        )}
                    </div>

                    {/* Mobile Actions: Only CTA & Menu Toggle */}
                    <div className="flex md:hidden items-center gap-2">
                        {onAddVideo && (
                            <button
                                onClick={onAddVideo}
                                className="p-2 bg-indigo-600 text-white rounded-lg shadow-sm active:scale-95"
                            >
                                <Icons.Plus className="w-5 h-5" strokeWidth={3} />
                            </button>
                        )}
                    </div>

                    {/* Divider (Desktop) */}
                    <div className="h-6 w-px bg-[var(--color-border)] hidden md:block"></div>

                    {/* System Icons Group */}
                    <div className="flex items-center gap-1">
                        <button
                            onClick={cycleTheme}
                            className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-card)] rounded-full transition-all duration-200"
                            title={t('dashboard.header.themeToggle', { theme })}
                        >
                            {theme === 'auto' && <Icons.Monitor className="w-5 h-5" />}
                            {theme === 'light' && <Icons.Sun className="w-5 h-5" />}
                            {theme === 'dark' && <Icons.Moon className="w-5 h-5" />}
                        </button>

                        <button
                            onClick={toggleLanguage}
                            className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-card)] rounded-full transition-all duration-200 font-medium text-xs w-9 h-9 flex items-center justify-center border border-transparent hover:border-[var(--color-border)]"
                            title={t('dashboard.header.language')}
                        >
                            {i18n.language === 'zh' ? '中' : 'EN'}
                        </button>

                        <button
                            onClick={onOpenSettings}
                            className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-card)] rounded-full transition-all duration-200 group"
                            title={t('dashboard.header.settings')}
                        >
                            <Icons.Settings className="w-5 h-5 group-hover:rotate-45 transition-transform duration-300" />
                        </button>

                        {/* Mobile Menu Toggle */}
                        <button
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            className="md:hidden p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-card)] rounded-md ml-1"
                            aria-label={t('dashboard.header.menu')}
                        >
                            {mobileMenuOpen ? <Icons.X className="w-6 h-6" /> : <Icons.List className="w-6 h-6" />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Menu Dropdown */}
            {mobileMenuOpen && (
                <div className="md:hidden border-t border-[var(--color-border)] bg-[var(--color-bg)] animate-in slide-in-from-top-2 duration-200">
                    <div className="p-4 space-y-4">
                        {/* Mobile Search */}
                        <div className="relative">
                            <Icons.Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" />
                            <input
                                type="text"
                                placeholder={t('dashboard.header.searchPlaceholder')}
                                value={searchQuery}
                                onChange={(e) => handleSearchInput(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg text-sm"
                            />
                            {/* Mobile Search Results */}
                            {showDropdown && searchResults.length > 0 && (
                                <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg shadow-xl overflow-hidden z-50 max-h-[300px] overflow-y-auto">
                                    {searchResults.map((result) => (
                                        <button
                                            key={result.id}
                                            onClick={() => handleResultClick(result)}
                                            className="w-full px-4 py-3 text-left hover:bg-[var(--color-bg)] transition-colors border-b border-[var(--color-border)] last:border-0"
                                        >
                                            <div className="font-medium text-sm truncate">{result.title}</div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Mobile Navigation */}
                        <div className="space-y-1">
                            <button
                                onClick={() => navigate('/')}
                                className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium ${isTabActive('/')
                                    ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400'
                                    : 'text-[var(--color-text)] hover:bg-[var(--color-card)]'
                                    }`}
                            >
                                <Icons.LayoutDashboard className="w-5 h-5" />
                                {t('dashboard.header.dashboard')}
                            </button>
                            <button
                                onClick={() => navigate('/management')}
                                className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium ${isTabActive('/management')
                                    ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400'
                                    : 'text-[var(--color-text)] hover:bg-[var(--color-card)]'
                                    }`}
                            >
                                <Icons.Settings className="w-5 h-5" />
                                {t('dashboard.header.management')}
                            </button>
                        </div>

                        <div className="h-px bg-[var(--color-border)]"></div>

                        {/* Mobile Actions */}
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => { setShowTaskCenter(true); setMobileMenuOpen(false); }}
                                className="flex items-center justify-center gap-2 px-4 py-3 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg text-sm font-medium text-[var(--color-text)]"
                            >
                                <Icons.Cpu className="w-5 h-5 text-[var(--color-text-muted)]" />
                                {t('dashboard.header.tasks')}
                            </button>
                            {onUploadFile && (
                                <button
                                    onClick={() => { onUploadFile(); setMobileMenuOpen(false); }}
                                    className="flex items-center justify-center gap-2 px-4 py-3 bg-[var(--color-card)] border border-[var(--color-border)] rounded-lg text-sm font-medium text-[var(--color-text)]"
                                >
                                    <Icons.Upload className="w-5 h-5 text-[var(--color-text-muted)]" />
                                    {t('dashboard.header.upload')}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <TaskCenter isOpen={showTaskCenter} onClose={() => setShowTaskCenter(false)} />
        </header>
    )
}

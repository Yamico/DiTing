import { useState, useEffect } from 'react'

/**
 * Returns true when viewport width >= the given breakpoint (default 1024px = Tailwind `lg`).
 * Listens for resize so the value stays in sync.
 */
export function useIsDesktop(breakpoint = 1024) {
    const [isDesktop, setIsDesktop] = useState(
        () => window.matchMedia(`(min-width: ${breakpoint}px)`).matches
    )

    useEffect(() => {
        const mql = window.matchMedia(`(min-width: ${breakpoint}px)`)
        const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches)
        mql.addEventListener('change', handler)
        return () => mql.removeEventListener('change', handler)
    }, [breakpoint])

    return isDesktop
}

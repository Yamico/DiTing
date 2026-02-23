import { useEffect, useRef } from 'react'

const handlers: Array<{ id: symbol, fn: (e: KeyboardEvent) => void }> = []

// Global listener setup to handle LIFO (Last-In-First-Out) stack for modals
if (typeof window !== 'undefined') {
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            const top = handlers[handlers.length - 1]
            if (top) {
                top.fn(event)
            }
        }
    })
}

/**
 * Hook to handle Escape key press.
 * Uses a global stack to ensure only the top-most modal/component handles the event.
 * @param handler Function to call when Escape is pressed
 * @param isActive Whether the listener should be active
 */
export function useEscapeKey(handler: (e: KeyboardEvent) => void, isActive: boolean = true) {
    const savedHandler = useRef(handler)
    const id = useRef(Symbol())

    useEffect(() => {
        savedHandler.current = handler
    }, [handler])

    useEffect(() => {
        if (!isActive) return

        const listener = (e: KeyboardEvent) => savedHandler.current(e)
        handlers.push({ id: id.current, fn: listener })

        return () => {
            const index = handlers.findIndex(h => h.id === id.current)
            if (index > -1) {
                handlers.splice(index, 1)
            }
        }
    }, [isActive])
}

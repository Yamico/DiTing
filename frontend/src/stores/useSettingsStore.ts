import { create } from 'zustand'

type SettingsTab = 'llm' | 'asr' | 'prompt' | 'system' | 'about'

interface SettingsState {
    isOpen: boolean
    initialTab: SettingsTab | null
    initialCategoryKey: string | null
    open: (opts?: { tab?: SettingsTab; categoryKey?: string }) => void
    close: () => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
    isOpen: false,
    initialTab: null,
    initialCategoryKey: null,
    open: (opts) => set({
        isOpen: true,
        initialTab: opts?.tab ?? null,
        initialCategoryKey: opts?.categoryKey ?? null,
    }),
    close: () => set({ isOpen: false, initialTab: null, initialCategoryKey: null }),
}))

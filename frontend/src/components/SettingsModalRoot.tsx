import SettingsModal from './SettingsModal'
import { useSettingsStore } from '../stores/useSettingsStore'

/**
 * Renders the global SettingsModal driven by useSettingsStore.
 * Mounted at the App root so any page can call useSettingsStore.getState().open(...)
 */
export default function SettingsModalRoot() {
    const { isOpen, initialTab, initialCategoryKey, close } = useSettingsStore()
    if (!isOpen) return null
    return (
        <SettingsModal
            onClose={close}
            initialTab={initialTab ?? undefined}
            initialCategoryKey={initialCategoryKey ?? undefined}
        />
    )
}

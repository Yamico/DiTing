import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import Header from './Header'
import AddVideoModal from './AddVideoModal'
import UploadFileModal from './UploadFileModal'
import { useSettingsStore } from '../stores/useSettingsStore'

/**
 * Shared layout for pages that display the global Header (Dashboard, Management).
 * Modals for Add Video / Upload are lifted here. SettingsModal is mounted at App root
 * via SettingsModalRoot so it's reachable from any page (including Detail).
 */
export default function AppLayout() {
    const queryClient = useQueryClient()
    const [showAddModal, setShowAddModal] = useState(false)
    const [showUpload, setShowUpload] = useState(false)
    const openSettings = useSettingsStore(s => s.open)

    const handleSuccess = () => {
        // Invalidate videos query so Dashboard auto-refreshes
        queryClient.invalidateQueries({ queryKey: ['videos'] })
    }

    return (
        <div className="min-h-screen bg-[var(--color-bg)]">
            <Header
                onAddVideo={() => setShowAddModal(true)}
                onOpenSettings={() => openSettings()}
                onUploadFile={() => setShowUpload(true)}
            />
            <Outlet />

            {showAddModal && (
                <AddVideoModal
                    onClose={() => setShowAddModal(false)}
                    onSuccess={() => { setShowAddModal(false); handleSuccess() }}
                />
            )}
            {showUpload && (
                <UploadFileModal
                    onClose={() => setShowUpload(false)}
                    onSuccess={() => { setShowUpload(false); handleSuccess() }}
                />
            )}
        </div>
    )
}

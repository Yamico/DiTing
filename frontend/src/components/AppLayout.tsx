import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import Header from './Header'
import AddVideoModal from './AddVideoModal'
import SettingsModal from './SettingsModal'
import UploadFileModal from './UploadFileModal'

/**
 * Shared layout for pages that display the global Header (Dashboard, Management).
 * Modals for Add Video / Upload / Settings are lifted here so they're accessible from any page.
 */
export default function AppLayout() {
    const queryClient = useQueryClient()
    const [showAddModal, setShowAddModal] = useState(false)
    const [showSettings, setShowSettings] = useState(false)
    const [showUpload, setShowUpload] = useState(false)

    const handleSuccess = () => {
        // Invalidate videos query so Dashboard auto-refreshes
        queryClient.invalidateQueries({ queryKey: ['videos'] })
    }

    return (
        <div className="min-h-screen bg-[var(--color-bg)]">
            <Header
                onAddVideo={() => setShowAddModal(true)}
                onOpenSettings={() => setShowSettings(true)}
                onUploadFile={() => setShowUpload(true)}
            />
            <Outlet />

            {showAddModal && (
                <AddVideoModal
                    onClose={() => setShowAddModal(false)}
                    onSuccess={() => { setShowAddModal(false); handleSuccess() }}
                />
            )}
            {showSettings && (
                <SettingsModal onClose={() => setShowSettings(false)} />
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

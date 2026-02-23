import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ToastProvider } from './contexts/ToastContext'
import Dashboard from './pages/Dashboard'
import Detail from './pages/Detail'
import Management from './pages/Management'
import AppLayout from './components/AppLayout'

function App() {
    const { t, i18n } = useTranslation()

    useEffect(() => {
        document.title = t('common.appName')
    }, [t, i18n.language])

    return (
        <ToastProvider>
            <BrowserRouter basename="/app">
                <Routes>
                    {/* Routes with shared Header */}
                    <Route element={<AppLayout />}>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/management" element={<Management />} />
                    </Route>
                    {/* Detail has its own header */}
                    <Route path="/detail/:sourceId" element={<Detail />} />
                </Routes>
            </BrowserRouter>
        </ToastProvider>
    )
}

export default App

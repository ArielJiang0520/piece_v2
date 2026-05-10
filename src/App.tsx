import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './auth'
import TopNav from './components/TopNav'
import TopNavProvider from './components/TopNavProvider'
import RouteScrollManager from './components/RouteScrollManager'
import { ToastProvider } from './components/Toast'
import Login from './pages/Login'
import WorldList from './pages/worlds/list/WorldList'
import WorldPrompts from './pages/worlds/prompts/WorldPrompts'
import WorldAbout from './pages/worlds/about/WorldAbout'
import WorldEditor from './pages/worlds/editor/WorldEditor'
import Generate from './pages/worlds/generate/Generate'

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return (
    <>
      <TopNav />
      {children}
    </>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <TopNavProvider>
        <RouteScrollManager />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Navigate to="/worlds" replace />} />
          <Route path="/worlds" element={<ProtectedLayout><WorldList /></ProtectedLayout>} />
          <Route path="/worlds/new" element={<ProtectedLayout><WorldEditor /></ProtectedLayout>} />
          <Route path="/worlds/:id" element={<ProtectedLayout><WorldPrompts /></ProtectedLayout>} />
          <Route path="/worlds/:id/about" element={<ProtectedLayout><WorldAbout /></ProtectedLayout>} />
          <Route path="/worlds/:id/edit" element={<ProtectedLayout><WorldEditor /></ProtectedLayout>} />
          <Route path="/worlds/:id/generate" element={<ProtectedLayout><Generate /></ProtectedLayout>} />
        </Routes>
      </TopNavProvider>
    </ToastProvider>
  )
}

import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './auth'
import TopNav, { TopNavProvider } from './components/TopNav'
import RouteScrollManager from './components/RouteScrollManager'
import { ToastProvider } from './components/Toast'
import Login from './pages/Login'
import Piece from './pages/Piece'
import WorldList from './pages/worlds/WorldList'
import WorldCreate from './pages/worlds/worldForm/WorldCreate'
import World from './pages/worlds/World'
import WorldEdit from './pages/worlds/worldForm/WorldEdit'
import Cluster from './pages/worlds/Cluster'
import Prompt from './pages/worlds/Prompt'
import Generate from './pages/worlds/Generate'
import EditRegisters from './pages/admin/EditRegisters'

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
          <Route path="/worlds/new" element={<ProtectedLayout><WorldCreate /></ProtectedLayout>} />
          <Route path="/worlds/:id" element={<ProtectedLayout><World /></ProtectedLayout>} />
          <Route path="/worlds/:id/edit" element={<ProtectedLayout><WorldEdit /></ProtectedLayout>} />
          <Route path="/worlds/:id/clusters/:clusterId" element={<ProtectedLayout><Cluster /></ProtectedLayout>} />
          <Route path="/worlds/:id/prompts/:promptId" element={<ProtectedLayout><Prompt /></ProtectedLayout>} />
          <Route path="/worlds/:id/generate" element={<ProtectedLayout><Generate /></ProtectedLayout>} />
          <Route path="/pieces/:id" element={<ProtectedLayout><Piece /></ProtectedLayout>} />
          <Route path="/admin/registers" element={<ProtectedLayout><EditRegisters /></ProtectedLayout>} />
        </Routes>
      </TopNavProvider>
    </ToastProvider>
  )
}

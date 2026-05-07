import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './auth'
import TopNav from './components/TopNav'
import TopNavProvider from './components/TopNavProvider'
import RouteScrollManager from './components/RouteScrollManager'
import { ToastProvider } from './components/Toast'
import Login from './pages/Login'
import Piece from './pages/Piece'
import WorldList from './pages/worlds/WorldList'
import World from './pages/worlds/World'
import WorldAbout from './pages/worlds/WorldAbout'
import WorldEditor from './pages/worlds/WorldEditor'
import Cluster from './pages/worlds/clusters/Cluster'
import Prompt from './pages/worlds/prompts/Prompt'
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
          <Route path="/worlds/:id" element={<ProtectedLayout><World /></ProtectedLayout>} />
          <Route path="/worlds/:id/about" element={<ProtectedLayout><WorldAbout /></ProtectedLayout>} />
          <Route path="/worlds/:id/edit" element={<ProtectedLayout><WorldEditor /></ProtectedLayout>} />
          <Route path="/worlds/:id/clusters/:clusterId" element={<ProtectedLayout><Cluster /></ProtectedLayout>} />
          <Route path="/worlds/:id/prompts/:promptId" element={<ProtectedLayout><Prompt /></ProtectedLayout>} />
          <Route path="/worlds/:id/generate" element={<ProtectedLayout><Generate /></ProtectedLayout>} />
          <Route path="/pieces/:id" element={<ProtectedLayout><Piece /></ProtectedLayout>} />
        </Routes>
      </TopNavProvider>
    </ToastProvider>
  )
}

import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './auth'
import TopNav, { TopNavProvider } from './ui/TopNav'
import RouteScrollManager from './ui/RouteScrollManager'
import Login from './pages/Login'
import Piece from './pages/Piece'
import WorldList from './pages/worlds/WorldList'
import World from './pages/worlds/World'
import WorldEdit from './pages/worlds/WorldEdit'
import Cluster from './pages/worlds/Cluster'
import Prompt from './pages/worlds/Prompt'
import PromptNew from './pages/worlds/PromptNew'
import Generate from './pages/worlds/Generate'
import WorldExplore from './pages/worlds/WorldExplore'

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
    <TopNavProvider>
      <RouteScrollManager />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Navigate to="/worlds" replace />} />
        <Route path="/worlds" element={<ProtectedLayout><WorldList /></ProtectedLayout>} />
        <Route path="/worlds/:id" element={<ProtectedLayout><World /></ProtectedLayout>} />
        <Route path="/worlds/:id/edit" element={<ProtectedLayout><WorldEdit /></ProtectedLayout>} />
        <Route path="/worlds/:id/clusters/:clusterId" element={<ProtectedLayout><Cluster /></ProtectedLayout>} />
        <Route path="/worlds/:id/prompts/new" element={<ProtectedLayout><PromptNew /></ProtectedLayout>} />
        <Route path="/worlds/:id/prompts/:promptId" element={<ProtectedLayout><Prompt /></ProtectedLayout>} />
        <Route path="/worlds/:id/generate" element={<ProtectedLayout><Generate /></ProtectedLayout>} />
        <Route path="/pieces/:id" element={<ProtectedLayout><Piece /></ProtectedLayout>} />
      </Routes>
    </TopNavProvider>
  )
}

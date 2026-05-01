import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './auth'
import Login from './pages/Login'
import Worlds from './pages/Worlds'
import WorldDetail from './pages/WorldDetail'
import WorldPieces from './pages/WorldPieces'
import ClusterPieces from './pages/ClusterPieces'
import PromptPieces from './pages/PromptPieces'
import CreatePrompt from './pages/CreatePrompt'
import Generate from './pages/Generate'
import PieceReader from './pages/PieceReader'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Worlds /></ProtectedRoute>} />
      <Route path="/worlds/:id" element={<ProtectedRoute><WorldPieces /></ProtectedRoute>} />
      <Route path="/worlds/:id/details" element={<ProtectedRoute><WorldDetail /></ProtectedRoute>} />
      <Route path="/worlds/:id/clusters/:clusterId" element={<ProtectedRoute><ClusterPieces /></ProtectedRoute>} />
      <Route path="/worlds/:id/prompts/new" element={<ProtectedRoute><CreatePrompt /></ProtectedRoute>} />
      <Route path="/worlds/:id/prompts/:promptId" element={<ProtectedRoute><PromptPieces /></ProtectedRoute>} />
      <Route path="/worlds/:id/generate" element={<ProtectedRoute><Generate /></ProtectedRoute>} />
      <Route path="/pieces/:id" element={<ProtectedRoute><PieceReader /></ProtectedRoute>} />
    </Routes>
  )
}

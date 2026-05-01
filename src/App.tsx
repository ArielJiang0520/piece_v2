import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './auth'
import Login from './pages/Login'
import Worlds from './pages/Worlds'
import WorldDetail from './pages/WorldDetail'
import WorldPieces from './pages/WorldPieces'
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
      <Route path="/worlds/:id" element={<ProtectedRoute><WorldDetail /></ProtectedRoute>} />
      <Route path="/worlds/:id/pieces" element={<ProtectedRoute><WorldPieces /></ProtectedRoute>} />
      <Route path="/worlds/:id/generate" element={<ProtectedRoute><Generate /></ProtectedRoute>} />
      <Route path="/pieces/:id" element={<ProtectedRoute><PieceReader /></ProtectedRoute>} />
    </Routes>
  )
}

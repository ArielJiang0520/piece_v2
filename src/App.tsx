import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './auth'
import TopNav from './components/TopNav'
import TopNavProvider from './components/TopNavProvider'
import RouteScrollManager from './components/RouteScrollManager'
import { ToastProvider } from './components/Toast'
import Login from './pages/Login'
import WorldList from './pages/worlds/list/WorldList'
import WorldPrompts from './pages/worlds/prompts/WorldPrompts'
import WorldAbout from './pages/worlds/about/WorldAbout'
import WorldAdditions from './pages/worlds/additions/WorldAdditions'
import WorldEditor from './pages/worlds/editor/WorldEditor'
import PromptPage from './pages/worlds/prompt/PromptPage'
import GenerateScreen from './pages/worlds/generate/GenerateScreen'
import TasteScreen from './pages/worlds/taste/TasteScreen'
import WorldChatScreen from './pages/worlds/chat/WorldChatScreen'
import PromptChatScreen from './pages/worlds/chat/PromptChatScreen'

function RootLayout() {
  return (
    <ToastProvider>
      <TopNavProvider>
        <RouteScrollManager />
        <Outlet />
      </TopNavProvider>
    </ToastProvider>
  )
}

function ProtectedLayout() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return (
    <>
      <TopNav />
      <Outlet />
    </>
  )
}

// Data router (createBrowserRouter) so the reading view can use useBlocker to guard
// against losing unsaved work on a browser back/swipe.
const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/login', element: <Login /> },
      {
        element: <ProtectedLayout />,
        children: [
          { path: '/', element: <Navigate to="/worlds" replace /> },
          { path: '/worlds', element: <WorldList /> },
          { path: '/worlds/new', element: <WorldEditor /> },
          { path: '/worlds/:id', element: <WorldPrompts /> },
          { path: '/worlds/:id/about', element: <WorldAbout /> },
          { path: '/worlds/:id/additions', element: <WorldAdditions /> },
          { path: '/worlds/:id/taste', element: <TasteScreen /> },
          { path: '/worlds/:id/chat', element: <WorldChatScreen /> },
          { path: '/worlds/:id/prompt/new', element: <PromptPage /> },
          { path: '/worlds/:id/prompt/new/chat', element: <PromptChatScreen /> },
          { path: '/worlds/:id/prompt/new/generate', element: <GenerateScreen /> },
          { path: '/worlds/:id/prompt/:promptId', element: <PromptPage /> },
          { path: '/worlds/:id/prompt/:promptId/chat', element: <PromptChatScreen /> },
          { path: '/worlds/:id/prompt/:promptId/generate', element: <GenerateScreen /> },
        ],
      },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}

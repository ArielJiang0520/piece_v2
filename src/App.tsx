import { createBrowserRouter, RouterProvider, Navigate, Outlet, useParams } from 'react-router-dom'
import { useAuth } from './auth'
import TopNav from './components/TopNav'
import TopNavProvider from './components/TopNavProvider'
import RouteScrollManager from './components/RouteScrollManager'
import { ToastProvider } from './components/Toast'
import Login from './pages/Login'
import Discover from './pages/home/Discover'
import Profile from './pages/profile/Profile'
import EditProfile from './pages/profile/EditProfile'
import WorldScenes from './pages/worlds/scenes/WorldScenes'
import WorldCollection from './pages/worlds/collection/WorldCollection'
import WorldAbout from './pages/worlds/about/WorldAbout'
import WorldChanges from './pages/worlds/changes/WorldChanges'
import CreatorCenterHome from './pages/creator-center/CreatorCenterHome'
import CreatorWorld from './pages/creator-center/CreatorWorld'
import CreatorScenes from './pages/creator-center/CreatorScenes'
import CreatorScenePage from './pages/creator-center/CreatorScenePage'
import CreatorTestScreen from './pages/creator-center/CreatorTestScreen'
import ScenePage from './pages/worlds/scene/ScenePage'
import CreatorCollectionPage from './pages/creator-center/CreatorCollectionPage'
import GenerateScreen from './pages/worlds/generate/GenerateScreen'

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

// About used to live at /worlds/:id/about; it is the world's landing tab now.
function OldAboutRedirect() {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={`/worlds/${id}`} replace />
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
          { path: '/', element: <Discover /> },
          { path: '/u/:username', element: <Profile tab="created" /> },
          { path: '/u/:username/bookmarked', element: <Profile tab="bookmarked" /> },
          { path: '/profile/edit', element: <EditProfile /> },
          { path: '/worlds', element: <Navigate to="/" replace /> },
          // A world opens on About; its scenes are the second tab.
          { path: '/worlds/:id', element: <WorldAbout /> },
          { path: '/worlds/:id/scenes', element: <WorldScenes /> },
          { path: '/worlds/:id/collections/:collectionId', element: <WorldCollection /> },
          { path: '/worlds/:id/about', element: <OldAboutRedirect /> },
          // The creator center, a separate place entered only from the menu: its home lists the creator's
          // worlds, and everything they do to one happens under /worlds/:id/edit.
          { path: '/creator-center', element: <CreatorCenterHome /> },
          { path: '/worlds/:id/edit', element: <CreatorWorld /> },
          { path: '/worlds/:id/edit/scenes', element: <CreatorScenes /> },
          { path: '/worlds/:id/edit/collections/:collectionId', element: <CreatorCollectionPage /> },
          // Collections and scenes here are named by their draft keys.
          { path: '/worlds/:id/edit/scenes/:sceneId', element: <CreatorScenePage /> },
          { path: '/worlds/:id/edit/scenes/:sceneId/test', element: <CreatorTestScreen /> },
          { path: '/worlds/:id/changes', element: <WorldChanges /> },
          { path: '/worlds/:id/scenes/:sceneId', element: <ScenePage /> },
          { path: '/worlds/:id/scenes/:sceneId/generate', element: <GenerateScreen /> },
        ],
      },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}

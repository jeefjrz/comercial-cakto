import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/lib/authContext'
import Home from './pages/Home'
import Login from './pages/Login'
import Ativacoes from './pages/Ativacoes'
import Ranking from './pages/Ranking'
import Responsaveis from './pages/Responsaveis'
import Formularios from './pages/Formularios'
import Estoque from './pages/Estoque'
import Agenda from './pages/Agenda'
import Dashboards from './pages/Dashboards'
import PublicForm from './pages/PublicForm'

// Hostnames that belong to the internal panel
const INTERNAL_HOSTS = ['localhost', '127.0.0.1']
const APP_DOMAIN = import.meta.env.VITE_APP_DOMAIN as string | undefined

function isInternalHost(hostname: string): boolean {
  if (INTERNAL_HOSTS.includes(hostname)) return true
  if (APP_DOMAIN && hostname === APP_DOMAIN) return true
  if (hostname.endsWith('.vercel.app')) return true
  return false
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const hostname = window.location.hostname

  // Custom domain: bypass the entire panel and serve the public form directly
  if (!isInternalHost(hostname)) {
    return <PublicForm customDomain={hostname} />
  }

  return (
    <Routes>
      {/* ── Public routes ── */}
      <Route path="/login" element={<Login />} />
      <Route path="/f/:formId" element={<PublicForm />} />

      {/* ── Protected panel routes ── */}
      <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
      <Route path="/ativacoes" element={<ProtectedRoute><Ativacoes /></ProtectedRoute>} />
      <Route path="/ranking" element={<ProtectedRoute><Ranking /></ProtectedRoute>} />
      <Route path="/responsaveis" element={<ProtectedRoute><Responsaveis /></ProtectedRoute>} />
      <Route path="/formularios" element={<ProtectedRoute><Formularios /></ProtectedRoute>} />
      <Route path="/estoque" element={<ProtectedRoute><Estoque /></ProtectedRoute>} />
      <Route path="/agenda" element={<ProtectedRoute><Agenda /></ProtectedRoute>} />
      <Route path="/dashboards" element={<ProtectedRoute><Dashboards /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

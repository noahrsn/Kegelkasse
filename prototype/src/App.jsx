import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'

import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import SetupWizard from './pages/SetupWizard'

import Dashboard from './pages/Dashboard'
import Sessions from './pages/sessions/Sessions'
import SessionNew from './pages/sessions/SessionNew'
import SessionRecord from './pages/sessions/SessionRecord'
import SessionReview from './pages/sessions/SessionReview'
import Treasury from './pages/treasury/Treasury'
import TreasuryImport from './pages/treasury/TreasuryImport'
import TreasuryNew from './pages/treasury/TreasuryNew'
import Penalties from './pages/Penalties'
import Members from './pages/Members'
import Calendar from './pages/calendar/Calendar'
import CalendarEvent from './pages/calendar/CalendarEvent'
import CalendarNew from './pages/calendar/CalendarNew'
import Settings from './pages/Settings'
import Stats from './pages/stats/Stats'
import StatsAlltime from './pages/stats/StatsAlltime'
import Profile from './pages/Profile'
import Polls from './pages/Polls'

/* Screens mit App-Shell (Sidebar / Bottom-Nav) */
function Shell({ children }) {
  return <Layout>{children}</Layout>
}

export default function App() {
  return (
    <Routes>
      {/* Auth & Onboarding — ohne Shell */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/setup/:step" element={<SetupWizard />} />
      <Route path="/setup" element={<Navigate to="/setup/1" replace />} />

      {/* App */}
      <Route path="/dashboard" element={<Shell><Dashboard /></Shell>} />
      <Route path="/sessions" element={<Shell><Sessions /></Shell>} />
      <Route path="/sessions/new" element={<Shell><SessionNew /></Shell>} />
      <Route path="/sessions/:id" element={<Shell><SessionRecord /></Shell>} />
      <Route path="/sessions/:id/review" element={<Shell><SessionReview /></Shell>} />
      <Route path="/treasury" element={<Shell><Treasury /></Shell>} />
      <Route path="/treasury/import" element={<Shell><TreasuryImport /></Shell>} />
      <Route path="/treasury/new" element={<Shell><TreasuryNew /></Shell>} />
      <Route path="/penalties" element={<Shell><Penalties /></Shell>} />
      <Route path="/members" element={<Shell><Members /></Shell>} />
      <Route path="/calendar" element={<Shell><Calendar /></Shell>} />
      <Route path="/calendar/new" element={<Shell><CalendarNew /></Shell>} />
      <Route path="/calendar/:id" element={<Shell><CalendarEvent /></Shell>} />
      <Route path="/settings" element={<Shell><Settings /></Shell>} />
      <Route path="/stats" element={<Shell><Stats /></Shell>} />
      <Route path="/stats/alltime" element={<Shell><StatsAlltime /></Shell>} />
      <Route path="/profile" element={<Shell><Profile /></Shell>} />
      <Route path="/polls" element={<Shell><Polls /></Shell>} />

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import PublicOnlyRoute from './components/PublicOnlyRoute'

import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'
import VerifyEmail from './pages/auth/VerifyEmail'
import NewGroup from './pages/groups/NewGroup'
import Join from './pages/groups/Join'
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
import Rulebook from './pages/Rulebook'
import Members from './pages/Members'
import Calendar from './pages/calendar/Calendar'
import CalendarEvent from './pages/calendar/CalendarEvent'
import CalendarNew from './pages/calendar/CalendarNew'
import CalendarEdit from './pages/calendar/CalendarEdit'
import Settings from './pages/Settings'
import Stats from './pages/stats/Stats'
import MemberStats from './pages/stats/MemberStats'
import Profile from './pages/Profile'
import Polls from './pages/Polls'
import PollNew from './pages/PollNew'
import Log from './pages/Log'

/* App-Screen: geschützt + App-Shell (Sidebar / Bottom-Nav) */
function Protected({ children }) {
  return (
    <ProtectedRoute>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <Routes>
      {/* Öffentlich — Auth. Wer schon angemeldet ist, wird durchgereicht. */}
      <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
      <Route path="/register" element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />
      <Route
        path="/forgot-password"
        element={<PublicOnlyRoute><ForgotPassword /></PublicOnlyRoute>}
      />
      {/* Recovery-Link erzeugt selbst eine Session — darf nicht umgeleitet werden. */}
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/join/:token" element={<Join />} />

      {/* Onboarding — Session nötig, aber noch ohne Club */}
      <Route
        path="/groups/new"
        element={<ProtectedRoute requireGroup={false}><NewGroup /></ProtectedRoute>}
      />
      <Route
        path="/setup/:step"
        element={<ProtectedRoute requireGroup={false}><SetupWizard /></ProtectedRoute>}
      />
      <Route path="/setup" element={<Navigate to="/setup/1" replace />} />

      {/* App — geschützt */}
      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/sessions" element={<Protected><Sessions /></Protected>} />
      <Route path="/sessions/new" element={<Protected><SessionNew /></Protected>} />
      <Route path="/sessions/:id" element={<Protected><SessionRecord /></Protected>} />
      <Route path="/sessions/:id/review" element={<Protected><SessionReview /></Protected>} />
      <Route path="/treasury" element={<Protected><Treasury /></Protected>} />
      <Route path="/treasury/import" element={<Protected><TreasuryImport /></Protected>} />
      <Route path="/treasury/new" element={<Protected><TreasuryNew /></Protected>} />
      <Route path="/penalties" element={<Protected><Penalties /></Protected>} />
      <Route path="/rulebook" element={<Protected><Rulebook /></Protected>} />
      <Route path="/members" element={<Protected><Members /></Protected>} />
      <Route path="/calendar" element={<Protected><Calendar /></Protected>} />
      <Route path="/calendar/new" element={<Protected><CalendarNew /></Protected>} />
      <Route path="/calendar/:id" element={<Protected><CalendarEvent /></Protected>} />
      <Route path="/calendar/:id/edit" element={<Protected><CalendarEdit /></Protected>} />
      <Route path="/settings" element={<Protected><Settings /></Protected>} />
      <Route path="/stats" element={<Protected><Stats /></Protected>} />
      <Route path="/stats/mitglied/:userId" element={<Protected><MemberStats /></Protected>} />
      {/* Die ewige Tabelle ist in der Rangliste aufgegangen. */}
      <Route path="/stats/alltime" element={<Navigate to="/stats?tab=rangliste&p=all" replace />} />
      <Route path="/profile" element={<Protected><Profile /></Protected>} />
      <Route path="/polls" element={<Protected><Polls /></Protected>} />
      <Route path="/polls/new" element={<Protected><PollNew /></Protected>} />
      <Route path="/log" element={<Protected><Log /></Protected>} />

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

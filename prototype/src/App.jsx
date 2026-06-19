import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Sessions from './pages/Sessions.jsx';
import SessionNew from './pages/SessionNew.jsx';
import SessionRecord from './pages/SessionRecord.jsx';
import Treasury from './pages/Treasury.jsx';
import TreasuryImport from './pages/TreasuryImport.jsx';
import Members from './pages/Members.jsx';
import Calendar from './pages/Calendar.jsx';
import CalendarEvent from './pages/CalendarEvent.jsx';
import Penalties from './pages/Penalties.jsx';
import Settings from './pages/Settings.jsx';
import Stats from './pages/Stats.jsx';
import StatsAlltime from './pages/StatsAlltime.jsx';
import Profile from './pages/Profile.jsx';
import Polls from './pages/Polls.jsx';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="sessions" element={<Sessions />} />
          <Route path="sessions/new" element={<SessionNew />} />
          <Route path="sessions/:id" element={<SessionRecord />} />
          <Route path="treasury" element={<Treasury />} />
          <Route path="treasury/import" element={<TreasuryImport />} />
          <Route path="members" element={<Members />} />
          <Route path="calendar" element={<Calendar />} />
          <Route path="calendar/:id" element={<CalendarEvent />} />
          <Route path="penalties" element={<Penalties />} />
          <Route path="settings" element={<Settings />} />
          <Route path="stats" element={<Stats />} />
          <Route path="stats/alltime" element={<StatsAlltime />} />
          <Route path="profile" element={<Profile />} />
          <Route path="polls" element={<Polls />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

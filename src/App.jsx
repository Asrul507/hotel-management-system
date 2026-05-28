import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ReservationsPage from './pages/ReservationsPage';
import CheckinPage from './pages/CheckinPage';
import BillingPage from './pages/BillingPage';
import HousekeepingPage from './pages/HousekeepingPage';
import MaintenancePage from './pages/MaintenancePage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import { ROLES } from './utils/roles';

const anyStaff = Object.values(ROLES);

export default function App() {
  return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/unauthorized" element={<UnauthorizedPage />} />
    <Route element={<ProtectedRoute allow={anyStaff}><AppLayout /></ProtectedRoute>}>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/reservations" element={<ReservationsPage />} />
      <Route path="/checkin" element={<CheckinPage />} />
      <Route path="/billing" element={<BillingPage />} />
      <Route path="/housekeeping" element={<HousekeepingPage />} />
      <Route path="/maintenance" element={<MaintenancePage />} />
      <Route path="/reports" element={<ReportsPage />} />
      <Route path="/settings" element={<SettingsPage />} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}

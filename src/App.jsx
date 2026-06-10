import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import RoomsPage from './pages/RoomsPage';
import MasterSettingsPage from './pages/MasterSettingsPage';
import GuestsPage from './pages/GuestsPage';
import ForecastPage from './pages/ForecastPage';
import ReservationsPage from './pages/ReservationsPage';
import CheckinPage from './pages/CheckinPage';
import BillingPage from './pages/BillingPage';
import HousekeepingPage from './pages/HousekeepingPage';
import MaintenancePage from './pages/MaintenancePage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import { ROLES, roleAccess } from './utils/roles';

const anyStaff = Object.values(ROLES);
const allowed = (feature, element) => <ProtectedRoute allow={roleAccess[feature]}>{element}</ProtectedRoute>;

export default function App() {
  return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/unauthorized" element={<UnauthorizedPage />} />
    <Route element={<ProtectedRoute allow={anyStaff}><AppLayout /></ProtectedRoute>}>
      <Route path="/" element={allowed('dashboard', <DashboardPage />)} />
      <Route path="/rooms" element={allowed('rooms', <RoomsPage />)} />
      <Route path="/master-settings" element={allowed('masterSettings', <MasterSettingsPage />)} />
      <Route path="/settings/rooms" element={<Navigate to="/master-settings" replace />} />
      <Route path="/guests" element={allowed('guests', <GuestsPage />)} />
      <Route path="/tamu" element={<Navigate to="/guests" replace />} />
      <Route path="/forecast" element={allowed('forecast', <ForecastPage />)} />
      <Route path="/reservations" element={allowed('reservations', <ReservationsPage />)} />
      <Route path="/checkin" element={allowed('checkInOut', <CheckinPage />)} />
      <Route path="/billing" element={allowed('billing', <BillingPage />)} />
      <Route path="/housekeeping" element={allowed('housekeeping', <HousekeepingPage />)} />
      <Route path="/maintenance" element={allowed('maintenance', <MaintenancePage />)} />
      <Route path="/reports" element={allowed('reports', <ReportsPage />)} />
      <Route path="/settings" element={allowed('settings', <SettingsPage />)} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}

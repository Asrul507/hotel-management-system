import { Navigate, Route, Routes } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import DashboardPage from './pages/DashboardPage';
import MasterSettingsPage from './pages/MasterSettingsPage';
import GuestsPage from './pages/GuestsPage';
import ForecastPage from './pages/ForecastPage';
import FrontOfficePage from './pages/FrontOfficePage';
import RoomChartPage from './pages/RoomChartPage';
import BillingPage from './pages/BillingPage';
import PosPage from './pages/PosPage';
import HousekeepingPage from './pages/HousekeepingPage';
import MaintenancePage from './pages/MaintenancePage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import UserManagementPage from './pages/UserManagementPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import { useAuth } from './contexts/AuthContext';
import { ROLES, canAccess, roleAccess } from './utils/roles';

const anyStaff = Object.values(ROLES);
const allowed = (feature, element) => <ProtectedRoute allow={roleAccess[feature]}>{element}</ProtectedRoute>;

function HomeRoute() {
  const { profile } = useAuth();

  if (canAccess(profile?.role, 'home')) return <HomePage />;

  return <Navigate to="/unauthorized" replace />;
}

export default function App() {
  return <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/unauthorized" element={<UnauthorizedPage />} />
    <Route element={<ProtectedRoute allow={anyStaff}><AppLayout /></ProtectedRoute>}>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/dashboard" element={allowed('dashboard', <DashboardPage />)} />
      <Route path="/rooms" element={<Navigate to="/master-settings" replace />} />
      <Route path="/master-settings" element={allowed('masterSettings', <MasterSettingsPage />)} />
      <Route path="/settings/rooms" element={<Navigate to="/master-settings" replace />} />
      <Route path="/guests" element={allowed('guests', <GuestsPage />)} />
      <Route path="/tamu" element={<Navigate to="/guests" replace />} />
      <Route path="/forecast" element={allowed('forecast', <ForecastPage />)} />
      <Route path="/front-office" element={allowed('frontOffice', <FrontOfficePage />)} />
      <Route path="/room-chart" element={allowed('roomChart', <RoomChartPage />)} />
      <Route path="/reservations" element={<Navigate to="/front-office" replace />} />
      <Route path="/checkin" element={<Navigate to="/front-office" replace />} />
      <Route path="/billing" element={allowed('billing', <BillingPage />)} />
      <Route path="/pos" element={allowed('pos', <PosPage />)} />
      <Route path="/housekeeping" element={allowed('housekeeping', <HousekeepingPage />)} />
      <Route path="/maintenance" element={allowed('maintenance', <MaintenancePage />)} />
      <Route path="/reports" element={allowed('reports', <ReportsPage />)} />
      <Route path="/users" element={allowed('users', <UserManagementPage />)} />
      <Route path="/settings" element={allowed('settings', <SettingsPage />)} />
    </Route>
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>;
}

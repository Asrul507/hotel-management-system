import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { canAccess } from '../utils/roles';

const menus = [
  ['/', 'Dashboard', 'dashboard'],
  ['/master-settings', 'Master Setting', 'masterSettings'],
  ['/guests', 'Tamu', 'guests'],
  ['/forecast', 'Forecast', 'forecast'],
  ['/reservations', 'Reservasi', 'reservations'],
  ['/checkin', 'Check-in/out', 'checkInOut'],
  ['/billing', 'Billing', 'billing'],
  ['/housekeeping', 'Housekeeping', 'housekeeping'],
  ['/maintenance', 'Maintenance', 'maintenance'],
  ['/reports', 'Reports', 'reports'],
  ['/settings', 'Settings', 'settings']
];

export default function AppLayout() {
  const { profile, signOut } = useAuth();
  const visibleMenus = menus.filter(([, , feature]) => canAccess(profile?.role, feature));

  return (
    <div className="shell">
      <aside className="sidebar">
        <h2>Hotel MS</h2>
        <small>{profile?.full_name} ({profile?.role})</small>
        {visibleMenus.map(([to, label]) => <Link key={to} to={to}>{label}</Link>)}
        <button onClick={signOut}>Logout</button>
      </aside>
      <main className="content"><Outlet /></main>
    </div>
  );
}

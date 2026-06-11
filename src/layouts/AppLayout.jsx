import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { canAccess } from '../utils/roles';
import { APP_BUILD_LABEL, APP_VERSION } from '../config/appVersion';

const menus = [
  ['/', 'Dashboard', 'dashboard'],
  ['/master-settings', 'Master Settings', 'masterSettings'],
  ['/guests', 'Guests', 'guests'],
  ['/forecast', 'Forecast', 'forecast'],
  ['/front-office', 'Front Office', 'frontOffice'],
  ['/billing', 'Billing / Folio', 'billing'],
  ['/housekeeping', 'Housekeeping', 'housekeeping'],
  ['/maintenance', 'Maintenance', 'maintenance'],
  ['/reports', 'Reports', 'reports'],
  ['/users', 'Users', 'users'],
  ['/settings', 'Settings', 'settings']
];

export default function AppLayout() {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const visibleMenus = menus.filter(([, , feature]) => canAccess(profile?.role, feature));

  return (
    <div className="shell">
      <aside className="sidebar">
        <h2>Hotel MS</h2>
        <div className="app-version" title={APP_BUILD_LABEL}>
          <strong>Hotel MS v{APP_VERSION}</strong>
          <span>{APP_BUILD_LABEL}</span>
        </div>
        <small>{profile?.full_name} ({profile?.role})</small>
        {visibleMenus.map(([to, label]) => <Link key={to} className={(location.pathname === to || (to === '/front-office' && ['/reservations', '/checkin'].includes(location.pathname))) ? 'active' : ''} to={to}>{label}</Link>)}
        <button onClick={signOut}>Logout</button>
      </aside>
      <main className="content"><Outlet /></main>
    </div>
  );
}

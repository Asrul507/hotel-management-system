import { Link, Outlet, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBroom, faChartLine, faChartPie, faConciergeBell, faFileInvoiceDollar, faGauge, faGear, faScrewdriverWrench, faUserGear, faUsers } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../contexts/AuthContext';
import { canAccess } from '../utils/roles';
import { APP_BUILD_LABEL, APP_VERSION } from '../config/appVersion';

const menus = [
  ['/', 'Dashboard', 'dashboard', faGauge],
  ['/master-settings', 'Master Settings', 'masterSettings', faGear],
  ['/guests', 'Guests', 'guests', faUsers],
  ['/forecast', 'Forecast', 'forecast', faChartLine],
  ['/front-office', 'Front Office', 'frontOffice', faConciergeBell],
  ['/billing', 'Billing / Folio', 'billing', faFileInvoiceDollar],
  ['/housekeeping', 'Housekeeping', 'housekeeping', faBroom],
  ['/maintenance', 'Maintenance', 'maintenance', faScrewdriverWrench],
  ['/reports', 'Reports', 'reports', faChartPie],
  ['/users', 'Users', 'users', faUserGear],
  ['/settings', 'Settings', 'settings', faGear]
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
        {visibleMenus.map(([to, label, , icon]) => <Link key={to} className={(location.pathname === to || (to === '/front-office' && ['/reservations', '/checkin'].includes(location.pathname))) ? 'active' : ''} to={to}><FontAwesomeIcon icon={icon} aria-hidden="true" /><span>{label}</span></Link>)}
        <button onClick={signOut}>Logout</button>
      </aside>
      <main className="content"><Outlet /></main>
    </div>
  );
}

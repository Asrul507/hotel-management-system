import { Link, Outlet, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faDoorOpen, faGear, faHouse } from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../contexts/AuthContext';
import { canAccess } from '../utils/roles';
import { APP_BUILD_LABEL, APP_VERSION } from '../config/appVersion';
import RowOverviewModal from '../components/RowOverviewModal';

const settingsMenus = [
  ['/master-settings', 'Room Configuration', 'masterSettings'],
  ['/master-settings', 'Room Type', 'masterSettings'],
  ['/settings', 'Hotel Settings', 'settings'],
  ['/users', 'User Management', 'users'],
  ['/settings', 'Profile', 'settings']
];

export default function AppLayout() {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const visibleSettings = settingsMenus.filter(([, , feature]) => canAccess(profile?.role, feature));

  return (
    <div className="pms-shell">
      <header className="pms-topbar">
        <Link className="brand-lockup" to="/" aria-label="Kembali ke Home Dashboard">
          <span className="brand-mark"><FontAwesomeIcon icon={faHouse} aria-hidden="true" /></span>
          <span><strong>Hotel MS</strong><small>v{APP_VERSION} · {APP_BUILD_LABEL}</small></span>
        </Link>
        <nav className="top-module-nav" aria-label="Navigasi modul utama">
          <Link className={location.pathname === '/' ? 'active' : ''} to="/">Home</Link>
          {canAccess(profile?.role, 'frontOffice') && <Link className={location.pathname === '/front-office' ? 'active' : ''} to="/front-office">Front Office</Link>}
          {canAccess(profile?.role, 'housekeeping') && <Link className={location.pathname === '/housekeeping' ? 'active' : ''} to="/housekeeping">Housekeeping</Link>}
          {canAccess(profile?.role, 'reports') && <Link className={location.pathname === '/reports' ? 'active' : ''} to="/reports">Report</Link>}
        </nav>
        <div className="topbar-actions">
          <small className="user-chip">{profile?.full_name} <span>{profile?.role}</span></small>
          {visibleSettings.length > 0 && <details className="settings-menu">
            <summary><FontAwesomeIcon icon={faGear} aria-hidden="true" />Settings<FontAwesomeIcon icon={faChevronDown} aria-hidden="true" /></summary>
            <div className="settings-popover">{visibleSettings.map(([to, label]) => <Link key={`${to}-${label}`} to={to}>{label}</Link>)}</div>
          </details>}
          <button className="logout-button" onClick={signOut}><FontAwesomeIcon icon={faDoorOpen} aria-hidden="true" />Logout</button>
        </div>
      </header>
      <main className="content pms-content"><Outlet /></main>
      <RowOverviewModal />
    </div>
  );
}

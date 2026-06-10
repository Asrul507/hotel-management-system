import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const menus = [
  ['/', 'Dashboard'], ['/rooms', 'Kamar'], ['/reservations', 'Reservasi'], ['/checkin', 'Check-in/out'], ['/billing', 'Billing'],
  ['/housekeeping', 'Housekeeping'], ['/maintenance', 'Maintenance'], ['/reports', 'Reports'], ['/settings', 'Settings']
];

export default function AppLayout() {
  const { profile, signOut } = useAuth();
  return (
    <div className="shell">
      <aside className="sidebar">
        <h2>Hotel MS</h2>
        <small>{profile?.full_name} ({profile?.role})</small>
        {menus.map(([to, label]) => <Link key={to} to={to}>{label}</Link>)}
        <button onClick={signOut}>Logout</button>
      </aside>
      <main className="content"><Outlet /></main>
    </div>
  );
}

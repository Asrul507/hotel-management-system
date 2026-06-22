import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBed,
  faBroom,
  faCalendarCheck,
  faChartLine,
  faClipboardList,
  faCreditCard,
  faGear,
  faHotel,
  faRightFromBracket,
  faRightToBracket,
  faScrewdriverWrench,
  faSliders,
  faUserGear,
  faUsers
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../contexts/AuthContext';
import { dashboardApi, roomsApi, today } from '../services/api';
import { canAccess } from '../utils/roles';

const summaryDefaults = { totalRooms: 0, occupied: 0, arrivalsToday: 0, departuresToday: 0 };
const safeCount = (value, loading) => loading ? '-' : Number(value || 0).toLocaleString('id-ID');

const menuItems = [
  { key: 'frontOffice', to: '/front-office', icon: faClipboardList, title: 'Front Office', description: 'Input reservasi, check-in, check-out, dan monitor aktivitas FO.' },
  { key: 'roomChart', to: '/room-chart', icon: faCalendarCheck, title: 'Room Chart', description: 'Lihat timeline kamar, arrival, departure, dan status occupancy.' },
  { key: 'housekeeping', to: '/housekeeping', icon: faBroom, title: 'Housekeeping', description: 'Update status kebersihan kamar dan pantau OOO/OOS.' },
  { key: 'pos', to: '/pos', icon: faCreditCard, title: 'POS / Billing', description: 'Kelola pembayaran, refund, settlement, dan transaksi folio.' },
  { key: 'guests', to: '/guests', icon: faUsers, title: 'Guests / Tamu', description: 'Kelola database tamu, identitas, kontak, dan catatan tamu.' },
  { key: 'reports', to: '/reports', icon: faChartLine, title: 'Reports', description: 'Pantau occupancy, revenue, payment, dan laporan operasional.' },
  { key: 'maintenance', to: '/maintenance', icon: faScrewdriverWrench, title: 'Maintenance', description: 'Catat dan tindak lanjuti laporan perbaikan kamar/fasilitas.' },
  { key: 'masterSettings', to: '/master-settings', icon: faSliders, title: 'Master Settings', description: 'Atur kamar, room type, harga dasar, dan konfigurasi master.' },
  { key: 'users', to: '/users', icon: faUserGear, title: 'User Management', description: 'Kelola profile pengguna, role, dan status akun internal.' },
  { key: 'settings', to: '/settings', icon: faGear, title: 'Settings', description: 'Atur preferensi aplikasi dan konfigurasi pendukung operasional.' }
];

export default function HomePage() {
  const { profile } = useAuth();
  const [stats, setStats] = useState(summaryDefaults);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([dashboardApi.stats(), roomsApi.list().catch(() => [])])
      .then(([nextStats, nextRooms]) => {
        if (!active) return;
        setStats(nextStats || summaryDefaults);
        setRooms(nextRooms || []);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const summaryCards = useMemo(() => {
    const totalRooms = rooms.length || stats.totalRooms || 0;
    const readyRooms = rooms.filter((room) => room.hk_status === 'VR').length;
    return [
      { label: 'Total Kamar', value: totalRooms, icon: faHotel, note: 'Semua kamar aktif di sistem' },
      { label: 'Ready / VR', value: readyRooms, icon: faBed, note: 'Kamar siap dijual' },
      { label: 'In House', value: stats.occupied, icon: faUsers, note: 'Tamu sedang menginap' },
      { label: 'Arrival Hari Ini', value: stats.arrivalsToday, icon: faRightToBracket, note: today() },
      { label: 'Departure Hari Ini', value: stats.departuresToday, icon: faRightFromBracket, note: today() }
    ];
  }, [rooms, stats]);

  const visibleMenus = useMemo(() => menuItems.filter((item) => canAccess(profile?.role, item.key)), [profile?.role]);

  return <div className="page-stack home-page">
    <section className="home-hero" aria-labelledby="home-title">
      <div className="home-hero-copy">
        <p className="eyebrow">Overview Hari Ini</p>
        <h1>Selamat datang, {profile?.full_name || 'Team Hotel'}</h1>
        <h2 id="home-title">Hotel Management System</h2>
        <p>Kelola operasional hotel dari reservasi, status kamar, billing, housekeeping, hingga laporan.</p>
      </div>
      <div className="home-hero-actions" aria-label="Aksi utama">
        {canAccess(profile?.role, 'frontOffice') && <Link className="button-link" to="/front-office">Input Reservasi</Link>}
        {canAccess(profile?.role, 'roomChart') && <Link className="button-link secondary-link" to="/room-chart">Lihat Room Chart</Link>}
      </div>
    </section>

    {error && <div className="alert error">{error}</div>}

    <section className="home-summary-grid" aria-label="Ringkasan operasional">
      {summaryCards.map((card) => <div className="home-summary-card" key={card.label}>
        <span className="home-summary-icon"><FontAwesomeIcon icon={card.icon} /></span>
        <div>
          <p>{card.label}</p>
          <strong>{safeCount(card.value, loading)}</strong>
          <small>{loading ? 'Memuat data...' : card.note}</small>
        </div>
      </div>)}
    </section>

    <section className="home-section" aria-labelledby="home-menu-title">
      <div className="section-heading">
        <p className="eyebrow">Menu Utama</p>
        <h2 id="home-menu-title">Shortcut Operasional</h2>
      </div>
      {visibleMenus.length === 0 ? <div className="card muted">Tidak ada menu yang tersedia untuk role Anda.</div> : <div className="home-menu-grid">
        {visibleMenus.map((item) => <Link className="home-menu-card" to={item.to} key={item.key}>
          <span className="home-menu-icon"><FontAwesomeIcon icon={item.icon} /></span>
          <span className="home-menu-content">
            <strong>{item.title}</strong>
            <small>{item.description}</small>
          </span>
          <span className="home-menu-cta">Buka Menu</span>
        </Link>)}
      </div>}
    </section>

    <section className="home-action-grid" aria-label="Operasional hari ini">
      <TodayPanel
        icon={faRightToBracket}
        title="Arrival Hari Ini"
        value={safeCount(stats.arrivalsToday, loading)}
        description="Reservasi yang dijadwalkan check-in hari ini."
        to="/front-office"
        canOpen={canAccess(profile?.role, 'frontOffice')}
      />
      <TodayPanel
        icon={faRightFromBracket}
        title="Departure Hari Ini"
        value={safeCount(stats.departuresToday, loading)}
        description="Tamu yang dijadwalkan check-out hari ini."
        to="/front-office"
        canOpen={canAccess(profile?.role, 'frontOffice')}
      />
    </section>
  </div>;
}

function TodayPanel({ icon, title, value, description, to, canOpen }) {
  return <article className="home-action-panel">
    <div className="home-action-icon"><FontAwesomeIcon icon={icon} /></div>
    <div className="home-action-copy">
      <p>{title}</p>
      <strong>{value}</strong>
      <small>{description}</small>
    </div>
    {canOpen && <Link className="button-link secondary-link" to={to}>Buka Menu</Link>}
  </article>;
}

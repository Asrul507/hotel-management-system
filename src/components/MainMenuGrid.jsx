import frontOfficeIllustration from '../assets/menu/front-office.svg';
import housekeepingIllustration from '../assets/menu/housekeeping.svg';
import reportIllustration from '../assets/menu/report.svg';
import MenuCard from './MenuCard';
import { canAccess } from '../utils/roles';

export default function MainMenuGrid({ role, stats }) {
  const modules = [
    {
      key: 'frontOffice',
      to: '/front-office',
      title: 'Front Office',
      image: frontOfficeIllustration,
      imageAlt: 'Ilustrasi meja resepsionis hotel',
      stats: [['Arrival', stats.arrivalsToday], ['Departure', stats.departuresToday], ['In House', stats.occupied]]
    },
    {
      key: 'housekeeping',
      to: '/housekeeping',
      title: 'Housekeeping',
      image: housekeepingIllustration,
      imageAlt: 'Ilustrasi kamar hotel bersih dan troli housekeeping',
      stats: [['VR', stats.vrRooms], ['VD', stats.vdRooms], ['OOO', stats.oooRooms]]
    },
    {
      key: 'reports',
      to: '/reports',
      title: 'Report',
      image: reportIllustration,
      imageAlt: 'Ilustrasi dashboard laporan hotel',
      stats: [['OCC', `${stats.occupancyPercentage}%`], ['REV', stats.revenueShort]]
    },
    {
      key: 'pos',
      to: '/pos',
      title: 'P.O.S / Kasir',
      image: reportIllustration,
      imageAlt: 'Ilustrasi kasir dan settlement hotel',
      stats: [['Payment', stats.revenueShort], ['Status', 'Settlement']]
    }
  ];

  const visibleModules = modules.filter((module) => canAccess(role, module.key));

  return <section className="main-menu-section" aria-labelledby="main-menu-title">
    <div className="section-heading">
      <p className="eyebrow">Main Menu</p>
      <h2 id="main-menu-title">Pilih Modul Operasional</h2>
    </div>
    <div className="main-menu-grid">{visibleModules.map((module) => <MenuCard key={module.key} {...module} />)}</div>
  </section>;
}

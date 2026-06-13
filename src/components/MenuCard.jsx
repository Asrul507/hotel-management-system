import { Link } from 'react-router-dom';

export default function MenuCard({ to, title, image, imageAlt, stats }) {
  return <Link className="menu-card" to={to} aria-label={`Buka modul ${title}`}>
    <div className="menu-card-visual"><img src={image} alt={imageAlt} /></div>
    <div className="menu-card-body">
      <h2>{title}</h2>
      <dl>{stats.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </div>
  </Link>;
}

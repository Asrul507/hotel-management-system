import { Link, useLocation } from 'react-router-dom';

const frontOfficeTabs = [
  ['/front-office', 'Expected Arrival'],
  ['/front-office', 'Expected Departure'],
  ['/front-office', 'Arrival'],
  ['/front-office', 'Departure'],
  ['/front-office', 'In House'],
  ['/billing', 'Folio'],
  ['/guests', 'Guest Database']
];

const reportTabs = [
  ['/reports', 'Dashboard'],
  ['/forecast', 'Forecast'],
  ['/reports', 'Occupancy'],
  ['/reports', 'Revenue'],
  ['/reports', 'Payment'],
  ['/reports', 'Arrival/Departure']
];

export function FrontOfficeSubnav({ activeLabel = '' }) {
  return <ModuleSubnav label="Front Office sub menu" tabs={frontOfficeTabs} activeLabel={activeLabel} />;
}

export function ReportSubnav({ activeLabel = '' }) {
  return <ModuleSubnav label="Report sub menu" tabs={reportTabs} activeLabel={activeLabel} />;
}

function ModuleSubnav({ label, tabs, activeLabel }) {
  const location = useLocation();
  return <nav className="card action-toolbar module-tabs stable-subnav" aria-label={label}>
    {tabs.map(([to, title]) => {
      const active = activeLabel ? title === activeLabel : location.pathname === to;
      return <Link key={`${to}-${title}`} className={active ? 'action-pill active' : 'action-pill'} to={to}>{title}</Link>;
    })}
  </nav>;
}

import { useEffect, useMemo, useState } from 'react';

const interactiveSelector = 'button,a,input,select,textarea,label,summary,[role="button"],[data-row-action="true"]';
const textOf = (node) => String(node?.innerText || node?.textContent || '').replace(/\s+/g, ' ').trim();

function collectRowOverview(row) {
  const table = row.closest('table');
  const headers = Array.from(table?.querySelectorAll('thead th') || []).map(textOf);
  const cells = Array.from(row.children || []).filter((cell) => ['TD', 'TH'].includes(cell.tagName));
  const fields = cells.map((cell, index) => ({
    label: headers[index] || `Field ${index + 1}`,
    value: textOf(cell) || '-'
  })).filter((field) => field.label && !['aksi', 'action', 'actions'].includes(field.label.toLowerCase()));
  const title = fields.find((field) => field.value && field.value !== '-')?.value || 'Row Overview';
  const tableTitle = table?.closest('.table-card')?.querySelector('h2')?.textContent?.trim() || 'Data Detail';
  return { title, tableTitle, fields };
}

export default function RowOverviewModal() {
  const [overview, setOverview] = useState(null);

  useEffect(() => {
    function handleClick(event) {
      if (event.defaultPrevented || event.target.closest(interactiveSelector)) return;
      const row = event.target.closest('tbody tr');
      if (!row || row.dataset.disableOverview === 'true') return;
      const fields = collectRowOverview(row);
      if (fields.fields.length === 0) return;
      setOverview(fields);
    }

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  useEffect(() => {
    if (!overview) return undefined;
    function handleKeydown(event) {
      if (event.key === 'Escape') setOverview(null);
    }
    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [overview]);

  const fields = useMemo(() => overview?.fields || [], [overview]);
  if (!overview) return null;

  return <div className="modal-backdrop row-overview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOverview(null); }}>
    <section className="modal-card row-overview-modal" role="dialog" aria-modal="true" aria-labelledby="row-overview-title">
      <div className="modal-header">
        <div><p className="eyebrow">{overview.tableTitle}</p><h2 id="row-overview-title">{overview.title}</h2></div>
        <button type="button" className="modal-close" aria-label="Tutup overview" onClick={() => setOverview(null)}>×</button>
      </div>
      <div className="overview-field-grid">{fields.map((field, index) => <div key={`${field.label}-${index}`} className="overview-field"><span>{field.label}</span><strong>{field.value || '-'}</strong></div>)}</div>
      <div className="modal-footer"><button type="button" className="secondary" onClick={() => setOverview(null)}>Close</button></div>
    </section>
  </div>;
}

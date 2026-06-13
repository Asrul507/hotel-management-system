import { useEffect, useMemo, useState } from 'react';

const triggerClass = 'row-overview-trigger';
const textOf = (node) => {
  const clone = node?.cloneNode?.(true);
  clone?.querySelectorAll?.(`.${triggerClass}, button, a, input, select, textarea, label, summary, [role="button"], [data-row-action="true"]`).forEach((item) => item.remove());
  return String(clone?.innerText || clone?.textContent || '').replace(/\s+/g, ' ').trim();
};

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

function ensureOverviewButtons(root = document) {
  root.querySelectorAll?.('tbody tr').forEach((row) => {
    if (row.dataset.disableOverview === 'true' || row.querySelector(`.${triggerClass}`)) return;
    const firstCell = row.querySelector('td,th');
    if (!firstCell) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = triggerClass;
    button.title = 'Lihat detail / overview';
    button.setAttribute('aria-label', 'Lihat detail / overview baris');
    button.setAttribute('data-row-action', 'true');
    button.textContent = '⋮';
    firstCell.prepend(button);
    row.classList.add('has-row-overview-action');
  });
}

export default function RowOverviewModal() {
  const [overview, setOverview] = useState(null);

  useEffect(() => {
    ensureOverviewButtons();
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) ensureOverviewButtons(node);
      }));
    });
    observer.observe(document.body, { childList: true, subtree: true });

    function handleClick(event) {
      const trigger = event.target.closest(`.${triggerClass}`);
      if (!trigger) return;
      event.preventDefault();
      event.stopPropagation();
      const row = trigger.closest('tr');
      if (!row) return;
      const fields = collectRowOverview(row);
      if (fields.fields.length === 0) return;
      setOverview(fields);
    }

    document.addEventListener('click', handleClick, true);
    return () => {
      observer.disconnect();
      document.removeEventListener('click', handleClick, true);
    };
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

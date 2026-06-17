const CLOSE_STATUSES = ['close', 'closed', 'paid', 'settled', 'lunas', 'done'];
const PARTIAL_STATUSES = ['partial', 'partially_paid'];
const DEBT_STATUSES = ['debt', 'ledger', 'outstanding'];
const OPEN_STATUSES = ['open', 'unpaid', 'partial_refund'];

export function normalizePOSStatus(status = '') {
  const value = String(status || '').toLowerCase();
  if (CLOSE_STATUSES.includes(value) || value.includes('close') || value.includes('paid') || value.includes('settled')) return 'Close';
  if (PARTIAL_STATUSES.includes(value)) return 'Partial';
  if (DEBT_STATUSES.includes(value)) return 'Debt';
  if (OPEN_STATUSES.includes(value)) return 'Open';
  return 'Open';
}

export function isOpenStatus(status = '') {
  return ['Open', 'Partial', 'Debt'].includes(normalizePOSStatus(status));
}

export function isCloseStatus(status = '') {
  return normalizePOSStatus(status) === 'Close';
}

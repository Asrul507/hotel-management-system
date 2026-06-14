const CLOSE_STATUSES = ['close', 'closed', 'paid', 'settled', 'lunas'];
const OPEN_STATUSES = ['open', 'unpaid', 'partial', 'debt', 'outstanding', 'partial_refund'];

export function normalizePOSStatus(status = '') {
  const value = String(status || '').toLowerCase();
  if (CLOSE_STATUSES.includes(value)) return 'Close';
  if (OPEN_STATUSES.includes(value)) return 'Open';
  return value.includes('close') || value.includes('paid') || value.includes('settled') ? 'Close' : 'Open';
}

export function isOpenStatus(status = '') {
  return normalizePOSStatus(status) === 'Open';
}

export function isCloseStatus(status = '') {
  return normalizePOSStatus(status) === 'Close';
}

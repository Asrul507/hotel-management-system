export function getBillingStatus(folio) {
  const grandTotal = Number(folio?.grand_total || 0);
  const paidAmount = Number(folio?.paid_amount || 0);
  const balanceDue = Number(folio?.balance_due || 0);
  const status = folio?.status;

  if (status === 'debt') return 'debt';
  if (status === 'refunded') return 'refunded';
  if (grandTotal <= 0) return 'unpaid';
  if (balanceDue <= 0 || paidAmount >= grandTotal) return 'paid';
  if (paidAmount > 0 && balanceDue > 0) return 'partial';
  return 'unpaid';
}

export function getBillingStatusLabel(folio) {
  return getBillingStatus(folio).toUpperCase();
}

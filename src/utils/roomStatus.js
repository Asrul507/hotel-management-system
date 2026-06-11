export const FO_STATUSES = ['available', 'unavailable'];
export const VACANT_HK_STATUSES = ['VR', 'VD', 'VC', 'OOO'];
export const OCCUPIED_HK_STATUSES = ['OR', 'OD', 'OC', 'OOO'];
export const OUT_OF_SERVICE_HK_STATUSES = ['OOS'];
export const OUT_OF_INVENTORY_HK_STATUSES = ['OOO', 'OOS'];
export const READY_FOR_RESERVATION_HK_STATUSES = ['VR'];
export const HK_STATUSES = ['VR', 'VD', 'VC', 'OR', 'OD', 'OC', 'OOO', 'OOS'];

const PRIVILEGED_ROLES = ['super_admin', 'manager'];

export function isPrivilegedRoomRole(role) {
  return PRIVILEGED_ROLES.includes(role);
}

export function isVacantStatus(hkStatus) {
  return ['VR', 'VD', 'VC'].includes(hkStatus);
}

export function isOccupiedStatus(hkStatus) {
  return ['OR', 'OD', 'OC'].includes(hkStatus);
}

export function isOutOfInventoryStatus(hkStatus) {
  return OUT_OF_INVENTORY_HK_STATUSES.includes(hkStatus);
}

export function isReadyForReservation(room) {
  return room?.is_active !== false
    && room?.fo_status === 'available'
    && room?.hk_status === 'VR';
}

export function deriveFoStatusFromHkStatus(hkStatus, previousFoStatus = 'available') {
  if (OUT_OF_INVENTORY_HK_STATUSES.includes(hkStatus)) return 'unavailable';
  if (isVacantStatus(hkStatus) || isOccupiedStatus(hkStatus)) return 'available';
  return FO_STATUSES.includes(previousFoStatus) ? previousFoStatus : 'available';
}

export function roomStatusGroup(hkStatus) {
  if (isVacantStatus(hkStatus)) return 'vacant';
  if (isOccupiedStatus(hkStatus)) return 'occupied';
  if (isOutOfInventoryStatus(hkStatus)) return 'out_of_inventory';
  return 'vacant';
}

export function allowedNextHkStatuses(room = {}, role = '') {
  if (['cashier', 'receptionist'].includes(role)) return [];

  const hkStatus = room.hk_status || 'VC';
  const group = roomStatusGroup(hkStatus);
  const privileged = isPrivilegedRoomRole(role);

  if (!privileged) {
    if (group === 'vacant') return ['VR', 'VD', 'VC'];
    if (group === 'occupied') return ['OR', 'OD', 'OC'];
    return [];
  }

  if (group === 'occupied') return ['OR', 'OD', 'OC', 'OOO', 'OOS'];
  if (group === 'out_of_inventory') return ['VR', 'VD', 'VC', 'OOO', 'OOS'];
  return ['VR', 'VD', 'VC', 'OOO', 'OOS'];
}

export function canTransitionHkStatus(room = {}, nextHkStatus, role = '', { allowGroupChange = false, hasCheckedInStay = false } = {}) {
  if (!HK_STATUSES.includes(nextHkStatus)) return false;
  if (allowGroupChange) return true;
  const allowed = allowedNextHkStatuses(room, role);
  if (allowed.includes(nextHkStatus)) return true;
  if (isPrivilegedRoomRole(role) && isOutOfInventoryStatus(room.hk_status) && isOccupiedStatus(nextHkStatus) && hasCheckedInStay) return true;
  return false;
}

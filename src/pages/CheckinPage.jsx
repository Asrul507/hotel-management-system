import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { calculateStayBilling, foliosApi, reservationsApi, roomsApi, staysApi } from '../services/api';
import { getBillingStatus, getBillingStatusLabel } from '../utils/billingStatus';

const money = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

export default function CheckinPage() {
  const { profile } = useAuth();
  const [arrivals, setArrivals] = useState([]);
  const [activeStays, setActiveStays] = useState([]);
  const [roomChoices, setRoomChoices] = useState({});
  const [moveChoices, setMoveChoices] = useState([]);
  const [selectedRooms, setSelectedRooms] = useState({});
  const [moveForm, setMoveForm] = useState({ stay: null, newRoomId: '', reason: '' });
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState('');
  const [error, setError] = useState('');

  const canMoveRoom = ['super_admin', 'manager', 'receptionist'].includes(profile?.role);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [arrivalData, stayData, folioData] = await Promise.all([reservationsApi.arrivals(), staysApi.active(), foliosApi.list().catch(() => [])]);
      const staysWithFolios = stayData.map((stay) => ({
        ...stay,
        folios: folioData.find((folio) => folio.id === (stay.folio_id || stay.reservations?.folio_id)) || stay.folios
      }));
      setArrivals(arrivalData);
      setActiveStays(staysWithFolios);
      const choices = {};
      await Promise.all(arrivalData.map(async (reservation) => {
        choices[reservation.id] = await roomsApi.availableForStay({ check_in_date: reservation.check_in_date, check_out_date: reservation.check_out_date, room_type_id: reservation.room_type_id, exclude_reservation_id: reservation.id });
      }));
      setRoomChoices(choices);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const run = async (id, action, confirmText = '') => {
    if (confirmText && !window.confirm(confirmText)) return;
    setProcessing(id);
    setError('');
    try {
      await action();
      setMoveForm({ stay: null, newRoomId: '', reason: '' });
      setMoveChoices([]);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing('');
    }
  };

  const openMoveRoom = async (stay) => {
    setProcessing(`move-load-${stay.id}`);
    setError('');
    try {
      const choices = await roomsApi.availableForStay({
        check_in_date: stay.reservations?.check_in_date || stay.checkin_at?.slice(0, 10),
        check_out_date: stay.reservations?.check_out_date,
        exclude_reservation_id: stay.reservation_id || ''
      });
      setMoveChoices(choices.filter((room) => room.id !== stay.room_id));
      setMoveForm({ stay, newRoomId: '', reason: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing('');
    }
  };

  const submitMoveRoom = (event) => {
    event.preventDefault();
    const stay = moveForm.stay;
    const targetRoom = moveChoices.find((room) => room.id === moveForm.newRoomId);
    if (!stay || !targetRoom) return setError('Pilih kamar baru untuk room move.');
    const differentType = targetRoom.room_type_id !== stay.rooms?.room_type_id;
    const warning = differentType ? '\nPERINGATAN: tipe kamar berbeda dari kamar lama.' : '';
    run(`move-${stay.id}`, () => staysApi.moveRoom(stay, moveForm.newRoomId, moveForm.reason, profile?.role), `Pindahkan ${stay.guests?.full_name} dari kamar ${stay.rooms?.room_number} ke ${targetRoom.room_number}?${warning}`);
  };

  return <div className="page-stack">
    <div className="page-header"><div><h1>Check-in / Check-out</h1><p>Check-in membuat stay in-house dan HK menjadi OC; check-out membuat invoice dan HK menjadi VD. Receptionist/manager/super admin dapat melakukan pindah kamar untuk tamu in-house.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    {moveForm.stay && <form className="card form-grid" onSubmit={submitMoveRoom}>
      <h2>🏨 Pindah Kamar</h2>
      <label>Tamu<input value={moveForm.stay.guests?.full_name || ''} disabled /></label>
      <label>Kamar saat ini<input value={`${moveForm.stay.rooms?.room_number || '-'} · ${moveForm.stay.rooms?.room_types?.name || '-'}`} disabled /></label>
      <label>Kamar baru<select required value={moveForm.newRoomId} onChange={(e) => setMoveForm({ ...moveForm, newRoomId: e.target.value })}><option value="">Pilih kamar ready</option>{moveChoices.map((room) => <option key={room.id} value={room.id}>{room.room_number} - {room.hk_status} - {room.room_types?.name}{room.room_type_id !== moveForm.stay.rooms?.room_type_id ? ' (beda tipe)' : ''}</option>)}</select></label>
      <label className="full">Alasan pindah kamar<textarea required value={moveForm.reason} onChange={(e) => setMoveForm({ ...moveForm, reason: e.target.value })} placeholder="Contoh: tamu minta pindah karena AC bermasalah" /></label>
      {moveForm.newRoomId && moveChoices.find((room) => room.id === moveForm.newRoomId)?.room_type_id !== moveForm.stay.rooms?.room_type_id && <div className="alert full">Warning: kamar baru berbeda room type. Pastikan rate/approval sudah sesuai.</div>}
      <div className="button-row full"><button disabled={processing === `move-${moveForm.stay.id}`}>Submit Pindah Kamar</button><button type="button" className="secondary" onClick={() => setMoveForm({ stay: null, newRoomId: '', reason: '' })}>Batal</button></div>
    </form>}
    <div className="two-column">
      <div className="card table-card"><h2>Arrival Hari Ini</h2>{loading ? <p>Memuat arrival...</p> : arrivals.length === 0 ? <p className="muted">Tidak ada arrival hari ini.</p> : <table><thead><tr><th>Tamu</th><th>Kamar</th><th>Reservasi</th><th>Warning</th><th>Aksi</th></tr></thead><tbody>{arrivals.map((reservation) => {
        const choices = roomChoices[reservation.id] || [];
        const selected = selectedRooms[reservation.id] || reservation.room_id || '';
        return <tr key={reservation.id}><td>{reservation.guests?.full_name}{reservation.guests?.is_blacklisted && <><br /><span className="badge cancelled">Blacklist</span></>}</td><td>{reservation.room_id ? reservation.rooms?.room_number : <select required value={selected} onChange={(e) => setSelectedRooms({ ...selectedRooms, [reservation.id]: e.target.value })}><option value="">Pilih kamar</option>{choices.map((room) => <option key={room.id} value={room.id}>{room.room_number} - {room.hk_status}</option>)}</select>}<br /><small>{reservation.room_types?.name}</small></td><td>{reservation.reservation_code}<br /><small>{reservation.check_in_date} → {reservation.check_out_date}</small></td><td>{reservation.guests?.is_blacklisted ? 'Perlu approval manager.' : choices.length === 0 && !reservation.room_id ? 'Tidak ada kamar eligible.' : '-'}</td><td><button className="small" disabled={processing === reservation.id || !selected} onClick={() => run(reservation.id, () => staysApi.checkIn(reservation, selected), `Check-in ${reservation.guests?.full_name}?`)}>Check-in</button></td></tr>;
      })}</tbody></table>}</div>
      <div className="card table-card"><h2>Tamu In-house</h2>{loading ? <p>Memuat stay...</p> : activeStays.length === 0 ? <p className="muted">Belum ada tamu in-house.</p> : <table><thead><tr><th>Tamu</th><th>Kamar</th><th>Check-in</th><th>Expected Out</th><th>Billing</th><th>Aksi</th></tr></thead><tbody>{activeStays.map((stay) => {
        const legacyBilling = calculateStayBilling(stay);
        const folio = stay.folios || stay.reservations?.folios;
        const billingStatus = folio ? getBillingStatus(folio) : legacyBilling.paymentStatus;
        const balanceDue = folio ? Number(folio.balance_due || 0) : legacyBilling.balance;
        return <tr key={stay.id}><td>{stay.guests?.full_name}</td><td>{stay.rooms?.room_number}<br /><small>{stay.rooms?.hk_status}</small></td><td>{stay.checkin_at?.slice(0, 16).replace('T', ' ')}</td><td>{stay.reservations?.check_out_date || '-'}</td><td><span className={`badge ${billingStatus}`}>{folio ? getBillingStatusLabel(folio) : billingStatus.toUpperCase()}</span><br /><small>{folio?.folio_number ? `${folio.folio_number} · ` : ''}{money.format(balanceDue)} due</small></td><td><div className="table-actions compact-actions"><button className="small" disabled={processing === stay.id} onClick={() => run(stay.id, () => staysApi.checkOut(stay), `Check-out ${stay.guests?.full_name}? Folio akan ditutup jika belum closed.`)}>Check-out</button>{canMoveRoom && <button className="icon-button" title="Pindah Kamar" aria-label="Pindah Kamar" disabled={processing === `move-load-${stay.id}`} onClick={() => openMoveRoom(stay)}>🏨</button>}</div></td></tr>;
      })}</tbody></table>}</div>
    </div>
  </div>;
}

import { useEffect, useState } from 'react';
import { maintenanceApi, roomsApi } from '../services/api';

export default function MaintenancePage() {
  const [reports, setReports] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [form, setForm] = useState({ room_id: '', issue: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [reportData, roomData] = await Promise.all([maintenanceApi.list(), roomsApi.list()]);
      setReports(reportData);
      setRooms(roomData);
      if (!form.room_id && roomData[0]) setForm((current) => ({ ...current, room_id: roomData[0].id }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await maintenanceApi.create(form);
      setForm({ room_id: rooms[0]?.id || '', issue: '' });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const done = async (report) => {
    setSaving(true);
    setError('');
    try {
      await maintenanceApi.updateStatus(report, 'done', 'Selesai diperbaiki');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return <div className="page-stack">
    <div className="page-header"><div><h1>Maintenance</h1><p>Catat kerusakan kamar dan tandai selesai setelah diperbaiki.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    <div className="two-column">
      <form className="card form-grid" onSubmit={submit}><h2>Laporan Baru</h2><label>Kamar<select required value={form.room_id} onChange={(e) => setForm({ ...form, room_id: e.target.value })}>{rooms.map((room) => <option key={room.id} value={room.id}>{room.room_number} - {room.room_types?.name}</option>)}</select></label><label className="full">Masalah<textarea required value={form.issue} onChange={(e) => setForm({ ...form, issue: e.target.value })} /></label><button disabled={saving}>{saving ? 'Menyimpan...' : 'Buat Laporan'}</button></form>
      <div className="card table-card"><h2>Daftar Laporan</h2>{loading ? <p>Memuat maintenance...</p> : <table><thead><tr><th>Kamar</th><th>Masalah</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{reports.map((report) => <tr key={report.id}><td>{report.rooms?.room_number}</td><td>{report.issue}<br /><small>{report.fix_notes}</small></td><td><span className={`badge ${report.status}`}>{report.status}</span></td><td>{report.status !== 'done' && <button className="small" disabled={saving} onClick={() => done(report)}>Tandai Selesai</button>}</td></tr>)}</tbody></table>}</div>
    </div>
  </div>;
}

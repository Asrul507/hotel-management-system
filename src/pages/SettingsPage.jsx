import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { settingsApi } from '../services/api';

export default function SettingsPage() {
  const { profile, session } = useAuth();
  const [hotel, setHotel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        setHotel(await settingsApi.hotel());
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return <div className="page-stack">
    <div className="page-header"><div><h1>Settings</h1><p>Informasi akun aktif dan konfigurasi dasar hotel.</p></div></div>
    {error && <div className="alert error">{error}</div>}
    <div className="two-column">
      <div className="card detail-list"><h2>Profile User</h2><p><strong>Nama:</strong> {profile?.full_name || '-'}</p><p><strong>Email:</strong> {session?.user?.email || '-'}</p><p><strong>Role:</strong> <span className="badge">{profile?.role || '-'}</span></p><p><strong>Status:</strong> {profile?.is_active ? 'Aktif' : 'Tidak aktif'}</p></div>
      <div className="card detail-list"><h2>Hotel</h2>{loading ? <p>Memuat setting...</p> : <><p><strong>Nama hotel:</strong> {hotel?.hotel_name || '-'}</p><p><strong>Alamat:</strong> {hotel?.address || '-'}</p><p><strong>Telepon:</strong> {hotel?.phone || '-'}</p><p><strong>Pajak:</strong> {hotel?.tax_percent ?? 0}% ({hotel?.tax_mode === 'inclusive' ? 'Inclusive Tax' : 'Exclusive Tax'})</p><p><strong>Service charge:</strong> {hotel?.service_charge_percent ?? 0}%</p><p><strong>Prefix invoice:</strong> {hotel?.invoice_prefix || 'INV'}</p></>}</div>
    </div>
  </div>;
}

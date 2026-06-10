import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function UnauthorizedPage() {
  const { profile } = useAuth();
  return <div className="page-stack">
    <div className="card">
      <h1>Akses Ditolak</h1>
      <p>Role <strong>{profile?.role || 'tidak diketahui'}</strong> tidak memiliki izin untuk membuka halaman ini.</p>
      <Link to="/">Kembali ke Dashboard</Link>
    </div>
  </div>;
}

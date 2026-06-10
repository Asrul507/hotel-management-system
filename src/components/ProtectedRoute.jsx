import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ children, allow }) {
  const { session, profile, loading, authError } = useAuth();

  if (loading) return <div className="center">Loading session...</div>;
  if (authError) return <div className="center error">Auth error: {authError}</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile) return <div className="center error">Profile akun belum ditemukan. Hubungi admin untuk membuat profile dan role.</div>;
  if (allow && !allow.includes(profile.role)) return <Navigate to="/unauthorized" replace />;

  return children;
}

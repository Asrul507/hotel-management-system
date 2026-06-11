import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import ConfigError from './ConfigError';

export default function ProtectedRoute({ children, allow }) {
  const { session, profile, loading, authError, profileError, configError, retryAuth, retryProfile } = useAuth();

  if (configError) return <ConfigError message={configError} />;
  if (loading) return <div className="center">Loading session...</div>;
  if (authError) return <div className="center error"><p>Auth error: {authError}</p><button onClick={retryAuth}>Coba lagi</button></div>;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile) return <div className="center error"><p>{profileError || 'Profile akun belum ditemukan. Hubungi admin untuk membuat profile dan role.'}</p><button onClick={retryProfile}>Coba lagi</button></div>;
  if (allow && !allow.includes(profile.role)) return <Navigate to="/unauthorized" replace />;

  return children;
}

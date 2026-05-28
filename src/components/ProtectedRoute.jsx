import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function ProtectedRoute({ children, allow }) {
  const { session, profile, loading } = useAuth();
  if (loading) return <div className="center">Loading session...</div>;
  if (!session) return <Navigate to="/login" replace />;
  if (allow && !allow.includes(profile?.role)) return <Navigate to="/unauthorized" replace />;
  return children;
}

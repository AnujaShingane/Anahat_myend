import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Guards a route by both authentication AND role. Falls back to the plain
// "logged in?" check that ProtectedRoute already does, then additionally
// verifies the authenticated user's role is in `allow`.
export default function RoleProtectedRoute({ allow, children }) {
  const { isAuthenticated, role, booting } = useAuth();

  if (booting) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allow && allow.length > 0 && !allow.includes(role)) {
    const fallback = role === 'therapist' ? '/therapist' : role === 'admin' ? '/admin' : '/dashboard';
    return <Navigate to={fallback} replace />;
  }

  return children;
}

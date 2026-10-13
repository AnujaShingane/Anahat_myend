import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Auth is a session cookie now, not a localStorage token — whether the user
// is logged in is only known after the initial GET /api/auth/me call
// resolves (AuthContext's `booting` flag), so this waits for that instead of
// flash-redirecting a genuinely-logged-in user back to /login on refresh.
export default function ProtectedRoute({ children }) {
    const { isAuthenticated, booting } = useAuth();
    const location = useLocation();

    if (booting) return null;

    if (!isAuthenticated) {
        return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
    }

    return children;
}

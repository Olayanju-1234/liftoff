import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import Layout from './Layout';
import Landing from '../pages/Landing';

// Signed-out visitors get the landing page at "/" and the login page everywhere else.
export default function ProtectedRoute() {
    const { isAuthenticated } = useAuth();
    const location = useLocation();

    if (!isAuthenticated) {
        if (location.pathname === '/') return <Landing />;
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return <Layout />;
}

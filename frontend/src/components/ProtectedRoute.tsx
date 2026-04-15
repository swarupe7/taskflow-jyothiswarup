// ProtectedRoute — wraps any route that requires authentication.
// If the user is not logged in, redirects to /login.
// This is the React Router v6 equivalent of Express auth middleware.
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Navbar } from './Navbar';

export function ProtectedRoute() {
  const { isAuthenticated } = useAuth();

  // Redirect unauthenticated users to login (preserving intended destination)
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Render the protected layout: Navbar + the matched child route (Outlet)
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Outlet />
      </main>
    </div>
  );
}

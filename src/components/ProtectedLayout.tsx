import { Navigate, Outlet } from 'react-router-dom';
import { useAuth, type UserRole } from '@/contexts/AuthContext';
import { FullPageSpinner } from '@/components/ui/spinner';

interface ProtectedLayoutProps {
  requiredRole: UserRole;
}

export default function ProtectedLayout({ requiredRole }: ProtectedLayoutProps) {
  const { user, role, isLoading } = useAuth();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Role mismatch — redirect to correct portal
  if (role === 'admin' && requiredRole === 'customer') {
    return <Navigate to="/admin" replace />;
  }
  if (role === 'customer' && requiredRole === 'admin') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

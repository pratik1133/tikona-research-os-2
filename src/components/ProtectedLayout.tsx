import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { FullPageSpinner } from '@/components/ui/spinner';

export default function ProtectedLayout() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

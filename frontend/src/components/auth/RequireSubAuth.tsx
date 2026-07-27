import { Navigate } from 'react-router-dom';
import { getAuthHeader } from '../../api/authStorage';

export function RequireSubAuth({ children }: { children: React.ReactNode }) {
  if (!getAuthHeader('sub')) return <Navigate to="/sub-portal/login" replace />;
  return <>{children}</>;
}

import { Navigate } from 'react-router-dom';
import { getAuthHeader } from '../../api/authStorage';

export function RequireComplianceAuth({ children }: { children: React.ReactNode }) {
  if (!getAuthHeader('compliance')) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

import { Routes, Route } from 'react-router-dom';
import { Navbar } from './components/layout/Navbar';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { SubcontractorDetailPage } from './pages/SubcontractorDetailPage';
import { MissingDocumentsPage } from './pages/MissingDocumentsPage';
import { LoginPage } from './pages/LoginPage';
import { SubLoginPage } from './pages/sub-portal/SubLoginPage';
import { SubPortalPage } from './pages/sub-portal/SubPortalPage';
import { RequireComplianceAuth } from './components/auth/RequireComplianceAuth';
import { RequireSubAuth } from './components/auth/RequireSubAuth';

function ComplianceApp() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
        <Route path="/subcontractors/:subId" element={<SubcontractorDetailPage />} />
        <Route path="/missing-documents" element={<MissingDocumentsPage />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/sub-portal/login" element={<SubLoginPage />} />
      <Route
        path="/sub-portal"
        element={
          <RequireSubAuth>
            <SubPortalPage />
          </RequireSubAuth>
        }
      />
      <Route
        path="/*"
        element={
          <RequireComplianceAuth>
            <ComplianceApp />
          </RequireComplianceAuth>
        }
      />
    </Routes>
  );
}

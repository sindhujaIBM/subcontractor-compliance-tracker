import { Routes, Route } from 'react-router-dom';
import { Navbar } from './components/layout/Navbar';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { SubcontractorDetailPage } from './pages/SubcontractorDetailPage';
import { MissingDocumentsPage } from './pages/MissingDocumentsPage';

export default function App() {
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

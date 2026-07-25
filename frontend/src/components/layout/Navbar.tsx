import { Link, useLocation } from 'react-router-dom';

const LINKS = [
  { to: '/', label: 'Dashboard' },
  { to: '/missing-documents', label: 'Missing Documents' },
];

export function Navbar() {
  const location = useLocation();
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="text-lg font-semibold text-brand-700">
          Subcontractor Compliance Tracker
        </Link>
        <nav className="flex gap-4">
          {LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className={`text-sm font-medium ${
                location.pathname === link.to ? 'text-brand-600' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

import { Link, useLocation } from 'react-router-dom';
import { clearCredentials, getUsername } from '../../api/authStorage';

const LINKS = [
  { to: '/', label: 'Dashboard' },
  { to: '/missing-documents', label: 'Missing Documents' },
];

export function Navbar() {
  const location = useLocation();
  const username = getUsername('compliance');
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link to="/" className="text-lg font-semibold text-brand-700">
          Subcontractor Compliance Tracker
        </Link>
        <nav className="flex items-center gap-4">
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
          <span className="text-xs text-slate-400">{username}</span>
          <button
            className="text-sm text-slate-500 hover:text-slate-800"
            onClick={() => {
              clearCredentials('compliance');
              window.location.href = '/login';
            }}
          >
            Sign out
          </button>
        </nav>
      </div>
    </header>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { tryComplianceLogin } from '../api/client';
import { saveCredentials } from '../api/authStorage';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const ok = await tryComplianceLogin(username, password);
    setBusy(false);
    if (!ok) {
      setError('Invalid username or password.');
      return;
    }
    saveCredentials('compliance', username, password);
    navigate('/');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <form onSubmit={submit} className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-lg font-semibold text-slate-900">Compliance Manager Login</h1>
        <p className="mb-4 text-sm text-slate-500">Subcontractor Compliance Tracker</p>
        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-slate-600">Username</span>
          <input
            className="w-full rounded border border-slate-300 px-3 py-2"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
        </label>
        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-slate-600">Password</span>
          <input
            type="password"
            className="w-full rounded border border-slate-300 px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="mb-3 text-sm text-status-red">{error}</p>}
        <button disabled={busy} className="w-full rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="mt-4 text-center text-xs text-slate-400">
          A subcontractor? <a href="/sub-portal/login" className="text-brand-600 hover:underline">Sign in here</a>
        </p>
      </form>
    </div>
  );
}

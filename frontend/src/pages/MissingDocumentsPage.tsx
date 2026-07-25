import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type MissingDocEntry } from '../api/client';
import { PageShell } from '../components/layout/PageShell';

const URGENCY_LABEL: Record<number, string> = {
  5: 'Suspended',
  4: 'Payment withheld',
  3: 'Final reminder sent',
  2: 'Follow-up reminder sent',
  1: 'First reminder sent',
};

export function MissingDocumentsPage() {
  const [entries, setEntries] = useState<MissingDocEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.listMissingDocuments().then((e) => {
      setEntries(e);
      setLoading(false);
    });
  }, []);

  if (loading) return <PageShell title="Missing Documents">Loading…</PageShell>;

  return (
    <PageShell title="Missing Documents" subtitle="Every open compliance gap across every project, sorted by urgency.">
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-4 py-2">Subcontractor</th>
              <th className="px-4 py-2">Project</th>
              <th className="px-4 py-2">Reason</th>
              <th className="px-4 py-2">Urgency</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={`${e.subId}-${e.projectId ?? 'onboarding'}-${i}`} className="border-b border-slate-100">
                <td className="px-4 py-3">
                  <Link to={`/subcontractors/${e.subId}`} className="font-medium text-slate-800 hover:text-brand-600">
                    {e.subName}
                  </Link>
                  <span className="ml-2 text-xs text-slate-400">{e.trade}</span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {e.projectId ? (
                    <Link to={`/projects/${e.projectId}`} className="hover:text-brand-600">
                      {e.projectName}
                    </Link>
                  ) : (
                    <span className="text-slate-400">Onboarding</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">{e.reason}</td>
                <td className="px-4 py-3">
                  <span className="text-xs font-medium text-slate-500">{URGENCY_LABEL[e.urgency] ?? e.urgency}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    to={e.projectId ? `/projects/${e.projectId}` : `/subcontractors/${e.subId}`}
                    className="text-sm font-medium text-brand-600 hover:underline"
                  >
                    Take action →
                  </Link>
                </td>
              </tr>
            ))}
            {entries.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-400" colSpan={5}>
                  Nothing outstanding — every subcontractor is compliant.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}

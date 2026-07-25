import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { StatusPill } from '../components/subs/StatusPill';
import { PageShell } from '../components/layout/PageShell';
import { HumanActionButton } from '../components/actions/HumanActionButton';

interface SubDetail {
  subcontractor: {
    subId: string;
    name: string;
    trade: string;
    contactEmail: string;
    contactName: string;
    onboardingStatus: string;
    onboardingCascadeStage?: string;
    suspended: boolean;
    suspendedReason?: string;
    color: 'green' | 'yellow' | 'red';
  };
  documents: Array<{ SK: string; docType: string; submittedAt: string; status: string; expiresAt?: string; rejectionReason?: string }>;
  actionLog: Array<{ SK: string; timestamp: string; actor: string; actorName?: string; action: string; detail?: string; reason?: string }>;
  projects: Array<{ projectId: string; mobilizedDate: string; suspended: boolean; paymentWithheld: boolean; lateCount: number; missingCount: number }>;
}

export function SubcontractorDetailPage() {
  const { subId } = useParams<{ subId: string }>();
  const [data, setData] = useState<SubDetail | null>(null);
  const [loading, setLoading] = useState(true);

  async function reload() {
    if (!subId) return;
    const d = await api.getSubcontractor(subId);
    setData(d);
    setLoading(false);
  }

  useEffect(() => {
    reload();
  }, [subId]);

  if (loading || !data) return <PageShell title="Subcontractor">Loading…</PageShell>;

  const { subcontractor: s, documents, actionLog, projects } = data;

  return (
    <PageShell title={s.name} subtitle={`${s.trade} · ${s.contactName} · ${s.contactEmail}`}>
      <div className="space-y-6">
        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-3">
            <StatusPill color={s.color} />
            <span className="text-sm text-slate-500">
              Onboarding: {s.onboardingStatus}
              {s.onboardingCascadeStage && ` (stage: ${s.onboardingCascadeStage})`}
            </span>
          </div>
          <div className="flex gap-2">
            {!s.suspended && (
              <HumanActionButton
                label="Suspend Onboarding"
                variant="danger"
                requiresReason
                onConfirm={async ({ reason, actorName }) => {
                  await api.suspendSubOnboarding(s.subId, reason!, actorName);
                  await reload();
                }}
              />
            )}
            {s.suspended && (
              <HumanActionButton
                label="Reinstate"
                variant="neutral"
                requiresReason={false}
                onConfirm={async ({ actorName }) => {
                  await api.reinstateSubOnboarding(s.subId, actorName);
                  await reload();
                }}
              />
            )}
            <button
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              onClick={async () => {
                await api.runSubCascadeCheck(s.subId);
                await reload();
              }}
            >
              Run cascade check
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">COI / W-9 History</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="pb-2">Doc</th>
                <th className="pb-2">Submitted</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((d) => (
                <tr key={d.SK} className="border-t border-slate-100">
                  <td className="py-2 font-medium">{d.docType}</td>
                  <td className="py-2 text-slate-500">{new Date(d.submittedAt).toLocaleDateString()}</td>
                  <td className="py-2">{d.status}</td>
                  <td className="py-2 text-slate-500">{d.rejectionReason ?? (d.expiresAt ? `Expires ${new Date(d.expiresAt).toLocaleDateString()}` : '')}</td>
                </tr>
              ))}
              {documents.length === 0 && (
                <tr>
                  <td className="py-2 text-slate-400" colSpan={4}>
                    No submissions yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {projects.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-700">Projects</h3>
            <ul className="space-y-1 text-sm">
              {projects.map((p) => (
                <li key={p.projectId}>
                  <Link to={`/projects/${p.projectId}`} className="text-brand-700 hover:underline">
                    {p.projectId}
                  </Link>
                  <span className="ml-2 text-slate-500">
                    mobilized {new Date(p.mobilizedDate).toLocaleDateString()} · late {p.lateCount} · missing {p.missingCount}
                    {p.paymentWithheld && ' · payment withheld'}
                    {p.suspended && ' · suspended'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Activity</h3>
          <ul className="space-y-2 text-sm">
            {actionLog.map((a) => (
              <li key={a.SK} className="border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
                <span className="text-xs text-slate-400">{new Date(a.timestamp).toLocaleString()}</span>{' '}
                <span className={`text-xs font-medium ${a.actor === 'human' ? 'text-brand-600' : 'text-slate-400'}`}>
                  [{a.actor === 'human' ? a.actorName ?? 'human' : 'AI'}]
                </span>{' '}
                <span className="text-slate-700">{a.action.replace(/_/g, ' ')}</span>
                {(a.detail || a.reason) && <p className="text-slate-500">{a.detail ?? a.reason}</p>}
              </li>
            ))}
            {actionLog.length === 0 && <li className="text-slate-400">No activity yet.</li>}
          </ul>
        </div>
      </div>
    </PageShell>
  );
}

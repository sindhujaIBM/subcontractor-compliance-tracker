import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { StatusPill } from '../components/subs/StatusPill';
import { PageShell } from '../components/layout/PageShell';
import { HumanActionButton } from '../components/actions/HumanActionButton';
import { DocumentHistoryTable, type HistoryDoc } from '../components/subs/DocumentHistoryTable';

const STAGE_LABEL: Record<string, string> = {
  reminderEarly: 'Early reminder sent',
  reminderEndOfDay: 'Due-date reminder sent',
  finalCheck: 'In final check window',
  escalated: 'Escalated — awaiting decision',
};

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
  topIssue: string | null;
  documents: HistoryDoc[];
  actionLog: Array<{ SK: string; timestamp: string; actor: string; actorName?: string; action: string; detail?: string; reason?: string }>;
  projects: Array<{
    projectId: string;
    mobilizedDate: string;
    suspended: boolean;
    suspendedReason?: string;
    paymentWithheld: boolean;
    paymentWithheldReason?: string;
    payrollCascadeStage?: string;
    workforceCascadeStage?: string;
    lateCount: number;
    missingCount: number;
    color: 'green' | 'yellow' | 'red';
    documents: HistoryDoc[];
  }>;
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

  const { subcontractor: s, topIssue, documents, actionLog, projects } = data;

  return (
    <PageShell title={s.name} subtitle={`${s.trade} · ${s.contactName} · ${s.contactEmail}`}>
      <div className="space-y-6">
        {topIssue && (
          <div
            className={`rounded-lg border p-4 text-sm font-medium ${
              s.color === 'red' ? 'border-status-red bg-status-redBg text-status-red' : 'border-status-yellow bg-status-yellowBg text-status-yellow'
            }`}
          >
            {topIssue}
          </div>
        )}

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
          <DocumentHistoryTable documents={documents} getViewUrl={(key) => api.getDocumentViewUrl(s.subId, key)} />
        </div>

        {projects.length > 0 && (
          <div className="space-y-4">
            {projects.map((p) => (
              <div key={p.projectId} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-700">
                    <Link to={`/projects/${p.projectId}`} className="text-brand-700 hover:underline">
                      {p.projectId}
                    </Link>
                  </h3>
                  <StatusPill color={p.color} />
                </div>
                <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span>Mobilized {p.mobilizedDate ? new Date(p.mobilizedDate).toLocaleDateString() : '—'}</span>
                  <span>Late {p.lateCount}</span>
                  <span>Missing {p.missingCount}</span>
                  {p.payrollCascadeStage && <span>Payroll: {STAGE_LABEL[p.payrollCascadeStage]}</span>}
                  {p.workforceCascadeStage && <span>Workforce report: {STAGE_LABEL[p.workforceCascadeStage]}</span>}
                  {p.paymentWithheld && <span className="font-medium text-status-yellow">Payment withheld{p.paymentWithheldReason && ` — ${p.paymentWithheldReason}`}</span>}
                  {p.suspended && <span className="font-medium text-status-red">Suspended{p.suspendedReason && ` — ${p.suspendedReason}`}</span>}
                </div>
                <DocumentHistoryTable documents={p.documents} getViewUrl={(key) => api.getDocumentViewUrl(s.subId, key)} />
              </div>
            ))}
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

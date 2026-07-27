import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type Assignment, type ProjectSummary } from '../api/client';
import { StatusPill } from '../components/subs/StatusPill';
import { PageShell } from '../components/layout/PageShell';
import { HumanActionButton } from '../components/actions/HumanActionButton';
import { Toast, type ToastTone } from '../components/actions/Toast';

const STAGE_LABEL: Record<string, string> = {
  reminderEarly: 'Early reminder sent',
  reminderEndOfDay: 'Due-date reminder sent',
  finalCheck: 'In final check window',
  escalated: 'Escalated — awaiting decision',
};

function describeCascadeLeg(label: string, result: { action: string; emailSentTo?: string }): string | null {
  if (result.action === 'reminder') return `${label} reminder sent to ${result.emailSentTo}`;
  if (result.action === 'escalate') return `${label} escalated — awaiting a human decision`;
  return null;
}

export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(null);

  async function reload() {
    if (!projectId) return;
    const { project, assignments } = await api.getProjectStatus(projectId);
    setProject(project);
    setAssignments(assignments);
    setLoading(false);
  }

  useEffect(() => {
    reload();
  }, [projectId]);

  if (loading || !project) return <PageShell title="Project">Loading…</PageShell>;

  const today = new Date();
  const weekEnding = today.toISOString().slice(0, 10);
  const month = today.toISOString().slice(0, 7);

  async function runCascadeCheck(subId: string, subName: string) {
    if (!project) return;
    const payroll = await api.runProjectCascadeCheck(project.projectId, subId, { docType: 'PAYROLL', period: weekEnding, dueDate: weekEnding });
    const workforce = await api.runProjectCascadeCheck(project.projectId, subId, { docType: 'WORKFORCE', period: month, dueDate: `${month}-05` });
    await reload();

    const parts = [describeCascadeLeg('Payroll', payroll), describeCascadeLeg('Workforce', workforce)].filter((p): p is string => Boolean(p));
    const tone: ToastTone = [payroll, workforce].some((r) => r.action === 'reminder')
      ? 'success'
      : [payroll, workforce].some((r) => r.action === 'escalate')
        ? 'warning'
        : 'neutral';
    setToast({ message: parts.length ? `${subName} — ${parts.join(' · ')}` : `${subName} — no action needed right now`, tone });
  }

  return (
    <PageShell title={project.name} subtitle={project.address}>
      <div className="space-y-4">
        {toast && <Toast message={toast.message} tone={toast.tone} onDismiss={() => setToast(null)} />}
        {assignments.map((a) => {
          const suspendEligible = a.lateCount >= 5 || a.missingCount >= 3;
          return (
            <div key={a.subId} className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between">
                <div>
                  <Link to={`/subcontractors/${a.subId}`} className="font-semibold text-slate-800 hover:text-brand-600">
                    {a.subName}
                  </Link>
                  <p className="text-xs text-slate-400">{a.subTrade}</p>
                </div>
                <StatusPill color={a.color} />
              </div>

              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
                <span>Late submissions: {a.lateCount}</span>
                <span>Missing submissions: {a.missingCount}</span>
                {a.payrollCascadeStage && <span>Payroll: {STAGE_LABEL[a.payrollCascadeStage]}</span>}
                {a.workforceCascadeStage && <span>Workforce report: {STAGE_LABEL[a.workforceCascadeStage]}</span>}
                {a.paymentWithheld && <span className="font-medium text-status-yellow">Payment withheld — {a.paymentWithheldReason}</span>}
                {a.suspended && <span className="font-medium text-status-red">Suspended — {a.suspendedReason}</span>}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {!a.suspended && !a.paymentWithheld && (
                  <HumanActionButton
                    label="Withhold Payment"
                    variant="warning"
                    requiresReason
                    onConfirm={async ({ reason, actorName }) => {
                      await api.withholdPayment(project.projectId, a.subId, reason!, actorName);
                      await reload();
                    }}
                  />
                )}
                {a.paymentWithheld && (
                  <HumanActionButton
                    label="Release Payment"
                    variant="neutral"
                    requiresReason={false}
                    onConfirm={async ({ actorName }) => {
                      await api.releasePayment(project.projectId, a.subId, actorName);
                      await reload();
                    }}
                  />
                )}
                {!a.suspended && (
                  <HumanActionButton
                    label={suspendEligible ? 'Suspend (recommended)' : 'Suspend'}
                    variant="danger"
                    requiresReason
                    onConfirm={async ({ reason, actorName }) => {
                      await api.suspendSubcontractor(project.projectId, a.subId, reason!, actorName);
                      await reload();
                    }}
                  />
                )}
                {a.suspended && (
                  <HumanActionButton
                    label="Reinstate"
                    variant="neutral"
                    requiresReason={false}
                    onConfirm={async ({ actorName }) => {
                      await api.reinstateSubcontractor(project.projectId, a.subId, actorName);
                      await reload();
                    }}
                  />
                )}
                <button
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                  onClick={() => runCascadeCheck(a.subId, a.subName)}
                >
                  Run cascade check
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </PageShell>
  );
}

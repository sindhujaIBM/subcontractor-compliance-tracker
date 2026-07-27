import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type Assignment, type ProjectSummary, type SubcontractorSummary } from '../api/client';
import { StatusPill } from '../components/subs/StatusPill';
import { DocRequirementsPanel } from '../components/subs/DocRequirementsPanel';
import { PageShell } from '../components/layout/PageShell';

interface ProjectGroup {
  project: ProjectSummary;
  assignments: Assignment[];
}

export function DashboardPage() {
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [unassigned, setUnassigned] = useState<SubcontractorSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [projects, subs] = await Promise.all([api.listProjects(), api.listSubcontractors()]);
      const statuses = await Promise.all(projects.map((p) => api.getProjectStatus(p.projectId)));
      const grouped = projects.map((project, i) => ({ project, assignments: statuses[i].assignments }));
      const assignedSubIds = new Set(grouped.flatMap((g) => g.assignments.map((a) => a.subId)));
      setGroups(grouped);
      setUnassigned(subs.filter((s) => !assignedSubIds.has(s.subId)));
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <PageShell title="Compliance Dashboard">Loading…</PageShell>;

  return (
    <PageShell title="Compliance Dashboard" subtitle="Every subcontractor, across every active project, in one place.">
      <div className="space-y-8">
        <DocRequirementsPanel />

        {groups.map(({ project, assignments }) => (
          <div key={project.projectId} className="rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <Link to={`/projects/${project.projectId}`} className="font-semibold text-brand-700 hover:underline">
                {project.name}
              </Link>
              <span className="text-xs text-slate-400">{project.address}</span>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.subId} className="border-t border-slate-100">
                    <td className="px-4 py-2">
                      <Link to={`/subcontractors/${a.subId}`} className="font-medium text-slate-800 hover:text-brand-600">
                        {a.subName}
                      </Link>
                      <span className="ml-2 text-xs text-slate-400">{a.subTrade}</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <StatusPill color={a.color} />
                      {a.paymentWithheld && <span className="ml-2 text-xs font-medium text-status-yellow">Payment withheld</span>}
                    </td>
                  </tr>
                ))}
                {assignments.length === 0 && (
                  <tr>
                    <td className="px-4 py-3 text-sm text-slate-400">No subcontractors assigned yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ))}

        {unassigned.length > 0 && (
          <div className="rounded-lg border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-4 py-3 font-semibold text-slate-700">Onboarding (not yet assigned to a project)</div>
            <table className="w-full text-sm">
              <tbody>
                {unassigned.map((s) => (
                  <tr key={s.subId} className="border-t border-slate-100">
                    <td className="px-4 py-2">
                      <Link to={`/subcontractors/${s.subId}`} className="font-medium text-slate-800 hover:text-brand-600">
                        {s.name}
                      </Link>
                      <span className="ml-2 text-xs text-slate-400">{s.trade}</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <StatusPill color={s.color} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageShell>
  );
}

import { useEffect, useState } from 'react';
import { subPortalApi, type SubPortalDocument, type SubPortalProject } from '../../api/subPortalClient';
import { getUsername, clearCredentials } from '../../api/authStorage';
import { StatusPill } from '../../components/subs/StatusPill';
import { DocUploadButton } from '../../components/subs/DocUploadButton';

interface Profile {
  subcontractor: { subId: string; name: string; trade: string; onboardingStatus: string; suspended: boolean; color: 'green' | 'yellow' | 'red' };
  documents: SubPortalDocument[];
  projects: SubPortalProject[];
}

export function SubPortalPage() {
  const [data, setData] = useState<Profile | null>(null);
  const subId = getUsername('sub')!;

  async function reload() {
    const d = await subPortalApi.getProfile(subId);
    setData(d as Profile);
  }

  useEffect(() => {
    reload();
  }, []);

  if (!data) return <div className="p-8">Loading…</div>;
  const { subcontractor: s, documents, projects } = data;

  async function uploadOnboardingDoc(docType: 'COI' | 'W9', file: File) {
    const { uploadUrl } = await subPortalApi.requestUploadUrl(s.subId, docType, file.name, file.type || 'application/pdf');
    await subPortalApi.uploadToS3(uploadUrl, file);
  }

  async function uploadProjectDoc(projectId: string, docType: 'PAYROLL' | 'WORKFORCE', period: string, dueDate: string, file: File) {
    const { uploadUrl } = await subPortalApi.requestProjectUploadUrl(s.subId, projectId, docType, {
      period,
      dueDate,
      filename: file.name,
      contentType: file.type || 'application/pdf',
    });
    await subPortalApi.uploadToS3(uploadUrl, file);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">{s.name}</h1>
            <p className="text-xs text-slate-500">{s.trade}</p>
          </div>
          <button
            className="text-sm text-slate-500 hover:text-slate-800"
            onClick={() => {
              clearCredentials('sub');
              window.location.href = '/sub-portal/login';
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <StatusPill color={s.color} />
            <span className="text-sm text-slate-500">Onboarding: {s.onboardingStatus}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <DocUploadButton label="Upload Insurance Certificate (COI)" onUpload={(f) => uploadOnboardingDoc('COI', f)} />
            <DocUploadButton label="Upload W-9" onUpload={(f) => uploadOnboardingDoc('W9', f)} />
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Your Submission History</h3>
          <table className="w-full text-sm">
            <tbody>
              {documents.map((d) => (
                <tr key={d.SK} className="border-t border-slate-100">
                  <td className="py-2 font-medium">{d.docType}</td>
                  <td className="py-2 text-slate-500">{new Date(d.submittedAt).toLocaleDateString()}</td>
                  <td className="py-2">{d.status}</td>
                  <td className="py-2 text-slate-500">{d.rejectionReason}</td>
                </tr>
              ))}
              {documents.length === 0 && (
                <tr>
                  <td className="py-2 text-slate-400" colSpan={4}>
                    Nothing submitted yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {projects.map((p) => {
          const today = new Date();
          const weekEnding = today.toISOString().slice(0, 10);
          const month = today.toISOString().slice(0, 7);
          return (
            <div key={p.projectId} className="rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">Project: {p.projectId}</h3>
              <p className="mb-3 text-xs text-slate-500">
                Late submissions: {p.lateCount} · Missing submissions: {p.missingCount}
                {p.paymentWithheld && ' · Payment withheld'}
                {p.suspended && ' · Suspended'}
              </p>
              <div className="flex flex-wrap gap-2">
                <DocUploadButton
                  label="Upload Certified Payroll Report"
                  onUpload={(f) => uploadProjectDoc(p.projectId, 'PAYROLL', weekEnding, weekEnding, f)}
                />
                <DocUploadButton
                  label="Upload Monthly Workforce Report"
                  onUpload={(f) => uploadProjectDoc(p.projectId, 'WORKFORCE', month, `${month}-05`, f)}
                />
              </div>
            </div>
          );
        })}

        <button className="text-sm text-brand-600 hover:underline" onClick={reload}>
          Refresh status
        </button>
      </div>
    </div>
  );
}

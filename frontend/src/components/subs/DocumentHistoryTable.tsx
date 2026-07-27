import { useState } from 'react';

export interface HistoryDoc {
  SK: string;
  docType: string;
  submittedAt: string;
  status: string;
  expiresAt?: string;
  rejectionReason?: string;
  sourceKey?: string;
  period?: string;
  late?: boolean;
}

function analysisMessage(doc: HistoryDoc): string {
  if (doc.status === 'valid') return 'Everything looks good.';
  if (doc.status === 'invalid') return doc.rejectionReason ?? 'Did not pass validation.';
  return 'Not yet submitted.';
}

/**
 * Shared between the sub portal and the compliance manager's subcontractor
 * detail page — same table, same "what did the AI find" framing, so the
 * two views never describe the same submission differently.
 */
export function DocumentHistoryTable({ documents, getViewUrl }: { documents: HistoryDoc[]; getViewUrl: (key: string) => Promise<string> }) {
  const [opening, setOpening] = useState<string | null>(null);

  async function openDocument(key: string) {
    setOpening(key);
    try {
      const url = await getViewUrl(key);
      window.open(url, '_blank', 'noopener,noreferrer');
    } finally {
      setOpening(null);
    }
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
          <th className="pb-2">Doc</th>
          <th className="pb-2">Submitted</th>
          <th className="pb-2">AI Analysis</th>
          <th className="pb-2" />
        </tr>
      </thead>
      <tbody>
        {documents.map((d) => (
          <tr key={d.SK} className="border-t border-slate-100">
            <td className="py-2 font-medium">{d.docType}</td>
            <td className="py-2 text-slate-500">{d.submittedAt ? new Date(d.submittedAt).toLocaleDateString() : '—'}</td>
            <td className={`py-2 ${d.status === 'valid' ? 'text-status-green' : d.status === 'invalid' ? 'text-status-red' : 'text-slate-400'}`}>
              {analysisMessage(d)}
            </td>
            <td className="py-2 text-right">
              {d.sourceKey && (
                <button
                  className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
                  disabled={opening === d.sourceKey}
                  onClick={() => openDocument(d.sourceKey!)}
                >
                  {opening === d.sourceKey ? 'Opening…' : 'View document'}
                </button>
              )}
            </td>
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
  );
}

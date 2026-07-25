import { useState } from 'react';

/**
 * Every consequential action (withhold/release payment, suspend/reinstate)
 * goes through this component — it always requires an explicit confirm step,
 * and for reason-requiring actions, a typed reason. This is the UI half of
 * "AI recommends, a human decides": nothing here fires automatically, and
 * every click is attributable to a named person.
 */
export function HumanActionButton({
  label,
  variant,
  requiresReason,
  onConfirm,
}: {
  label: string;
  variant: 'danger' | 'warning' | 'neutral';
  requiresReason: boolean;
  onConfirm: (params: { reason?: string; actorName: string }) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [actorName, setActorName] = useState('Compliance Manager');
  const [busy, setBusy] = useState(false);

  const styles: Record<string, string> = {
    danger: 'bg-status-red text-white hover:bg-red-800',
    warning: 'bg-status-yellow text-white hover:bg-amber-800',
    neutral: 'bg-slate-600 text-white hover:bg-slate-700',
  };

  if (!open) {
    return (
      <button className={`rounded-md px-3 py-1.5 text-sm font-medium ${styles[variant]}`} onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-sm font-medium text-slate-700">Confirm: {label}</p>
      <label className="mb-2 block text-xs text-slate-500">
        Acting as
        <input
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
          value={actorName}
          onChange={(e) => setActorName(e.target.value)}
        />
      </label>
      {requiresReason && (
        <label className="mb-2 block text-xs text-slate-500">
          Reason
          <textarea
            className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why this decision, in your own words"
          />
        </label>
      )}
      <div className="flex gap-2">
        <button
          disabled={busy || (requiresReason && !reason.trim())}
          className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${styles[variant]}`}
          onClick={async () => {
            setBusy(true);
            try {
              await onConfirm({ reason: requiresReason ? reason : undefined, actorName });
              setOpen(false);
              setReason('');
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Submitting…' : `Confirm ${label}`}
        </button>
        <button className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

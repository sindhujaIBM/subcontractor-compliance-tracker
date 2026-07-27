import { useRef, useState } from 'react';

type Stage = 'idle' | 'uploading' | 'done' | 'error';

/**
 * Upload -> S3 -> (async) processUploadedDocument reads it via Bedrock and
 * writes the result a few minutes later. This button only confirms the
 * upload itself landed — it doesn't wait for or report the AI analysis,
 * since there's no webhook back to the browser for that step. The actual
 * pass/fail result shows up in the submission history table below once
 * it's ready.
 */
export function DocUploadButton({ label, onUpload }: { label: string; onUpload: (file: File) => Promise<void> }) {
  const [stage, setStage] = useState<Stage>('idle');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setStage('uploading');
    try {
      await onUpload(file);
      setStage('done');
    } catch {
      setStage('error');
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      <button
        className="rounded-md border border-brand-300 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-50"
        disabled={stage === 'uploading'}
        onClick={() => inputRef.current?.click()}
      >
        {label}
      </button>
      {stage === 'uploading' && <span className="text-xs text-slate-400">Uploading…</span>}
      {stage === 'done' && <span className="text-xs text-status-green">Uploaded successfully — check back in a few minutes for the analysis report</span>}
      {stage === 'error' && <span className="text-xs text-status-red">Upload failed — try again</span>}
    </div>
  );
}

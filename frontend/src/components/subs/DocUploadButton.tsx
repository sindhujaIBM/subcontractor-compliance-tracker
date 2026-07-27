import { useRef, useState } from 'react';

type Stage = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

/**
 * Upload -> S3 -> (async) processUploadedDocument reads it via Bedrock and
 * writes the result. There's no webhook back to the browser for that last
 * step, so after a successful upload this just tells the user to refresh
 * in a few seconds rather than pretending to know the outcome instantly.
 */
export function DocUploadButton({ label, onUpload }: { label: string; onUpload: (file: File) => Promise<void> }) {
  const [stage, setStage] = useState<Stage>('idle');
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setStage('uploading');
    try {
      await onUpload(file);
      setStage('processing');
      setTimeout(() => setStage('done'), 4000);
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
        disabled={stage === 'uploading' || stage === 'processing'}
        onClick={() => inputRef.current?.click()}
      >
        {label}
      </button>
      {stage === 'uploading' && <span className="text-xs text-slate-400">Uploading…</span>}
      {stage === 'processing' && <span className="text-xs text-status-yellow">AI is reading the document…</span>}
      {stage === 'done' && <span className="text-xs text-status-green">Submitted — refresh to see the result</span>}
      {stage === 'error' && <span className="text-xs text-status-red">Upload failed — try again</span>}
    </div>
  );
}

import { useEffect } from 'react';

export type ToastTone = 'success' | 'warning' | 'neutral';

const TONE_STYLES: Record<ToastTone, string> = {
  success: 'border-status-green bg-status-greenBg text-status-green',
  warning: 'border-status-yellow bg-status-yellowBg text-status-yellow',
  neutral: 'border-slate-300 bg-slate-50 text-slate-600',
};

export function Toast({ message, tone, onDismiss }: { message: string; tone: ToastTone; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <div className={`flex items-center justify-between rounded-lg border p-3 text-sm font-medium ${TONE_STYLES[tone]}`}>
      <span>{message}</span>
      <button onClick={onDismiss} className="ml-3 text-xs opacity-60 hover:opacity-100">
        Dismiss
      </button>
    </div>
  );
}

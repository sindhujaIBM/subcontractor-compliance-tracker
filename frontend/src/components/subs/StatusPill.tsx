const STYLES: Record<'green' | 'yellow' | 'red', string> = {
  green: 'bg-status-greenBg text-status-green',
  yellow: 'bg-status-yellowBg text-status-yellow',
  red: 'bg-status-redBg text-status-red',
};

const LABELS: Record<'green' | 'yellow' | 'red', string> = {
  green: 'Compliant',
  yellow: 'Needs attention',
  red: 'Suspended',
};

export function StatusPill({ color, label }: { color: 'green' | 'yellow' | 'red'; label?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[color]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label ?? LABELS[color]}
    </span>
  );
}

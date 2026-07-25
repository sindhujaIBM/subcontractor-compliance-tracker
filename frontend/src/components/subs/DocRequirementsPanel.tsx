/**
 * Static reference panel — the 4 required document types and their cadence
 * are fixed domain knowledge in this prototype, not user-editable config.
 */
const REQUIREMENTS = [
  { name: 'Insurance Certificate (COI)', phase: 'Onboarding', cadence: 'Yearly renewal' },
  { name: 'W-9', phase: 'Onboarding', cadence: 'Once per vendor relationship' },
  { name: 'Certified Payroll Report', phase: 'Project in progress', cadence: 'Weekly' },
  { name: 'Monthly Workforce Report', phase: 'Project in progress', cadence: 'Monthly' },
];

export function DocRequirementsPanel() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">Document Requirements</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="pb-2">Document</th>
            <th className="pb-2">Phase</th>
            <th className="pb-2">Cadence</th>
          </tr>
        </thead>
        <tbody>
          {REQUIREMENTS.map((r) => (
            <tr key={r.name} className="border-t border-slate-100">
              <td className="py-2 font-medium text-slate-800">{r.name}</td>
              <td className="py-2 text-slate-500">{r.phase}</td>
              <td className="py-2 text-slate-500">{r.cadence}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

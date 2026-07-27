/**
 * Shared between the manual-entry endpoints (submitSubDocument /
 * submitProjectDocument) and the real S3-upload path
 * (processUploadedDocument) so both ways a document can arrive are judged
 * by the exact same rules — the AI-extraction path doesn't get its own,
 * possibly-diverging notion of "valid."
 */
export function validateOnboardingDoc(docType: 'COI' | 'W9', fields: Record<string, unknown>): { valid: boolean; reason?: string } {
  if (docType === 'COI') {
    const coverageLimit = Number(fields.coverageLimit ?? 0);
    const expiresAt = fields.expiresAt ? new Date(String(fields.expiresAt)) : null;
    if (coverageLimit < 1_000_000) return { valid: false, reason: 'Coverage limit below the required $1M minimum' };
    if (!expiresAt || isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
      return { valid: false, reason: 'Certificate is expired or missing an expiration date' };
    }
    return { valid: true };
  }
  const taxId = String(fields.taxId ?? '');
  if (!/^\d{2}-?\d{7}$/.test(taxId)) return { valid: false, reason: 'Tax ID is missing or not a valid EIN format' };
  return { valid: true };
}

export function validateRecurringDoc(docType: 'PAYROLL' | 'WORKFORCE', fields: Record<string, unknown>): { valid: boolean; reason?: string } {
  if (docType === 'PAYROLL') {
    if (!fields.totalHours || Number(fields.totalHours) <= 0) return { valid: false, reason: 'No hours reported' };
    return { valid: true };
  }
  if (fields.participationPercent === undefined) return { valid: false, reason: 'Missing participation percentage' };
  return { valid: true };
}

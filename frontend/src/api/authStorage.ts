/**
 * Two independent Basic Auth identities can be logged in in the same
 * browser at once — the compliance manager and a subcontractor are
 * different personas with different storage keys, so one login never
 * leaks into the other's requests.
 */
export type AuthRole = 'compliance' | 'sub';

function storageKey(role: AuthRole) {
  return `compliance-tracker:${role}-auth`;
}

export function saveCredentials(role: AuthRole, username: string, password: string) {
  sessionStorage.setItem(storageKey(role), btoa(`${username}:${password}`));
}

export function getAuthHeader(role: AuthRole): string | null {
  const encoded = sessionStorage.getItem(storageKey(role));
  return encoded ? `Basic ${encoded}` : null;
}

export function getUsername(role: AuthRole): string | null {
  const encoded = sessionStorage.getItem(storageKey(role));
  if (!encoded) return null;
  return atob(encoded).split(':')[0];
}

export function clearCredentials(role: AuthRole) {
  sessionStorage.removeItem(storageKey(role));
}

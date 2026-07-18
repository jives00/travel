/** Non-crypto session token for Places autocomplete billing grouping —
 * `crypto.randomUUID` only exists in secure contexts (HTTPS or localhost),
 * and this app is served over plain HTTP via Tailscale. Uniqueness, not
 * secrecy, is all that's needed. */
export function sessionToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

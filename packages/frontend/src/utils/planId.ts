/**
 * Short plan ids (AD-16): 12 characters from the base58 alphabet, which omits
 * the look-alikes 0, O, I and l. ~70 bits of randomness — unguessable, but not a
 * security boundary (access is enforced by space membership). Generated on the
 * device so drafts get their id (and address) before they reach the server.
 */
export const PLAN_ID_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export const PLAN_ID_LENGTH = 12;

const PLAN_ID_RE = /^[1-9A-HJ-NP-Za-km-z]{12}$/;

/** A fresh plan id. Rejection sampling keeps every character equally likely. */
export function generatePlanId(): string {
  let id = '';
  const bytes = new Uint8Array(32);
  while (id.length < PLAN_ID_LENGTH) {
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      const v = byte & 63; // 6 bits: 0..63
      if (v < PLAN_ID_ALPHABET.length) {
        id += PLAN_ID_ALPHABET[v];
        if (id.length === PLAN_ID_LENGTH) break;
      }
    }
  }
  return id;
}

/** Whether `value` is a well-formed plan id (the anonymous `local` is not). */
export function isPlanId(value: string): boolean {
  return PLAN_ID_RE.test(value);
}

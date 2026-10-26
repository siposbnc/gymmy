/**
 * Prefixed, time-sortable ids.
 *
 * The timestamp prefix means ids sort chronologically, which makes "the sets of
 * this exercise, in order" a cheap range read rather than a sort, and makes a
 * raw database dump readable during debugging.
 */

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

function randomSuffix(length = 10): string {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const bytes = new Uint8Array(length)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('')
  }
  // Only reachable in environments without WebCrypto; ids stay unique enough
  // for a single-device app.
  return Array.from({ length }, () =>
    ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length)),
  ).join('')
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${randomSuffix()}`
}

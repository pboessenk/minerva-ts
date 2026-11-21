/**
 * Byte-offset string operations.
 *
 * A few naming rules in the exporters are defined on UTF-8 bytes rather than
 * characters ("upper-case the first byte"). For ASCII input that is the same
 * thing. For a name that starts with a multi-byte character the byte rule
 * splits the character, and each stranded byte turns into U+FFFD. Exports
 * must keep producing exactly that, so the split is reproduced here instead
 * of being quietly corrected.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });

export function byteLength(s: string): number {
  return encoder.encode(s).length;
}

/**
 * The substring between two byte offsets. Bytes that no longer form a valid
 * sequence decode to U+FFFD, one per stranded byte.
 */
export function sliceBytes(s: string, start: number, end?: number): string {
  // Fast path: byte offsets equal UTF-16 offsets for ASCII.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the range deliberately covers all of ASCII.
  if (/^[\x00-\x7f]*$/.test(s)) return s.slice(start, end);
  return decoder.decode(encoder.encode(s).subarray(start, end));
}

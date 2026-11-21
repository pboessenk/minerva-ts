import { byteLength, quote } from '@minerva/core';

const encoder = new TextEncoder();

/** Bytes starting a UTF-8 sequence of the given total length, or 1 for anything else. */
function sequenceLength(lead: number): number {
  if (lead >= 0xf0 && lead <= 0xf4) return 4;
  if (lead >= 0xe0) return lead < 0xf0 ? 3 : 1;
  if (lead >= 0xc2 && lead < 0xe0) return 2;
  return 1;
}

/**
 * Go's `%q` of `truncate(s, max)`: at most `max` bytes of `s`, then "...".
 * The cut is by byte, so it may split a multi-byte character; the stranded
 * bytes are then written as `\xNN`, as Go does for invalid UTF-8.
 */
export function quoteTruncated(s: string, max: number): string {
  if (byteLength(s) <= max) return quote(s);
  const bytes = encoder.encode(s).subarray(0, max);
  // Find where a character cut by the limit begins.
  let cut = bytes.length;
  for (let p = bytes.length - 1; p >= 0 && p >= bytes.length - 4; p--) {
    const b = bytes[p] as number;
    if ((b & 0xc0) === 0x80) continue;
    if (b >= 0xc0 && sequenceLength(b) > bytes.length - p) cut = p;
    break;
  }
  const whole = new TextDecoder().decode(bytes.subarray(0, cut));
  let tail = '';
  for (let i = cut; i < bytes.length; i++) tail += '\\x' + (bytes[i] as number).toString(16).padStart(2, '0');
  return quote(whole + '...').replace(/\.\.\."$/, tail + '..."');
}

/** `"old" → "new"` with both sides cut to 60 bytes. */
export function descDiff(oldText: string, newText: string): string {
  return `${quoteTruncated(oldText, 60)} → ${quoteTruncated(newText, 60)}`;
}

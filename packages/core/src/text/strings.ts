/**
 * Small string utilities whose exact definition matters for export output.
 */

// White space as trimmed from attribute defaults, example values and the
// like. This differs from String.prototype.trim in two characters: U+0085
// (next line) is white space here, U+FEFF (byte order mark) is not.
const SPACE = '\\t\\n\\v\\f\\r \\u{85}\\u{a0}\\u{1680}\\u{2000}-\\u{200a}\\u{2028}\\u{2029}\\u{202f}\\u{205f}\\u{3000}';
const LEADING_SPACE = new RegExp(`^[${SPACE}]+`, 'u');
const TRAILING_SPACE = new RegExp(`[${SPACE}]+$`, 'u');

export function trimSpace(s: string): string {
  return s.replace(LEADING_SPACE, '').replace(TRAILING_SPACE, '');
}

/** Splits around runs of characters matching `isSeparator`; never yields empty parts. */
export function fieldsFunc(s: string, isSeparator: (ch: string) => boolean): string[] {
  const out: string[] = [];
  let current = '';
  for (const ch of s) {
    if (isSeparator(ch)) {
      if (current !== '') out.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current !== '') out.push(current);
  return out;
}

export function trimSuffix(s: string, suffix: string): string {
  return suffix !== '' && s.endsWith(suffix) ? s.slice(0, s.length - suffix.length) : s;
}

/** Replaces every occurrence; `String.prototype.replaceAll` without regex pitfalls in the replacement. */
export function replaceAll(s: string, search: string, replacement: string): string {
  return s.split(search).join(replacement);
}

/** Number of Unicode code points (not UTF-16 units) in `s`. */
export function runeCount(s: string): number {
  let n = 0;
  for (const _ of s) n++;
  return n;
}

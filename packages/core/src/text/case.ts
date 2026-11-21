/**
 * Case conversion that maps one code point to one code point.
 *
 * `String.prototype.toLowerCase`/`toUpperCase` apply language-independent
 * *full* case mapping: "ß" upper-cases to "SS", a final "Σ" lower-cases to
 * "ς", "İ" lower-cases to two code points. Identifiers and lookup keys in
 * exports are derived with *simple* mapping instead, where every character
 * maps to exactly one character and context never matters. These functions
 * provide that behaviour.
 */

// biome-ignore lint/suspicious/noControlCharactersInRegex: the range deliberately covers all of ASCII.
const ASCII_ONLY = /^[\x00-\x7f]*$/;

/** Characters whose simple upper-case form differs from "unchanged". */
function simpleUpperException(cp: number): number {
  // Greek letters with iota subscript map to their title-case form.
  if ((cp >= 0x1f80 && cp <= 0x1f87) || (cp >= 0x1f90 && cp <= 0x1f97) || (cp >= 0x1fa0 && cp <= 0x1fa7)) {
    return cp + 8;
  }
  if (cp === 0x1fb3 || cp === 0x1fc3 || cp === 0x1ff3) return cp + 9;
  return cp;
}

function lowerCodePoint(cp: number): number {
  if (cp === 0x130) return 0x69; // "İ" -> "i"
  const ch = String.fromCodePoint(cp);
  const mapped = ch.toLowerCase();
  const first = mapped.codePointAt(0) as number;
  return mapped.length === (first > 0xffff ? 2 : 1) ? first : cp;
}

function upperCodePoint(cp: number): number {
  const ch = String.fromCodePoint(cp);
  const mapped = ch.toUpperCase();
  const first = mapped.codePointAt(0) as number;
  return mapped.length === (first > 0xffff ? 2 : 1) ? first : simpleUpperException(cp);
}

function mapCodePoints(s: string, map: (cp: number) => number): string {
  let out = '';
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    // A lone surrogate is not a character; it becomes U+FFFD like any other
    // undecodable input.
    if (cp >= 0xd800 && cp <= 0xdfff) {
      out += '\u{fffd}';
      continue;
    }
    out += String.fromCodePoint(map(cp));
  }
  return out;
}

export function toLower(s: string): string {
  return ASCII_ONLY.test(s) ? s.toLowerCase() : mapCodePoints(s, lowerCodePoint);
}

export function toUpper(s: string): string {
  return ASCII_ONLY.test(s) ? s.toUpperCase() : mapCodePoints(s, upperCodePoint);
}

/** Exposed for the reference-vector test, which checks every code point. */
export const simpleCase = { lower: lowerCodePoint, upper: upperCodePoint };

function foldCodePoint(cp: number): number {
  // Dotted and dotless i only fold in Turkic locales.
  if (cp === 0x130 || cp === 0x131) return cp;
  return lowerCodePoint(upperCodePoint(cp));
}

/** Case-insensitive equality under simple case folding. */
export function equalFold(a: string, b: string): boolean {
  if (a === b) return true;
  const x = [...a];
  const y = [...b];
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) {
    const p = (x[i] as string).codePointAt(0) as number;
    const q = (y[i] as string).codePointAt(0) as number;
    if (p !== q && foldCodePoint(p) !== foldCodePoint(q)) return false;
  }
  return true;
}

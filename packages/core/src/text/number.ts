/**
 * Number parsing and printing for values that are stored as text.
 *
 * Example values and defaults live in the model as strings. Exporters decide
 * from the text alone whether a value counts as a number, and print bounds
 * without exponent notation. `Number()` and `String()` disagree with the
 * reference behaviour at the edges (`Number('')` is 0, `Number('0x10')` is
 * 16, `String(1e21)` is "1e+21"), so both directions are defined here.
 */

const SPECIAL = /^[+-]?(inf|infinity)$|^nan$/i;
const DECIMAL = /^[+-]?(?:[0-9_]+\.?[0-9_]*|\.[0-9_]+)(?:[eE][+-]?[0-9_]+)?$/;
const HEX = /^[+-]?0[xX]([0-9a-fA-F_]*)\.?([0-9a-fA-F_]*)[pP]([+-]?[0-9_]+)$/;

/** Underscores may only sit between digits, or between a base prefix and a digit. */
function underscoresValid(s: string): boolean {
  let saw = '^';
  let i = 0;
  if (s[0] === '+' || s[0] === '-') i = 1;
  let isHex = false;
  const prefix = s[i + 1]?.toLowerCase();
  if (s[i] === '0' && (prefix === 'b' || prefix === 'o' || prefix === 'x')) {
    i += 2;
    saw = '0';
    isHex = prefix === 'x';
  }
  for (; i < s.length; i++) {
    const c = s[i] as string;
    if ((c >= '0' && c <= '9') || (isHex && /[a-fA-F]/.test(c))) {
      saw = '0';
    } else if (c === '_') {
      if (saw !== '0') return false;
      saw = '_';
    } else {
      if (saw === '_') return false;
      saw = '!';
    }
  }
  return saw !== '_';
}

/**
 * Parses text as a 64-bit float, or returns `null` when it is not a number.
 *
 * Accepted: an optional sign, decimal digits with an optional fraction and
 * exponent (`12`, `+5`, `.5`, `5.`, `1e3`), underscores between digits
 * (`1_000`), hexadecimal floats with a binary exponent (`0x1p-2`), and the
 * words `inf`, `infinity`, `nan` in any case. Surrounding white space is not
 * accepted, and neither is a value too large for a double.
 */
export function parseFloatText(s: string): number | null {
  if (SPECIAL.test(s)) {
    if (/nan/i.test(s)) return NaN;
    return s.startsWith('-') ? -Infinity : Infinity;
  }
  if (s.includes('_') && !underscoresValid(s)) return null;

  const hexMatch = HEX.exec(s);
  if (hexMatch) {
    const intPart = (hexMatch[1] as string).replaceAll('_', '');
    const fracPart = (hexMatch[2] as string).replaceAll('_', '');
    if (intPart === '' && fracPart === '') return null;
    const exponent = Number((hexMatch[3] as string).replaceAll('_', ''));
    const mantissa = Number.parseInt(intPart + fracPart || '0', 16);
    const value = mantissa * 2 ** (exponent - 4 * fracPart.length);
    if (!Number.isFinite(value)) return null;
    return s.startsWith('-') ? -value : value;
  }

  if (!DECIMAL.test(s)) return null;
  const digits = s.replaceAll('_', '');
  if (!/[0-9]/.test(digits.split(/[eE]/)[0] as string)) return null;
  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
}

const INT64_MIN = -(2n ** 63n);
const INT64_MAX = 2n ** 63n - 1n;

/** Parses base-10 text as a signed 64-bit integer, or returns `null`. */
export function parseIntText(s: string): bigint | null {
  if (!/^[+-]?[0-9]+$/.test(s)) return null;
  const value = BigInt(s);
  return value < INT64_MIN || value > INT64_MAX ? null : value;
}

/**
 * Prints a finite number with the fewest digits that identify it, never
 * using exponent notation: `5` -> "5", `0.5` -> "0.5", `1e21` ->
 * "1000000000000000000000".
 */
export function formatFloat(value: number): string {
  if (Object.is(value, -0)) return '-0';
  const text = String(value);
  const match = /^(-?)(\d+)(?:\.(\d+))?e([+-]\d+)$/.exec(text);
  if (!match) return text;
  const [, sign, int, frac = '', exp] = match as unknown as [string, string, string, string | undefined, string];
  const exponent = Number(exp);
  const digits = int + frac;
  const pointAt = int.length + exponent;
  if (pointAt <= 0) return `${sign}0.${'0'.repeat(-pointAt)}${digits}`;
  if (pointAt >= digits.length) return `${sign}${digits}${'0'.repeat(pointAt - digits.length)}`;
  return `${sign}${digits.slice(0, pointAt)}.${digits.slice(pointAt)}`;
}

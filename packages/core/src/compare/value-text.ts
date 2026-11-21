import { compareStrings } from '../text/compare.ts';

/**
 * A JSON value decoded without a target type: `null`, a boolean, a 64-bit
 * float, a string, an array, or an object as a map (later duplicate keys
 * win).
 */
export type LooseValue = null | boolean | number | string | LooseValue[] | Map<string, LooseValue>;

/**
 * Prints a float with the fewest digits that identify it, switching to
 * exponent notation below 1e-4 and from 1e6 on, with an exponent of at least
 * two digits: `100`, `1e+06`, `1.5e-07`, `-0`.
 */
export function formatShortFloat(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Infinity) return '+Inf';
  if (value === -Infinity) return '-Inf';
  if (value === 0) return Object.is(value, -0) ? '-0' : '0';

  // toExponential() without an argument yields the shortest digits that
  // round-trip, e.g. "1.2345e+2".
  const match = /^(-?)(\d)(?:\.(\d+))?e([+-]\d+)$/.exec(value.toExponential()) as RegExpExecArray;
  const sign = match[1] as string;
  const digits = (match[2] as string) + (match[3] ?? '');
  const exponent = Number(match[4]);

  if (exponent < -4 || exponent >= 6) {
    const mantissa = digits.length > 1 ? `${digits[0]}.${digits.slice(1)}` : digits;
    const magnitude = String(Math.abs(exponent)).padStart(2, '0');
    return `${sign}${mantissa}e${exponent < 0 ? '-' : '+'}${magnitude}`;
  }
  const pointAt = exponent + 1;
  if (pointAt <= 0) return `${sign}0.${'0'.repeat(-pointAt)}${digits}`;
  if (pointAt >= digits.length) return `${sign}${digits}${'0'.repeat(pointAt - digits.length)}`;
  return `${sign}${digits.slice(0, pointAt)}.${digits.slice(pointAt)}`;
}

/**
 * The plain-text rendering of a loose value, as used for enum and const
 * values: strings as they are, `<nil>` for null, arrays as `[a b]` and
 * objects as `map[k:v]` with keys in order.
 */
export function valueText(value: LooseValue): string {
  if (value === null) return '<nil>';
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return formatShortFloat(value);
  if (Array.isArray(value)) return '[' + value.map(valueText).join(' ') + ']';
  const keys = [...value.keys()].sort(compareStrings);
  return 'map[' + keys.map((key) => key + ':' + valueText(value.get(key) as LooseValue)).join(' ') + ']';
}

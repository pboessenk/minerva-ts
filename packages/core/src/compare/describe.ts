import { sortStrings } from '../text/compare.ts';
import type { IrBody, IrProp } from './ir.ts';

/** A property's type in findings: `string (date)`, `Address`, `array of integer (int32)`. */
export function describeProp(p: IrProp): string {
  let base = p.ref !== '' ? p.ref : p.type;
  if (base === '') base = 'unspecified';
  if (p.format !== '' && p.ref === '') base += ' (' + p.format + ')';
  return p.array ? 'array of ' + base : base;
}

/** A request or response body in findings. */
export function describeBody(b: IrBody | null | undefined): string {
  if (!b) return 'no body';
  if (b.unconstrained) return 'any JSON object';
  const base = b.ref !== '' ? b.ref : 'unspecified';
  return b.array ? 'array of ' + base : base;
}

export function requiredLabel(required: boolean): string {
  return required ? 'required' : 'optional';
}

export function orDash(s: string): string {
  return s === '' ? '(none)' : s;
}

/** The values of `a` that are not in `b`, sorted; duplicates in `a` are kept. */
export function diffStringSets(a: readonly string[], b: readonly string[]): string[] {
  const inB = new Set(b);
  return sortStrings(a.filter((v) => !inB.has(v)));
}

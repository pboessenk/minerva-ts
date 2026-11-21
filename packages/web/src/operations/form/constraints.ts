import type { ApiAttr, Constraints } from '../types.ts';
import type { RtAttr } from '../../editors/types.ts';
import { constraintsForAttr } from '../../editors/constraints.ts';

/** Applicable, set constraints of an attribute (default excluded: it is not a rule on the value). */
export function activeConstraints(attr: ApiAttr): Constraints {
  const out: Record<string, unknown> = {};
  for (const k of constraintsForAttr(attr as unknown as RtAttr)) {
    if (k !== 'default' && attr[k] != null && attr[k] !== '') out[k] = attr[k];
  }
  return out as Constraints;
}

/** Record the attribute's constraints on the element the violation scanner visits. */
export function stampConstraints(el: HTMLElement, attr: ApiAttr): void {
  const active = activeConstraints(attr);
  if (Object.keys(active).length > 0) el.dataset.constraints = JSON.stringify(active);
}

/**
 * Native HTML hints for a primitive input (inclusive bounds and lengths only;
 * the browser's pattern attribute is anchored, unlike JSON Schema, so patterns
 * are left to the scanner) plus the stamp for the scanner.
 */
export function applyFieldConstraints(input: HTMLInputElement, attr: ApiAttr, baseType: string): void {
  const c = activeConstraints(attr);
  if (baseType === 'string') {
    if (c.minLength != null) input.minLength = c.minLength;
    if (c.maxLength != null) input.maxLength = c.maxLength;
  } else if (baseType === 'number' || baseType === 'integer') {
    if (c.minimum != null) input.min = String(c.minimum);
    if (c.maximum != null) input.max = String(c.maximum);
  }
  stampConstraints(input, attr);
}

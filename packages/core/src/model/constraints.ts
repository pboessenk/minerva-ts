import { toLower } from '../text/case.ts';
import { formatFloat } from '../text/number.ts';
import { trimSpace, trimSuffix } from '../text/strings.ts';
import type { Attribute } from './types.ts';

/**
 * Which validation keyword applies to which attribute type.
 *
 * Decided here, once, for the exporters, the comparer and the save
 * validator. The editor applies the same rules in its constraints popup.
 */

/**
 * Constraint keywords (pattern excluded: it is emitted separately) in the
 * order they appear as TypeScript JSDoc tags, HTML badges and comparison
 * findings: lower bound before upper bound, element keywords before item
 * keywords.
 */
export const CONSTRAINT_KEYS = [
  'minLength',
  'maxLength',
  'minimum',
  'exclusiveMinimum',
  'maximum',
  'exclusiveMaximum',
  'minItems',
  'maxItems',
  'default',
] as const;

/** Order used when constraints are summarised on one line (CSV export, editor tooltip). */
const SUMMARY_ORDER = [
  'minLength',
  'maxLength',
  'pattern',
  'minimum',
  'exclusiveMinimum',
  'maximum',
  'exclusiveMaximum',
  'minItems',
  'maxItems',
  'default',
] as const;

/** Splits a type into its lower-cased base and an array flag: `Policy[]` -> `policy`, true. */
export function attributeBase(type: string): { base: string; isArray: boolean } {
  return { base: toLower(trimSuffix(type, '[]')), isArray: type.endsWith('[]') };
}

export const isStringBase = (base: string): boolean => base === 'string';
export const isNumericBase = (base: string): boolean => base === 'number' || base === 'integer' || base === 'int';
export const isIntegerBase = (base: string): boolean => base === 'integer' || base === 'int';

/**
 * True when the attribute is exported as a reference to a named type: an
 * explicit subset of values, or all values of a codelist.
 */
export function hasNamedType(a: Attribute): boolean {
  return a.allowedValues.length > 0 || a.siviCodelist !== null;
}

export interface ConstraintScope {
  /** minLength, maxLength, pattern */
  string: boolean;
  /** minimum, maximum and the exclusive variants */
  numeric: boolean;
  /** minItems, maxItems */
  array: boolean;
  /** default */
  default: boolean;
}

/**
 * Which constraint families apply to an attribute.
 *
 * Named types export as references, so element keywords and defaults never
 * apply to them; item bounds apply to every array. Defaults are limited to
 * optional scalar primitives, since a default on a required property never
 * takes effect.
 */
export function constraintScope(a: Attribute): ConstraintScope {
  const { base, isArray } = attributeBase(a.type);
  const named = hasNamedType(a);
  return {
    string: isStringBase(base) && !named,
    numeric: isNumericBase(base) && !named,
    array: isArray,
    default: !isArray && !named && !a.required && (isStringBase(base) || isNumericBase(base) || base === 'boolean'),
  };
}

/**
 * The applicable, set constraints of an attribute as canonical text keyed by
 * keyword. A value left behind on an attribute whose type no longer supports
 * it is dropped, so no exporter ever sees a stale constraint.
 */
export function constraintMap(a: Attribute): Map<string, string> {
  const scope = constraintScope(a);
  const out = new Map<string, string>();
  const putInt = (key: string, value: number | null): void => {
    if (value !== null) out.set(key, String(value));
  };
  const putFloat = (key: string, value: number | null): void => {
    if (value !== null) out.set(key, formatFloat(value));
  };
  if (scope.string) {
    putInt('minLength', a.minLength);
    putInt('maxLength', a.maxLength);
  }
  if (scope.numeric) {
    putFloat('minimum', a.minimum);
    putFloat('exclusiveMinimum', a.exclusiveMinimum);
    putFloat('maximum', a.maximum);
    putFloat('exclusiveMaximum', a.exclusiveMaximum);
  }
  if (scope.array) {
    putInt('minItems', a.minItems);
    putInt('maxItems', a.maxItems);
  }
  let value = trimSpace(a.default);
  if (scope.default && value !== '') {
    if (attributeBase(a.type).base === 'boolean') value = toLower(value);
    out.set('default', value);
  }
  return out;
}

/** All applicable constraints, pattern included, as `key: value; key: value`. */
export function constraintSummary(a: Attribute): string {
  const constraints = constraintMap(a);
  if (constraintScope(a).string && a.pattern !== '') constraints.set('pattern', a.pattern);
  const parts: string[] = [];
  for (const key of SUMMARY_ORDER) {
    const value = constraints.get(key);
    if (value !== undefined) parts.push(`${key}: ${value}`);
  }
  return parts.join('; ');
}

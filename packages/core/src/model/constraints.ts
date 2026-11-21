import { toLower } from '../text/case.ts';
import { formatFloat } from '../text/number.ts';
import { trimSpace, trimSuffix } from '../text/strings.ts';
/**
 * Which validation keyword applies to which attribute type.
 *
 * Decided here, once, for the exporters, the comparer, the save validator
 * and the editor. The functions take a `ConstraintSubject`, which a decoded
 * `Attribute` and the editor's attribute objects both satisfy.
 */

/**
 * The attribute fields the constraint rules read. Optional and nullable so
 * that both a decoded `Attribute` (empty string for an unset pattern or
 * default) and an attribute as the editor holds it (`null` or absent) fit.
 */
export interface ConstraintSubject {
  type: string;
  required?: boolean | null;
  /** Subset of codelist or enum values; non-empty makes the attribute a named type. */
  allowedValues?: readonly string[] | null;
  /** Set (an empty string included) makes the attribute a named type. */
  siviCodelist?: string | null;
  pattern?: string | null;
  minLength?: number | null;
  maxLength?: number | null;
  minimum?: number | null;
  maximum?: number | null;
  exclusiveMinimum?: number | null;
  exclusiveMaximum?: number | null;
  minItems?: number | null;
  maxItems?: number | null;
  default?: string | null;
}

/** A subject with every constraint field present: `null` for an unset bound, `''` for an unset pattern or default. */
export interface ResolvedConstraints {
  type: string;
  required: boolean;
  pattern: string;
  minLength: number | null;
  maxLength: number | null;
  minimum: number | null;
  maximum: number | null;
  exclusiveMinimum: number | null;
  exclusiveMaximum: number | null;
  minItems: number | null;
  maxItems: number | null;
  default: string;
}

export function resolveConstraints(a: ConstraintSubject): ResolvedConstraints {
  return {
    type: a.type,
    required: a.required === true,
    pattern: a.pattern ?? '',
    minLength: a.minLength ?? null,
    maxLength: a.maxLength ?? null,
    minimum: a.minimum ?? null,
    maximum: a.maximum ?? null,
    exclusiveMinimum: a.exclusiveMinimum ?? null,
    exclusiveMaximum: a.exclusiveMaximum ?? null,
    minItems: a.minItems ?? null,
    maxItems: a.maxItems ?? null,
    default: a.default ?? '',
  };
}

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

/**
 * Every constraint field, pattern included, in display order: the editor's
 * rules dialog and the one-line summaries (CSV export, editor tooltips).
 */
export const CONSTRAINT_FIELDS = [
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

export type ConstraintField = (typeof CONSTRAINT_FIELDS)[number];

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
export function hasNamedType(a: ConstraintSubject): boolean {
  return (a.allowedValues?.length ?? 0) > 0 || (a.siviCodelist ?? null) !== null;
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
export function constraintScope(a: ConstraintSubject): ConstraintScope {
  const { base, isArray } = attributeBase(a.type);
  const named = hasNamedType(a);
  return {
    string: isStringBase(base) && !named,
    numeric: isNumericBase(base) && !named,
    array: isArray,
    default: !isArray && !named && a.required !== true && (isStringBase(base) || isNumericBase(base) || base === 'boolean'),
  };
}

/** The constraint fields an attribute can carry, in display order. */
export function applicableConstraints(a: ConstraintSubject): ConstraintField[] {
  const scope = constraintScope(a);
  return CONSTRAINT_FIELDS.filter((field) => {
    switch (field) {
      case 'minLength':
      case 'maxLength':
      case 'pattern':
        return scope.string;
      case 'minimum':
      case 'exclusiveMinimum':
      case 'maximum':
      case 'exclusiveMaximum':
        return scope.numeric;
      case 'minItems':
      case 'maxItems':
        return scope.array;
      case 'default':
        return scope.default;
    }
  });
}

/**
 * The applicable, set constraints of an attribute as canonical text keyed by
 * keyword. A value left behind on an attribute whose type no longer supports
 * it is dropped, so no exporter ever sees a stale constraint.
 */
export function constraintMap(subject: ConstraintSubject): Map<string, string> {
  const scope = constraintScope(subject);
  const a = resolveConstraints(subject);
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
export function constraintSummary(a: ConstraintSubject): string {
  return constraintSummaryParts(a).join('; ');
}

/** `constraintSummary` before joining: one `key: value` per applicable, set constraint. */
export function constraintSummaryParts(a: ConstraintSubject): string[] {
  const constraints = constraintMap(a);
  const pattern = a.pattern ?? '';
  if (constraintScope(a).string && pattern !== '') constraints.set('pattern', pattern);
  const parts: string[] = [];
  for (const key of CONSTRAINT_FIELDS) {
    const value = constraints.get(key);
    if (value !== undefined) parts.push(`${key}: ${value}`);
  }
  return parts;
}

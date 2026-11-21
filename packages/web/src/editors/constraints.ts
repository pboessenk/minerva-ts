/**
 * Per-attribute validation constraints (the OpenAPI keywords minLength,
 * maximum, minItems, default, ...): which keys apply to which attribute type,
 * and the helpers that keep both model graphs (raw JSON and runtime) in sync.
 * Mirrors constraintScope() in server/constraints.go.
 */
import type { ConstraintKey, Constraints, RawAttr, RtAttr } from './types.ts';
import { getRawModel } from './model-access.ts';

// Every constraint key, in display order. Values are JSON numbers for the
// bounds, strings for pattern/default, null when unset.
export const CONSTRAINT_KEYS: readonly ConstraintKey[] = [
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
];

/**
 * Copy the constraint keys of a raw or runtime attribute object, null when
 * unset. `!= null` on purpose: 0 is a meaningful bound (minimum: 0).
 */
export function pickConstraints(src: Partial<Constraints> | null | undefined): Constraints {
  const out: Record<string, unknown> = {};
  for (const k of CONSTRAINT_KEYS) out[k] = src && src[k] != null ? src[k] : null;
  return out as unknown as Constraints;
}

export function emptyConstraints(): Constraints {
  return pickConstraints(null);
}

/** Type facts every applicability rule below is built from. */
export function _constraintTypeInfo(attr: RtAttr) {
  const t = attr.type || '';
  const isArray = /\[\]$/.test(t);
  const base = t.replace(/\[\]$/, '').toLowerCase();
  // Codelist / allowed-values attributes export as $ref schemas where
  // element keywords and defaults would be silently dropped.
  const isNamed = (attr.allowedValues && attr.allowedValues.length > 0) || !!attr.codelist;
  return {
    isArray,
    base,
    isNamed,
    isString: base === 'string' && !isNamed,
    isNumeric: ['number', 'integer', 'int'].includes(base) && !isNamed,
    isInteger: base === 'integer' || base === 'int',
    isBoolean: base === 'boolean',
  };
}

/**
 * Constraint keys that apply to a runtime attribute: lengths + pattern for
 * plain strings, value bounds for numerics, item bounds for any array, and
 * a default for optional scalar primitives only (a default on a required
 * property never takes effect).
 */
export function constraintsForAttr(attr: RtAttr): ConstraintKey[] {
  const ti = _constraintTypeInfo(attr);
  const keys: ConstraintKey[] = [];
  if (ti.isString) keys.push('minLength', 'maxLength', 'pattern');
  if (ti.isNumeric) keys.push('minimum', 'exclusiveMinimum', 'maximum', 'exclusiveMaximum');
  if (ti.isArray) keys.push('minItems', 'maxItems');
  if (!ti.isArray && !ti.isNamed && !attr.required && (ti.isString || ti.isNumeric || ti.isBoolean)) {
    keys.push('default');
  }
  return keys;
}

/**
 * Null out constraints the attribute can no longer carry, on both the raw
 * JSON object and the runtime object. Returns whether anything changed.
 */
export function pruneConstraints(rawAttr: RawAttr | null | undefined, rtAttr: RtAttr | null | undefined): boolean {
  if (!rtAttr) return false;
  const keep = new Set(constraintsForAttr(rtAttr));
  let changed = false;
  for (const k of CONSTRAINT_KEYS) {
    if (keep.has(k)) continue;
    for (const obj of [rawAttr, rtAttr]) {
      if (obj && obj[k] != null) {
        (obj as unknown as Record<string, unknown>)[k] = null;
        changed = true;
      }
    }
  }
  return changed;
}

/** The raw JSON attribute object (the one that is saved) of an entity attribute. */
export function findRawAttr(entityName: string, attrName: string): RawAttr | null {
  const model = getRawModel()!;
  const entity = model && model.entities && model.entities[entityName];
  if (!entity) return null;
  for (const sec of entity.sections || []) {
    const hit = (sec.attributes || []).find((a) => a.name === attrName);
    if (hit) return hit;
  }
  return null;
}

/** Set, applicable constraints as "key: value" lines (tooltips, filter text). */
export function constraintSummary(attr: RtAttr): string[] {
  const lines: string[] = [];
  for (const k of constraintsForAttr(attr)) {
    if (attr[k] != null && attr[k] !== '') lines.push(k + ': ' + attr[k]);
  }
  return lines;
}

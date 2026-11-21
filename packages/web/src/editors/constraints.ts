/**
 * Per-attribute validation constraints (the OpenAPI keywords minLength,
 * maximum, minItems, default, ...) in the editor.
 *
 * Which keys apply to which attribute type is decided in core
 * (`applicableConstraints`), the same rules the exporters and the save
 * validator use. This module adapts the editor's attribute objects to those
 * rules and keeps both model graphs (raw JSON and runtime) in step with them.
 */
import {
  CONSTRAINT_FIELDS,
  type ConstraintField,
  type ConstraintSubject,
  type RawAttribute,
  applicableConstraints,
  constraintSummaryParts,
} from '@minerva/core';
import type { ApiAttr, AttrConstraints } from '../editor/model-types.ts';
import { getRawModel } from './model-access.ts';

/** Every constraint key, in display order. */
export { CONSTRAINT_FIELDS };

/**
 * The fields core's rules read. The runtime attribute calls the codelist
 * `codelist`; the saved one, and core, call it `siviCodelist`.
 */
export function constraintSubject(attr: ApiAttr): ConstraintSubject {
  return { ...attr, siviCodelist: attr.codelist ?? null };
}

/**
 * Copy the constraint keys of a raw or runtime attribute object, null when
 * unset. `!= null` on purpose: 0 is a meaningful bound (minimum: 0).
 */
export function pickConstraints(src: Partial<AttrConstraints> | null | undefined): AttrConstraints {
  const out: Record<string, unknown> = {};
  for (const k of CONSTRAINT_FIELDS) out[k] = src && src[k] != null ? src[k] : null;
  return out as unknown as AttrConstraints;
}

export function emptyConstraints(): AttrConstraints {
  return pickConstraints(null);
}

/** Constraint keys that apply to a runtime attribute, in display order. */
export function constraintsForAttr(attr: ApiAttr): ConstraintField[] {
  return applicableConstraints(constraintSubject(attr));
}

/**
 * Null out constraints the attribute can no longer carry, on both the raw
 * JSON object and the runtime object. Returns whether anything changed.
 */
export function pruneConstraints(rawAttr: RawAttribute | null | undefined, rtAttr: ApiAttr | null | undefined): boolean {
  if (!rtAttr) return false;
  const keep = new Set(constraintsForAttr(rtAttr));
  let changed = false;
  for (const k of CONSTRAINT_FIELDS) {
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
export function findRawAttr(entityName: string, attrName: string): RawAttribute | null {
  const model = getRawModel()!;
  const entity = model && model.entities && model.entities[entityName];
  if (!entity) return null;
  for (const sec of entity.sections || []) {
    const hit = (sec.attributes || []).find((a) => a.name === attrName);
    if (hit) return hit;
  }
  return null;
}

/** Set, applicable constraints as "key: value" lines (tooltips, filter text), as the exports write them. */
export function constraintSummary(attr: ApiAttr): string[] {
  return constraintSummaryParts(constraintSubject(attr));
}

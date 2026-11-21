/** Reconciles stored example data with the current domain model. */
import type { JsonObject, TypeMap } from '../types.ts';
import { FORM_MAX_DEPTH, formTypeInfo } from './type-info.ts';
import { getEntities, getEnums } from '../model-access.ts';

/**
 * Reconcile stored example data against the current domain model.
 * Prunes orphaned keys, clears values whose type changed, recurses
 * into entity refs, filters deleted entities from arrays.
 *
 * @param entityName Key into apiModel
 * @param stored     The stored example data (ex.request)
 * @param typeMap    The stored _typeMap (may be null in older examples)
 * @param depth      Recursion depth
 * @param pathPrefix Dot-path prefix for typeMap lookups (e.g. 'ticket')
 * @returns Cleaned data, or null if the entity was deleted
 */
export function reconcileExampleData(
  entityName: string,
  stored: unknown,
  typeMap: TypeMap | null | undefined,
  depth: number,
  pathPrefix?: string,
): JsonObject | null {
  // Past the depth limit `stored` is returned untouched; its shape is whatever was stored.
  if (depth >= FORM_MAX_DEPTH) return stored as JsonObject | null;

  const entity = getEntities()?.[entityName] ?? null;
  if (!entity) return null; // entity was deleted

  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return {};
  const src = stored as JsonObject;

  const result: JsonObject = {};
  const tm = typeMap || {};
  const prefix = pathPrefix || '';

  // For subtyped entities, determine the active subtype to filter inapplicable attrs
  const etAttr = entity.attrs.find((a) => a.name === 'entityType' && a.allowedValues && a.allowedValues.length > 0);
  const activeSubtype =
    etAttr && src.entityType && (etAttr.allowedValues as string[]).includes(src.entityType as string) ? (src.entityType as string) : null;

  for (const attr of entity.attrs) {
    if (attr.type === '_section') continue;

    const key = attr.name;
    if (!(key in src)) continue; // Key not in stored data: skip (new attr, leave empty)

    // Strip attrs inapplicable to the active subtype
    if (activeSubtype && key !== 'entityType') {
      const applicable = attr.applicableSubtypes;
      if (applicable && applicable.length > 0 && !applicable.includes(activeSubtype)) continue;
    }

    const storedVal = src[key];
    const info = formTypeInfo(attr.type);
    if (info.kind === 'skip') continue;

    // Check type change via typeMap, using the full dot-path so nested attrs with
    // identical names (e.g. event.entityType vs event.ticket.entityType) don't collide.
    const tmKey = prefix ? prefix + '.' + key : key;
    const storedType = tm[tmKey];
    if (storedType && storedType !== attr.type) {
      // Type changed: discard stored value
      continue;
    }

    switch (info.kind) {
      case 'primitive':
      case 'unresolved':
      case 'primitive-array':
        result[key] = storedVal;
        break;

      case 'enum': {
        // Check if stored enum value still exists
        const en = getEnums()?.[info.base] ?? null;
        if (en && en.values) {
          const valid = en.values.some((v) => v.value === storedVal);
          if (valid) result[key] = storedVal;
          // else: stored value was removed from enum, discard
        } else {
          result[key] = storedVal; // enum deleted, keep as string
        }
        break;
      }

      case 'enum-array': {
        const arr: unknown[] = Array.isArray(storedVal) ? storedVal : storedVal ? [storedVal] : [];
        const en2 = getEnums()?.[info.base] ?? null;
        if (en2 && en2.values) {
          const validSet = new Set(en2.values.map((v) => v.value));
          const filtered = arr.filter((v) => validSet.has(v as string));
          if (filtered.length > 0) result[key] = filtered;
        } else {
          if (arr.length > 0) result[key] = arr;
        }
        break;
      }

      case 'entity': {
        const childPrefix = prefix ? prefix + '.' + key : key;
        const childResult = reconcileExampleData(info.base, storedVal, tm, depth + 1, childPrefix);
        if (childResult !== null && Object.keys(childResult).length > 0) {
          result[key] = childResult;
        }
        break;
      }

      case 'entity-array': {
        if (!Array.isArray(storedVal)) break;
        // Array items are independent roots in the typeMap (see collectEntity:
        // entity-array items are collected with a fresh '' prefix and {} typeMap),
        // so reconcile each item as a standalone root.
        const reconciled = storedVal
          .map((item) => reconcileExampleData(info.base, item, {}, depth + 1, ''))
          .filter((item): item is JsonObject => item !== null && Object.keys(item).length > 0);
        if (reconciled.length > 0) {
          result[key] = reconciled;
        }
        break;
      }
    }
  }

  return result;
}

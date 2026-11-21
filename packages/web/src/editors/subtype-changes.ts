/**
 * Subtypes of an entity (the values of its entityType attribute) and how a
 * change in them is carried into the attributes' applicableSubtypes.
 */
import type { ApiAttr } from '../editor/model-types.ts';
import { findRawAttr } from './constraints.ts';
import { _siviTypesFor } from './sivi.ts';
import { getRawModel } from './model-access.ts';
import { showToast } from '../base/ui.ts';
import { state } from '../editor/state.ts';

/**
 * When entityType has type = an enum, sync its allowedValues from that enum's
 * values. Updates both raw and runtime models. Returns true if sync occurred.
 */
export function _syncEnumEntityType(entityName: string): boolean {
  const rtEntity = state.apiModel![entityName];
  if (!rtEntity) return false;
  const etAttr = rtEntity.attrs.find((a) => a.name === 'entityType');
  if (!etAttr) return false;
  const enumDef = state.apiEnums && state.apiEnums![etAttr.type];
  if (!enumDef) return false;

  const newVals = enumDef.values.map((v) => v.value);
  const oldVals = _effectiveSubtypes(etAttr);

  // Update runtime
  etAttr.allowedValues = newVals;

  // Update raw model
  const model = getRawModel()!;
  const rawEntity = model && model.entities[entityName];
  if (rawEntity) {
    for (const sec of rawEntity.sections || []) {
      const rawAttr = (sec.attributes || []).find((a) => a.name === 'entityType');
      if (rawAttr) {
        rawAttr.allowedValues = newVals;
        break;
      }
    }
  }

  _applySubtypeChanges(entityName, _diffSubtypes(oldVals, newVals));
  return true;
}

/* ── Subtype Changes ── */

/**
 * The subtypes an entity currently has: its entityType allowedValues, or, for
 * an enum-typed entityType without an explicit list, all of the enum's values.
 */
export function _effectiveSubtypes(etAttr: ApiAttr | null | undefined): string[] {
  if (!etAttr) return [];
  if (etAttr.allowedValues && etAttr.allowedValues.length > 0) return etAttr.allowedValues;
  const enumDef = state.apiEnums && state.apiEnums![etAttr.type];
  return enumDef ? enumDef.values.map((v) => v.value) : [];
}

/** { removed, added } between two subtype lists. */
export function _diffSubtypes(
  oldList: string[] | null | undefined,
  newList: string[] | null | undefined,
): { removed: string[]; added: string[] } {
  const oldSet = new Set(oldList || []);
  const newSet = new Set(newList || []);
  return {
    removed: [...oldSet].filter((st) => !newSet.has(st)),
    added: [...newSet].filter((st) => !oldSet.has(st)),
  };
}

/**
 * Carry a change in an entity's subtypes into its attributes' explicit
 * applicableSubtypes lists, leaving every other choice alone:
 * - renamed subtypes are renamed, removed ones are dropped;
 * - an added subtype is appended only where the attribute's SIVI reference
 *   says that subtype has it;
 * - attributes that apply to all subtypes (null) are never touched.
 * A list that ends up covering every subtype collapses to null (shared), as
 * the subtypes picker does. A list left empty also falls back to null, and
 * the affected attributes are named in a toast. Updates raw + runtime.
 */
export function _applySubtypeChanges(
  entityName: string,
  { removed = [], added = [], renamed = {} }: { removed?: string[]; added?: string[]; renamed?: Record<string, string> },
): void {
  const rtEntity = state.apiModel![entityName];
  if (!rtEntity) return;
  const current = _effectiveSubtypes(rtEntity.attrs.find((a) => a.name === 'entityType'));
  const currentSet = new Set(current);
  const removedSet = new Set(removed);
  const emptied: string[] = [];

  for (const attr of rtEntity.attrs) {
    if (attr.name === 'entityType') continue;
    const prev = attr.applicableSubtypes;
    if (!prev || prev.length === 0) continue;

    const next = prev.map((st) => (Object.hasOwn(renamed, st) ? renamed[st]! : st)).filter((st) => !removedSet.has(st));
    const siviTypes = added.length > 0 ? _siviTypesFor(attr.sivi) : null;
    const siviAdded = siviTypes ? added.filter((st) => siviTypes.has(st)) : [];
    next.push(...siviAdded);
    const kept = [...new Set(next)].filter((st) => currentSet.has(st));
    if (siviAdded.length > 0) kept.sort(); // as the subtypes picker saves

    let newValue: string[] | null = kept;
    if (kept.length === 0) {
      if (current.length > 0) emptied.push(attr.name);
      newValue = null;
    } else if (kept.length === currentSet.size) {
      newValue = null;
    }
    if (newValue && newValue.length === prev.length && newValue.every((st, i) => st === prev[i])) continue;

    attr.applicableSubtypes = newValue;
    const rawAttr = findRawAttr(entityName, attr.name);
    if (rawAttr) rawAttr.applicableSubtypes = newValue;
  }

  if (emptied.length > 0) {
    const names = emptied.join(', ');
    showToast(
      emptied.length === 1
        ? `No subtypes left for ${names}: it now applies to all subtypes`
        : `No subtypes left for ${names}: they now apply to all subtypes`,
      'info',
      6000,
    );
  }
}

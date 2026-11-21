/**
 * SIVI datacat lookups: path validity, expected types, subtype defaults and
 * the path list behind the reference autocomplete.
 */

interface SiviPathInfo {
  path: string;
  desc: string;
  datatype: string;
  etCount: number;
  etTotal: number;
}

let _siviPathSet: Set<string> | null; // Set of valid SIVI paths from datacat.json

export function getSiviPathSet(): Set<string> | null {
  return _siviPathSet;
}

export function setSiviPathSet(value: Set<string> | null): void {
  _siviPathSet = value;
}

export function installSivi(): void {
  _siviPathSet = null;
}
import { datacat } from './model-access.ts';
import { state } from '../editor/state.ts';

/**
 * Build (or rebuild) _siviPathSet from datacat().
 * Called once after datacat is loaded.
 */
export function buildSiviPathSet(): void {
  _siviPathSet = new Set();
  if (!datacat()) return;
  for (const [entityName, entity] of Object.entries(datacat()!)) {
    for (const et of entity.entityTypes || []) {
      for (const attr of et.attrs || []) {
        _siviPathSet.add(`${entityName.toLowerCase()}.${attr.name}`);
      }
    }
  }
}

/**
 * Check if a SIVI reference path is valid (found in datacat).
 */
export function isSiviPathValid(path: string | null | undefined): boolean {
  if (!path) return false;
  if (!_siviPathSet) return false;
  return _siviPathSet.has(path);
}

/** SIVI datatype → user type mapping. */
const _siviTypeMap: Record<string, string> = {
  string: 'string',
  '[string]': 'string[]',
  integer: 'integer',
  decimal: 'number',
  date: 'Date',
};

/**
 * Return the expected user type for a SIVI reference, or null if unknown.
 * Picks the first entity type that has the attribute.
 */
export function _siviExpectedType(siviPath: string | null | undefined): string | null {
  if (!datacat() || !siviPath) return null;
  const dot = siviPath.indexOf('.');
  if (dot < 0) return null;
  const dcEntity = datacat()![siviPath.substring(0, dot)];
  if (!dcEntity) return null;
  const attrName = siviPath.substring(dot + 1);
  for (const et of dcEntity.entityTypes || []) {
    const a = (et.attrs || []).find((a) => a.name === attrName);
    if (a && a.datatype) return _siviTypeMap[a.datatype] || null;
  }
  return null;
}

/**
 * Return { type, codelist } for a SIVI path from the datacat.
 * type = mapped user type (via _siviTypeMap), codelist = codelist name or null.
 */
export function _siviAttrInfo(siviPath: string | null | undefined): { type: string | null; codelist: string | null } | null {
  if (!datacat() || !siviPath) return null;
  const dot = siviPath.indexOf('.');
  if (dot < 0) return null;
  const dcEntity = datacat()![siviPath.substring(0, dot)];
  if (!dcEntity) return null;
  const attrName = siviPath.substring(dot + 1);
  for (const et of dcEntity.entityTypes || []) {
    const a = (et.attrs || []).find((a) => a.name === attrName);
    if (a) return { type: (a.datatype && _siviTypeMap[a.datatype]) || null, codelist: a.codelist || null };
  }
  return null;
}

/**
 * The datacat entity types that carry the attribute a SIVI path points to
 * (e.g. "party.birthDate"), as a Set. Null when the datacat isn't loaded or
 * the path doesn't resolve to any entity type.
 */
export function _siviTypesFor(siviPath: string | null | undefined): Set<string> | null {
  if (!datacat() || !siviPath) return null;
  const dotIdx = siviPath.indexOf('.');
  if (dotIdx < 0) return null;
  const dcEntity = datacat()![siviPath.substring(0, dotIdx)];
  if (!dcEntity) return null;
  const dcAttrName = siviPath.substring(dotIdx + 1);

  const siviTypes = new Set<string>();
  for (const et of dcEntity.entityTypes || []) {
    if ((et.attrs || []).some((a) => a.name === dcAttrName)) siviTypes.add(et.name);
  }
  return siviTypes.size > 0 ? siviTypes : null;
}

export function _deriveSiviSubtypes(entityName: string, siviPath: string | null | undefined): string[] | null | undefined {
  // Find allowed subtypes on this entity's entityType attr
  const runtimeEntity = state.apiModel![entityName];
  if (!runtimeEntity) return undefined;
  const etAttr = runtimeEntity.attrs.find((a) => a.name === 'entityType');
  if (!etAttr || !etAttr.allowedValues || etAttr.allowedValues.length === 0) return undefined;
  const allowed = etAttr.allowedValues;

  // Which entity types in the datacat have this attribute
  const siviTypes = _siviTypesFor(siviPath);
  if (!siviTypes) return undefined;

  // Intersect with our allowed subtypes
  const matching = allowed.filter((st) => siviTypes.has(st));

  // All allowed subtypes have it → shared (null)
  if (matching.length === allowed.length) return null;
  // None match → still return null (don't block, user chose this ref)
  if (matching.length === 0) return null;
  return matching;
}

/**
 * Get the SIVI default subtypes for display purposes.
 * Returns { defaults: string[], hasSiviData: boolean }.
 * defaults = intersection of SIVI entityTypes with allowedValues.
 * hasSiviData = true if the attribute exists in the SIVI datacat.
 */
export function _getSiviSubtypeDefaults(
  entityName: string,
  siviPath: string | null | undefined,
): { defaults: string[]; hasSiviData: boolean } {
  const none: { defaults: string[]; hasSiviData: boolean } = { defaults: [], hasSiviData: false };
  const runtimeEntity = state.apiModel![entityName];
  if (!runtimeEntity) return none;
  const etAttr = runtimeEntity.attrs.find((a) => a.name === 'entityType');
  if (!etAttr || !etAttr.allowedValues || etAttr.allowedValues.length === 0) return none;
  const allowed = etAttr.allowedValues;

  const siviTypes = _siviTypesFor(siviPath);
  if (!siviTypes) return none;
  return { defaults: allowed.filter((st) => siviTypes.has(st)), hasSiviData: true };
}

/**
 * Build SIVI reference paths from datacat() for autocomplete.
 */
export function getSiviPaths(): SiviPathInfo[] {
  if (!datacat()) return [];
  const merged = new Map<string, SiviPathInfo>();
  for (const [entityName, entity] of Object.entries(datacat()!)) {
    const totalEts = (entity.entityTypes || []).length;
    for (const et of entity.entityTypes || []) {
      for (const attr of et.attrs || []) {
        const key = `${entityName.toLowerCase()}.${attr.name}`;
        if (!merged.has(key)) {
          merged.set(key, {
            path: key,
            desc: attr.desc || '',
            datatype: attr.datatype || '',
            etCount: 1,
            etTotal: totalEts,
          });
        } else {
          merged.get(key)!.etCount++;
        }
      }
    }
  }
  return Array.from(merged.values());
}

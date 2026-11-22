/**
 * Update an attribute field in both the raw JSON model and the runtime model.
 */
import type { RawAttribute } from '@minerva/core';
import { CONSTRAINT_FIELDS, pruneConstraints } from './constraints.ts';
import { _deriveSiviSubtypes } from './sivi.ts';
import { _syncEnumEntityType } from './subtype-changes.ts';
import { getRawModel } from './model-access.ts';
import { setDirty } from '../base/model-state.ts';
import { refreshGraph } from '../editor/graph.ts';
import { buildApiSidebar } from '../editor/sidebar.ts';
import { deriveAllChildren, state } from '../editor/state.ts';
import { renderEntityDetail } from './entity-render.ts';

/**
 * Update an attribute field in both the raw JSON model and runtime model.
 */
export function updateAttribute(entityName: string, attrName: string, field: string, value: unknown): boolean {
  const model = getRawModel()!;
  if (!model || !model.entities[entityName]) return false;

  // Find the attribute in the raw model (nested in sections)
  const entity = model.entities[entityName];
  let found = false;
  let rawAttr: RawAttribute | null = null;
  for (const section of entity.sections || []) {
    for (const attr of section.attributes || []) {
      if (attr.name === attrName) {
        // Map field names: runtime uses 'note', raw uses 'notes'
        const rawField = field === 'note' ? 'notes' : field;
        (attr as unknown as Record<string, unknown>)[rawField] = value;
        rawAttr = attr;
        // Reset allowedValues when linked codelist/entityType changes
        if (field === 'siviCodelist' || field === 'siviReference') {
          attr.allowedValues = null;
          attr.allowedName = null;
        }
        found = true;
        break;
      }
    }
    if (found) break;
  }

  if (!found) return false;

  // Update runtime model
  const runtimeEntity = state.apiModel![entityName];
  if (runtimeEntity) {
    const runtimeAttr = runtimeEntity.attrs.find((a) => a.name === attrName);
    if (runtimeAttr) {
      // Map field names for runtime model
      if (field === 'siviReference') runtimeAttr.sivi = value as string | null;
      else if (field === 'siviCodelist') runtimeAttr.codelist = value as string | null;
      else if (field === 'notes') runtimeAttr.note = value as string | null;
      else (runtimeAttr as unknown as Record<string, unknown>)[field] = value;

      // Reset allowedValues when the linked codelist/entityType changes
      if (field === 'siviCodelist' || field === 'siviReference') {
        runtimeAttr.allowedValues = null;
        runtimeAttr.allowedName = null;
      }
    }
  }

  // Drop validation constraints the attribute can no longer carry after a
  // type / required / codelist change (every exporter would skip them).
  if (!(CONSTRAINT_FIELDS as readonly string[]).includes(field) && runtimeEntity) {
    const rtName = field === 'name' ? value : attrName;
    pruneConstraints(
      rawAttr,
      runtimeEntity.attrs.find((a) => a.name === rtName),
    );
  }

  // Auto-derive applicableSubtypes from SIVI datacat when siviReference changes
  if (field === 'siviReference') {
    const derived = _deriveSiviSubtypes(entityName, value as string | null);
    if (derived !== undefined) {
      // Update raw model
      for (const section of entity.sections || []) {
        for (const attr of section.attributes || []) {
          if (attr.name === attrName) {
            attr.applicableSubtypes = derived;
            break;
          }
        }
      }
      // Update runtime model
      const rtEntity = state.apiModel![entityName];
      if (rtEntity) {
        const rtAttr = rtEntity.attrs.find((a) => a.name === attrName);
        if (rtAttr) rtAttr.applicableSubtypes = derived;
      }
    }
  }

  setDirty(true);

  // If the type field changed, re-derive children from attribute types
  if (field === 'type') {
    deriveAllChildren();
    buildApiSidebar();
    refreshGraph();
    // When entityType's type is set to an enum, sync allowedValues from it
    if (attrName === 'entityType') {
      _syncEnumEntityType(entityName);
    }
  }

  return true;
}

/**
 * Toggle the required field for an attribute. For an attribute typed with
 * another entity, that sets the child's cardinality (`0..1` or `1`, `*` or
 * `1..*`), so the children are derived again and the view redrawn.
 */
export function toggleRequired(entityName: string, attrName: string, isRequired: boolean): void {
  if (!updateAttribute(entityName, attrName, 'required', isRequired)) return;
  setDirty(true);
  const attr = state.apiModel?.[entityName]?.attrs.find((a) => a.name === attrName);
  const baseType = (attr?.type ?? '').replace(/\[\]$/, '');
  if (baseType !== entityName && state.apiModel?.[baseType] !== undefined) {
    deriveAllChildren();
    refreshGraph();
    renderEntityDetail(entityName);
  }
}

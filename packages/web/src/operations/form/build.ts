/** Entity form builder: walks an entity's attributes and renders one control per attribute. */
import type { ApiAttr, ApiEntity, JsonObject, TypeInfo } from '../types.ts';
import { FORM_MAX_DEPTH, formTypeInfo } from './type-info.ts';
import {
  buildEnumArrayField,
  buildEnumField,
  buildPrimitiveArrayField,
  buildPrimitiveField,
  buildUnresolvedField,
  makeLabel,
} from './fields.ts';
import { buildCodelistArrayField, buildCodelistField, buildEntityTypeField } from './codelist-fields.ts';
import { buildEntityArraySection, buildEntitySection } from './nested.ts';
import { getEntities } from '../model-access.ts';

/** Placeholder content for an entity that cannot be rendered. */
function warningContent(entityName: string, message: string): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'ca-form-entity-content';
  wrap.dataset.entityName = entityName;
  const warn = document.createElement('div');
  warn.className = 'ca-form-warning';
  warn.textContent = message;
  wrap.appendChild(warn);
  return wrap;
}

/**
 * Build a structured form for an entity's attributes.
 *
 * @param entityName   Key into apiModel
 * @param dataPath     Dot-path prefix for data-path attributes (e.g. '' or 'claim.incident')
 * @param existingData Pre-existing values from ex.request (already reconciled)
 * @param depth        Current recursion depth (0 = root)
 * @returns A <div> containing the form controls
 */
export function buildEntityForm(entityName: string, dataPath: string, existingData: unknown, depth: number): HTMLElement {
  const entity = getEntities()?.[entityName] ?? null;

  if (!entity) {
    return warningContent(entityName, `Entity "${entityName}" no longer exists in the domain model.`);
  }

  if (depth >= FORM_MAX_DEPTH) {
    return warningContent(entityName, `Maximum nesting depth reached (${FORM_MAX_DEPTH}).`);
  }

  // Detect subtyped entity: has an entityType attr with allowedValues
  const etAttr = entity.attrs.find((a) => a.name === 'entityType' && a.allowedValues && a.allowedValues.length > 0);
  if (etAttr) {
    return buildSubtypedEntityForm(entity, entityName, etAttr, dataPath, existingData, depth);
  }

  // Non-subtyped: render all attributes normally
  const wrap = document.createElement('div');
  wrap.className = 'ca-form-entity-content';
  wrap.dataset.entityName = entityName;

  const data = (existingData && typeof existingData === 'object' ? existingData : {}) as JsonObject;

  for (const attr of entity.attrs) {
    if (attr.type === '_section') continue;
    const info = formTypeInfo(attr.type);
    if (info.kind === 'skip') continue;
    const fieldPath = dataPath ? dataPath + '.' + attr.name : attr.name;
    const el = renderSingleField(attr, fieldPath, data[attr.name], info, depth);
    if (el) wrap.appendChild(el);
  }

  return wrap;
}

/**
 * Build a form for a subtyped entity.
 * Renders entityType as a <select> dropdown, then only shows attributes
 * applicable to the selected subtype.
 */
function buildSubtypedEntityForm(
  entity: ApiEntity,
  entityName: string,
  etAttr: ApiAttr,
  dataPath: string,
  existingData: unknown,
  depth: number,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'ca-form-entity-content';
  wrap.dataset.entityName = entityName;

  const data = (existingData && typeof existingData === 'object' ? existingData : {}) as JsonObject;
  const subtypes = etAttr.allowedValues as string[];

  // Entity-type select dropdown
  const row = document.createElement('div');
  row.className = 'ca-form-field';
  row.appendChild(makeLabel(etAttr));

  const sel = document.createElement('select');
  sel.className = 'ca-form-select';
  sel.dataset.path = dataPath ? dataPath + '.entityType' : 'entityType';
  sel.dataset.ftype = 'string';

  const emptyOpt = document.createElement('option');
  emptyOpt.value = '';
  emptyOpt.textContent = '— select entity type —';
  sel.appendChild(emptyOpt);

  for (const st of subtypes) {
    const opt = document.createElement('option');
    opt.value = st;
    opt.textContent = st;
    sel.appendChild(opt);
  }

  // Pre-select from existing data
  if (data.entityType && subtypes.includes(data.entityType as string)) {
    sel.value = data.entityType as string;
  }

  row.appendChild(sel);
  wrap.appendChild(row);

  // Fields container, re-rendered when entityType changes
  const fieldsContainer = document.createElement('div');
  fieldsContainer.className = 'ca-form-subtype-fields';
  wrap.appendChild(fieldsContainer);

  const renderFields = (selectedSubtype: string): void => {
    fieldsContainer.innerHTML = '';
    if (!selectedSubtype) return;

    for (const attr of entity.attrs) {
      if (attr.type === '_section') continue;
      if (attr.name === 'entityType') continue; // handled by the select

      // Filter by applicableSubtypes
      const applicable = attr.applicableSubtypes;
      if (applicable && applicable.length > 0 && !applicable.includes(selectedSubtype)) continue;

      const info = formTypeInfo(attr.type);
      if (info.kind === 'skip') continue;

      const fieldPath = dataPath ? dataPath + '.' + attr.name : attr.name;
      const el = renderSingleField(attr, fieldPath, data[attr.name], info, depth);
      if (el) fieldsContainer.appendChild(el);
    }
  };

  // Initial render
  if (sel.value) renderFields(sel.value);

  sel.addEventListener('change', () => {
    renderFields(sel.value);
  });

  return wrap;
}

/** Single-field renderer (shared by normal + subtyped paths). */
function renderSingleField(attr: ApiAttr, fieldPath: string, value: unknown, info: TypeInfo, depth: number): HTMLElement | null {
  switch (info.kind) {
    case 'primitive':
      if (attr.codelist) {
        return buildCodelistField(attr, fieldPath, value);
      } else if (attr.sivi && attr.sivi.endsWith('.entityType')) {
        return buildEntityTypeField(attr, fieldPath, value);
      } else {
        return buildPrimitiveField(attr, fieldPath, value, info.base);
      }

    case 'enum':
      return buildEnumField(attr, fieldPath, value, info.base);

    case 'enum-array':
      return buildEnumArrayField(attr, fieldPath, value, info.base);

    case 'entity':
      return buildEntitySection(attr, fieldPath, value, info.base, depth);

    case 'entity-array':
      return buildEntityArraySection(attr, fieldPath, value, info.base, depth);

    case 'unresolved':
      if (attr.codelist) {
        return buildCodelistField(attr, fieldPath, value);
      } else {
        return buildUnresolvedField(attr, fieldPath, value);
      }

    case 'primitive-array':
      if (attr.codelist) {
        return buildCodelistArrayField(attr, fieldPath, value);
      } else {
        return buildPrimitiveArrayField(attr, fieldPath, value, info.base);
      }
  }
  return null;
}

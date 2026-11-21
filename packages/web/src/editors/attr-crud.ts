/**
 * Add and delete attributes of an entity.
 */
import type { RawAttr } from './types.ts';
import { emptyConstraints } from './constraints.ts';
import { renderEntityDetail } from './entity-render.ts';
import { getRawModel } from './model-access.ts';
import { refreshGraph } from '../editor/graph.ts';
import { buildApiSidebar } from '../editor/sidebar.ts';
import { deriveAllChildren, state } from '../editor/state.ts';
import { setDirty } from '../base/model-state.ts';

/* ── Add/Delete Attributes ── */
export function addAttribute(entityName: string): void {
  const model = getRawModel()!;
  const entity = model.entities[entityName];
  if (!entity) return;

  // Detect active subtype filter
  const filterSelect = document.getElementById('caSubtypeFilter') as HTMLSelectElement | null;
  const activeSubtype = filterSelect ? filterSelect.value : '__base__';
  const subtypeDefault = activeSubtype !== '__base__' ? [activeSubtype] : null;

  const existingNames = new Set();
  for (const section of entity.sections || []) {
    for (const attr of section.attributes || []) {
      existingNames.add(attr.name);
    }
  }

  let newName = 'newAttribute';
  let counter = 1;
  while (existingNames.has(newName)) {
    newName = 'newAttribute' + counter;
    counter++;
  }

  if (!entity.sections) entity.sections = [];
  if (entity.sections.length === 0) {
    entity.sections.push({ name: null, attributes: [] });
  }
  const targetSection = entity.sections[entity.sections.length - 1]!;
  if (!targetSection.attributes) targetSection.attributes = [];

  const newRawAttr: RawAttr = {
    name: newName,
    type: 'string',
    ...emptyConstraints(),
    required: false,
    siviReference: null,
    siviCodelist: null,
    allowedValues: null,
    allowedName: null,
    applicableSubtypes: subtypeDefault,
    description: null,
    example: null,
    notes: null,
  };
  targetSection.attributes.push(newRawAttr);

  const rtEntity = state.apiModel![entityName];
  if (rtEntity) {
    rtEntity.attrs.push({
      name: newName,
      type: 'string',
      ...emptyConstraints(),
      required: false,
      sivi: null,
      codelist: null,
      allowedValues: null,
      allowedName: null,
      applicableSubtypes: subtypeDefault,
      description: null,
      example: null,
      note: null,
    });
  }

  setDirty(true);
  deriveAllChildren();
  buildApiSidebar();
  refreshGraph();
  renderEntityDetail(entityName);

  setTimeout(() => {
    const row = document.querySelector(`tr[data-entity="${entityName}"][data-attr="${newName}"]`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const nameCell = row.querySelector<HTMLElement>('td:first-child');
      if (nameCell) nameCell.click();
    }
  }, 50);
}

export function addSiviAttribute(entityName: string): void {
  const model = getRawModel()!;
  const entity = model.entities[entityName];
  if (!entity) return;

  const filterSelect = document.getElementById('caSubtypeFilter') as HTMLSelectElement | null;
  const activeSubtype = filterSelect ? filterSelect.value : '__base__';
  const subtypeDefault = activeSubtype !== '__base__' ? [activeSubtype] : null;

  if (!entity.sections) entity.sections = [];
  if (entity.sections.length === 0) {
    entity.sections.push({ name: null, attributes: [] });
  }
  const targetSection = entity.sections[entity.sections.length - 1]!;
  if (!targetSection.attributes) targetSection.attributes = [];

  const newRawAttr: RawAttr = {
    name: '',
    type: 'string',
    ...emptyConstraints(),
    required: false,
    siviReference: null,
    siviCodelist: null,
    allowedValues: null,
    allowedName: null,
    applicableSubtypes: subtypeDefault,
    description: null,
    example: null,
    notes: null,
  };
  targetSection.attributes.push(newRawAttr);

  const rtEntity = state.apiModel![entityName];
  if (rtEntity) {
    rtEntity.attrs.push({
      name: '',
      type: 'string',
      ...emptyConstraints(),
      required: false,
      sivi: null,
      codelist: null,
      allowedValues: null,
      allowedName: null,
      applicableSubtypes: subtypeDefault,
      description: null,
      example: null,
      note: null,
    });
  }

  setDirty(true);
  renderEntityDetail(entityName);

  setTimeout(() => {
    const row = document.querySelector(`tr[data-entity="${entityName}"][data-attr=""]`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const siviCell = row.querySelector<HTMLElement>('td[data-field="sivi"]');
      if (siviCell) siviCell.click();
    }
  }, 50);
}

export function deleteAttribute(entityName: string, attrName: string): void {
  if (!confirm(`Delete attribute "${attrName}" from ${entityName}?`)) return;

  const model = getRawModel()!;
  const entity = model.entities[entityName];
  if (!entity) return;

  let found = false;
  for (const section of entity.sections || []) {
    const idx = (section.attributes || []).findIndex((a) => a.name === attrName);
    if (idx >= 0) {
      section.attributes!.splice(idx, 1);
      found = true;
      break;
    }
  }

  if (!found) return;

  const rtEntity = state.apiModel![entityName];
  if (rtEntity && rtEntity.attrs) {
    const rtIdx = rtEntity.attrs.findIndex((a) => a.name === attrName);
    if (rtIdx >= 0) rtEntity.attrs.splice(rtIdx, 1);
  }

  setDirty(true);
  deriveAllChildren();
  buildApiSidebar();
  refreshGraph();
  renderEntityDetail(entityName);
}

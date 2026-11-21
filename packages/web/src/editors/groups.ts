/**
 * Sync of the runtime attributes back into the raw model's sections, and
 * management of the group headers (sections) between attributes.
 */
import type { RawAttribute, RawSection } from '@minerva/core';
import { pickConstraints } from './constraints.ts';
import { renderEntityDetail } from './entity-render.ts';
import { getRawModel } from './model-access.ts';
import { escapeHtml } from '../base/ui.ts';
import { setDirty } from '../base/model-state.ts';
import { state } from '../editor/state.ts';

/* ── Sync Runtime attrs → Raw Model sections ── */
export function _syncAttrsToRawSections(entityName: string): void {
  const model = getRawModel()!;
  const entity = model.entities[entityName];
  const rtEntity = state.apiModel![entityName];
  if (!entity || !rtEntity) return;

  // Rebuild sections from the flat attrs array
  const newSections: RawSection[] = [];
  let currentSection: RawSection & { attributes: RawAttribute[] } = { name: null, attributes: [] };
  newSections.push(currentSection);

  for (const a of rtEntity.attrs) {
    if (a.type === '_section') {
      currentSection = { name: a.note || 'Unnamed Group', attributes: [] };
      newSections.push(currentSection);
    } else {
      // Find original raw attribute to preserve all fields
      let rawAttr: RawAttribute | undefined | null = null;
      for (const sec of entity.sections || []) {
        rawAttr = (sec.attributes || []).find((ra) => ra.name === a.name);
        if (rawAttr) break;
      }
      if (!rawAttr) {
        // New attribute not yet in raw model
        rawAttr = {
          name: a.name,
          type: a.type,
          format: a.format || null,
          required: a.required || false,
          siviReference: a.sivi || null,
          siviCodelist: a.codelist || null,
          allowedValues: a.allowedValues || null,
          allowedName: a.allowedName || null,
          applicableSubtypes: a.applicableSubtypes || null,
          description: a.description || null,
          example: a.example || null,
          notes: a.note || null,
          ...pickConstraints(a),
        };
      }
      currentSection.attributes.push(rawAttr);
    }
  }

  entity.sections = newSections;
}

/* ── Group Management ── */
export function addGroup(entityName: string): void {
  const rtEntity = state.apiModel![entityName];
  if (!rtEntity) return;

  const groupName = 'New Group';
  rtEntity.attrs.push({
    name: '_section_' + groupName.toLowerCase().replace(/[^a-z0-9]/g, '_'),
    type: '_section',
    note: groupName,
  });

  _syncAttrsToRawSections(entityName);
  setDirty(true);
  renderEntityDetail(entityName);

  // Auto-start editing the new group label
  setTimeout(() => {
    const rows = document.querySelectorAll(`tr[data-section-entity="${entityName}"]`);
    const lastRow = rows[rows.length - 1];
    if (lastRow) {
      lastRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const label = lastRow.querySelector<HTMLElement>('.ca-section-label');
      if (label) label.click();
    }
  }, 50);
}

export function deleteGroup(entityName: string, sectionKey: string): void {
  if (!confirm('Delete this group header? Attributes will move to the previous group.')) return;

  const rtEntity = state.apiModel![entityName];
  if (!rtEntity) return;

  const idx = rtEntity.attrs.findIndex((a) => a.type === '_section' && a.name === sectionKey);
  if (idx >= 0) {
    rtEntity.attrs.splice(idx, 1);
  }

  _syncAttrsToRawSections(entityName);
  setDirty(true);
  renderEntityDetail(entityName);
}

function renameGroup(entityName: string, sectionKey: string, newName: string): void {
  const rtEntity = state.apiModel![entityName];
  if (!rtEntity) return;

  const section = rtEntity.attrs.find((a) => a.type === '_section' && a.name === sectionKey);
  if (section) {
    section.note = newName;
    section.name = '_section_' + newName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  }

  _syncAttrsToRawSections(entityName);
  setDirty(true);
}

export function makeGroupEditable(labelEl: HTMLElement, entityName: string, sectionKey: string, currentName: string): void {
  if (labelEl.querySelector('input')) return;

  const originalHtml = labelEl.innerHTML;
  labelEl.innerHTML = `<input type="text" class="ca-edit-input ca-group-edit" value="${escapeHtml(currentName)}">`;

  const input = labelEl.querySelector('input')!;
  input.focus();
  input.select();

  const save = () => {
    const newValue = input.value.trim();
    if (newValue && newValue !== currentName) {
      renameGroup(entityName, sectionKey, newValue);
      renderEntityDetail(entityName);
    } else {
      labelEl.innerHTML = originalHtml;
    }
  };

  const cancel = () => {
    labelEl.innerHTML = originalHtml;
  };

  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      input.removeEventListener('blur', save);
      cancel();
    }
  });
}

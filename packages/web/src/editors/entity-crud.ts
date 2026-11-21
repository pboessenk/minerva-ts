/**
 * Entity-level editing: description, create, flags, delete and rename.
 */
import type { RtEntity } from './types.ts';
import { getRawModel } from './model-access.ts';
import { refreshGraph } from '../editor/graph.ts';
import { buildApiSidebar, selectApiEntity, showApiGraphView } from '../editor/sidebar.ts';
import { setDirty } from '../base/model-state.ts';
import { deriveAllChildren, state } from '../editor/state.ts';
import { escapeHtml, showToast } from '../base/ui.ts';

/**
 * Update an entity-level field in both the raw JSON model and runtime model.
 */
function updateEntity(entityName: string, field: string, value: string): boolean {
  const model = getRawModel()!;
  if (!model || !model.entities[entityName]) return false;

  const rawEntity = model.entities[entityName];
  const rtEntity = state.apiModel![entityName];

  switch (field) {
    case 'description':
      rawEntity.description = value;
      if (rtEntity) rtEntity.desc = value;
      break;
    default:
      return false;
  }

  setDirty(true);
  return true;
}

/**
 * Make the entity description editable (click-to-edit).
 */
export function makeDescriptionEditable(el: HTMLElement, entityName: string): void {
  if (el.querySelector('textarea')) return;
  const current = state.apiModel![entityName]?.desc || '';
  const originalHtml = el.innerHTML;

  const ta = document.createElement('textarea');
  ta.className = 'fn-prompt-input';
  ta.style.cssText = 'width:100%;min-height:80px;resize:vertical;margin:0;font-size:14px;';
  ta.value = current;
  ta.title = 'Enter saves — Shift+Enter for a new line';
  ta.placeholder = 'Description… (Shift+Enter for a new line)';
  el.textContent = '';
  el.appendChild(ta);
  ta.focus();

  function save() {
    const val = ta.value.trim();
    updateEntity(entityName, 'description', val);
    el.textContent = val || '(no description — click to edit)';
    el.classList.toggle('ca-cell-placeholder', !val);
  }

  ta.addEventListener('blur', save);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      el.innerHTML = originalHtml;
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      save();
    }
  });
}

/**
 * Create a new entity.
 */
export function createEntity(): void {
  const overlay = document.createElement('div');
  overlay.className = 'fn-prompt-overlay';
  overlay.innerHTML = `
        <div class="fn-prompt">
            <div class="fn-prompt-title">New Entity</div>
            <input class="fn-prompt-input" type="text" placeholder="EntityName (PascalCase)" spellcheck="false" />
            <div class="fn-prompt-actions">
                <button class="fn-prompt-btn fn-prompt-cancel">Cancel</button>
                <button class="fn-prompt-btn fn-prompt-confirm">Create</button>
            </div>
        </div>
    `;
  document.body.appendChild(overlay);

  const input = overlay.querySelector<HTMLInputElement>('.fn-prompt-input')!;
  const confirmBtn = overlay.querySelector<HTMLButtonElement>('.fn-prompt-confirm')!;
  const cancelBtn = overlay.querySelector<HTMLButtonElement>('.fn-prompt-cancel')!;
  input.focus();

  function close() {
    overlay.remove();
  }

  cancelBtn.onclick = close;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  function create() {
    const name = input.value.trim();
    if (!name) return;
    if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) {
      showToast('Entity name must be PascalCase (e.g. "MyEntity")', 'error');
      return;
    }
    if (state.apiModel![name]) {
      showToast('Entity "' + name + '" already exists', 'error');
      return;
    }

    const model = getRawModel()!;

    // Add to raw model (children are derived from attribute types)
    model.entities[name] = {
      description: '',
      sections: [{ name: null, attributes: [] }],
      openPoints: [],
    };

    // Add to runtime model
    // (no root / excludeFromInclusion keys until they are set)
    state.apiModel![name] = {
      desc: '',
      parent: null,
      children: [],
      attrs: [],
      openPoint: null,
      openPoints: [],
    } as unknown as RtEntity;

    setDirty(true);
    close();
    buildApiSidebar();
    selectApiEntity(name);
    refreshGraph();
    showToast('Created entity: ' + name);
  }

  confirmBtn.onclick = create;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') create();
    if (e.key === 'Escape') close();
  });
}

/**
 * Toggle the root flag on an entity.
 */
export function toggleEntityRoot(entityName: string, isRoot: boolean): void {
  const e = state.apiModel![entityName];
  if (!e) return;
  e.root = isRoot;
  const m = getRawModel()!;
  if (m && m.entities[entityName]) m.entities[entityName].root = isRoot;
  setDirty(true);
  buildApiSidebar();
  refreshGraph();
}

/**
 * Toggle the excludeFromInclusion flag on an entity. When true, the entity
 * is treated as a shared/cross-cutting schema (e.g. Error) and will not act
 * as an inclusion trigger for operations during root-filtered exports.
 */
export function toggleEntityExcludeFromInclusion(entityName: string, excluded: boolean): void {
  const e = state.apiModel![entityName];
  if (!e) return;
  if (excluded) e.excludeFromInclusion = true;
  else delete (e as Partial<RtEntity>).excludeFromInclusion;
  const m = getRawModel()!;
  if (m && m.entities[entityName]) {
    if (excluded) m.entities[entityName].excludeFromInclusion = true;
    else delete m.entities[entityName].excludeFromInclusion;
  }
  setDirty(true);
}

/**
 * Delete an entity with referencing-attribute safety check.
 */
export function deleteEntity(entityName: string): void {
  // Check which other entities have attributes referencing this entity type
  const referencedBy: string[] = [];
  for (const [name, e] of Object.entries(state.apiModel!)) {
    if (name === entityName) continue;
    if (e.children && e.children.some((c) => c.name === entityName)) {
      referencedBy.push(name);
    }
  }

  let msg = `Delete entity "${entityName}"?`;
  if (referencedBy.length > 0) {
    msg += `\n\nWarning: Attributes in ${referencedBy.join(', ')} reference this entity.\nThose attributes will keep their type but no longer link to an entity.`;
  }

  if (!confirm(msg)) return;

  const model = getRawModel()!;

  // Remove entity itself
  delete model.entities[entityName];
  delete state.apiModel![entityName];

  // Re-derive children (deleted entity disappears from child links automatically)
  deriveAllChildren();

  setDirty(true);
  buildApiSidebar();
  showApiGraphView();
  refreshGraph();
  showToast('Deleted entity: ' + entityName);
}

/**
 * Rename an entity — updates attribute type references, raw model key.
 */
function renameEntity(entityName: string, newName: string): void {
  if (newName === entityName) return;
  if (!newName || !/^[A-Z][A-Za-z0-9]*$/.test(newName)) {
    showToast('Entity name must be PascalCase', 'error');
    return;
  }
  if (state.apiModel![newName]) {
    showToast('Entity "' + newName + '" already exists', 'error');
    return;
  }

  const model = getRawModel()!;

  // Rename in raw model
  model.entities[newName] = model.entities[entityName]!;
  delete model.entities[entityName];

  // Update attribute types referencing old name in raw model
  for (const [, rawEnt] of Object.entries(model.entities)) {
    for (const section of rawEnt.sections || []) {
      for (const a of section.attributes || []) {
        if (a.type === entityName) a.type = newName;
        else if (a.type === entityName + '[]') a.type = newName + '[]';
      }
    }
  }

  // Rename in runtime model
  state.apiModel![newName] = state.apiModel![entityName]!;
  delete state.apiModel![entityName];

  // Update attribute types referencing old name in runtime model
  for (const [, rtEnt] of Object.entries(state.apiModel!)) {
    for (const a of rtEnt.attrs || []) {
      if (a.type === entityName) a.type = newName;
      else if (a.type === entityName + '[]') a.type = newName + '[]';
    }
  }

  // Re-derive children with updated types
  deriveAllChildren();

  setDirty(true);
  buildApiSidebar();
  selectApiEntity(newName);
  refreshGraph();
}

/**
 * Prompt user for a new entity name, then rename.
 */
export function _promptRenameEntity(entityName: string): void {
  const overlay = document.createElement('div');
  overlay.className = 'fn-prompt-overlay';
  overlay.innerHTML = `
        <div class="fn-prompt">
            <div class="fn-prompt-title">Rename Entity</div>
            <input class="fn-prompt-input" type="text" value="${escapeHtml(entityName)}" spellcheck="false" />
            <div class="fn-prompt-actions">
                <button class="fn-prompt-btn fn-prompt-cancel">Cancel</button>
                <button class="fn-prompt-btn fn-prompt-confirm">Rename</button>
            </div>
        </div>
    `;
  document.body.appendChild(overlay);

  const input = overlay.querySelector<HTMLInputElement>('.fn-prompt-input')!;
  const confirmBtn = overlay.querySelector<HTMLButtonElement>('.fn-prompt-confirm')!;
  const cancelBtn = overlay.querySelector<HTMLButtonElement>('.fn-prompt-cancel')!;
  input.focus();
  input.select();

  function close() {
    overlay.remove();
  }

  cancelBtn.onclick = close;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  function doRename() {
    const newName = input.value.trim();
    close();
    if (newName && newName !== entityName) {
      renameEntity(entityName, newName);
    }
  }

  confirmBtn.onclick = doRename;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doRename();
    if (e.key === 'Escape') close();
  });
}

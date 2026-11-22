/**
 * Enum CRUD: create, delete and rename (the latter also rewrites the types of
 * the attributes that use the enum).
 */
import type { ApiEnum } from '../editor/model-types.ts';
import { getRawModel } from './model-access.ts';
import { showToast } from '../base/ui.ts';
import { refreshGraph } from '../editor/graph.ts';
import { buildApiSidebar, selectApiEntity, showApiGraphView } from '../editor/sidebar.ts';
import { setDirty } from '../base/model-state.ts';
import { state } from '../editor/state.ts';

/**
 * Create a new enum.
 */
export function createEnum(): void {
  const overlay = document.createElement('div');
  overlay.className = 'fn-prompt-overlay';
  overlay.innerHTML = `
        <div class="fn-prompt">
            <div class="fn-prompt-title">New Enum</div>
            <input class="fn-prompt-input" type="text" placeholder="EnumName (PascalCase)" spellcheck="false" />
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
      showToast('Enum name must be PascalCase', 'error');
      return;
    }
    if (state.apiEnums![name]) {
      showToast('Enum "' + name + '" already exists', 'error');
      return;
    }

    const model = getRawModel()!;
    if (!model.enums) model.enums = {};

    // Add to raw model
    model.enums[name] = { description: '', values: [] };

    // Add to runtime model
    state.apiEnums![name] = { desc: '', values: [] } as unknown as ApiEnum;

    setDirty(true);
    close();
    buildApiSidebar();
    selectApiEntity('enum:' + name);
    showToast('Created enum: ' + name);
  }

  confirmBtn.onclick = create;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') create();
    if (e.key === 'Escape') close();
  });
}

/**
 * Delete an enum.
 */
export function deleteEnum(enumName: string): void {
  // Attributes typed with the enum become plain strings: that is what an
  // enum value is on the wire. Their allowed values were a subset of the
  // enum's values, so they go too.
  const usedBy: string[] = [];
  for (const [entityName, rtEnt] of Object.entries(state.apiModel!)) {
    for (const a of rtEnt.attrs || []) {
      if (a.type === enumName || a.type === enumName + '[]') usedBy.push(`${entityName}.${a.name}`);
    }
  }
  let msg = `Delete enum "${enumName}"?`;
  if (usedBy.length > 0) {
    msg += `\n\nAttributes typed ${enumName}: ${usedBy.join(', ')}.\nThey become string attributes, without allowed values.`;
  }
  if (!confirm(msg)) return;

  const model = getRawModel()!;
  delete model.enums![enumName];
  delete state.apiEnums![enumName];

  const retype = (a: { type: string; allowedValues?: string[] | null; allowedName?: string | null }): void => {
    if (a.type !== enumName && a.type !== enumName + '[]') return;
    a.type = a.type.endsWith('[]') ? 'string[]' : 'string';
    a.allowedValues = null;
    a.allowedName = null;
  };
  for (const rawEnt of Object.values(model.entities || {})) {
    for (const section of rawEnt.sections || []) {
      for (const a of section.attributes || []) retype(a);
    }
  }
  for (const rtEnt of Object.values(state.apiModel!)) {
    for (const a of rtEnt.attrs || []) retype(a);
  }

  setDirty(true);
  buildApiSidebar();
  showApiGraphView();
  showToast('Deleted enum: ' + enumName);
}

/**
 * Rename an enum — updates attribute type references in raw + runtime models.
 */
function renameEnum(enumName: string, newName: string): void {
  if (newName === enumName) return;
  if (!newName || !/^[A-Z][A-Za-z0-9]*$/.test(newName)) {
    showToast('Enum name must be PascalCase', 'error');
    return;
  }
  if (state.apiEnums![newName] || state.apiModel![newName]) {
    showToast('Name "' + newName + '" already exists', 'error');
    return;
  }

  const model = getRawModel()!;
  if (!model.enums || !model.enums[enumName]) return;

  // Rename in raw model
  model.enums[newName] = model.enums[enumName];
  delete model.enums![enumName];

  // Update attribute types referencing old name in raw model
  for (const [, rawEnt] of Object.entries(model.entities || {})) {
    for (const section of rawEnt.sections || []) {
      for (const a of section.attributes || []) {
        if (a.type === enumName) a.type = newName;
        else if (a.type === enumName + '[]') a.type = newName + '[]';
      }
    }
  }

  // Rename in runtime model
  state.apiEnums![newName] = state.apiEnums![enumName]!;
  delete state.apiEnums![enumName];

  // Update attribute types referencing old name in runtime model
  for (const [, rtEnt] of Object.entries(state.apiModel!)) {
    for (const a of rtEnt.attrs || []) {
      if (a.type === enumName) a.type = newName;
      else if (a.type === enumName + '[]') a.type = newName + '[]';
    }
  }

  setDirty(true);
  buildApiSidebar();
  selectApiEntity('enum:' + newName);
  refreshGraph();
  showToast('Renamed enum: ' + enumName + ' → ' + newName);
}

/**
 * Prompt user for a new enum name, then rename.
 */
export function _promptRenameEnum(enumName: string): void {
  const overlay = document.createElement('div');
  overlay.className = 'fn-prompt-overlay';
  overlay.innerHTML = `
        <div class="fn-prompt">
            <div class="fn-prompt-title">Rename Enum</div>
            <input class="fn-prompt-input" type="text" spellcheck="false" />
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
  input.value = enumName;
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
    if (!newName || newName === enumName) {
      close();
      return;
    }
    renameEnum(enumName, newName);
    close();
  }

  confirmBtn.onclick = doRename;
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doRename();
    if (e.key === 'Escape') close();
  });
}

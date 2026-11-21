/**
 * Enum values: add, delete, edit inline, and the cascade into the allowed
 * values and subtypes of the attributes that use the enum. Also the enum
 * description.
 */
import { _applySubtypeChanges } from './subtype-changes.ts';
import { _splitPascal, _toSnakeCase } from './enum-names.ts';
import { renderApiEnum } from './enum-render.ts';
import { getRawModel } from './model-access.ts';
import { setDirty } from '../base/model-state.ts';
import { buildApiSidebar } from '../editor/sidebar.ts';
import { showToast } from '../base/ui.ts';
import { state } from '../editor/state.ts';

/**
 * Add a value to an enum.
 */
export function addEnumValue(enumName: string): void {
  const model = getRawModel()!;
  const rawEnum = model.enums?.[enumName];
  const rtEnum = state.apiEnums![enumName];
  if (!rawEnum || !rtEnum) return;

  const overlay = document.createElement('div');
  overlay.className = 'fn-prompt-overlay';
  overlay.innerHTML = `
        <div class="fn-prompt">
            <div class="fn-prompt-title">Add enum value</div>
            <input class="fn-prompt-input ca-ev-codename-input" type="text" placeholder="Name (PascalCase, e.g. OrderHandler)" spellcheck="false" />
            <input class="fn-prompt-input ca-ev-name-input" type="text" placeholder="Value (wire format, e.g. order_handler)" spellcheck="false" />
            <input class="fn-prompt-input ca-ev-caption-input" type="text" placeholder="Label (display, e.g. Order handler)" spellcheck="false" />
            <input class="fn-prompt-input ca-ev-comment-input" type="text" placeholder="Description (optional)" spellcheck="false" />
            <div class="fn-prompt-actions">
                <button class="fn-prompt-btn fn-prompt-cancel">Cancel</button>
                <button class="fn-prompt-btn fn-prompt-confirm">Add</button>
            </div>
        </div>
    `;
  document.body.appendChild(overlay);

  const codeNameInput = overlay.querySelector<HTMLInputElement>('.ca-ev-codename-input')!;
  const nameInput = overlay.querySelector<HTMLInputElement>('.ca-ev-name-input')!;
  const captionInput = overlay.querySelector<HTMLInputElement>('.ca-ev-caption-input')!;
  const commentInput = overlay.querySelector<HTMLInputElement>('.ca-ev-comment-input')!;
  const confirmBtn = overlay.querySelector<HTMLButtonElement>('.fn-prompt-confirm')!;
  const cancelBtn = overlay.querySelector<HTMLButtonElement>('.fn-prompt-cancel')!;
  codeNameInput.focus();

  // Auto-suggest Value (snake_case) and Label (spaced) from Name
  let valueTouched = false;
  let labelTouched = false;
  nameInput.addEventListener('input', () => {
    valueTouched = true;
  });
  captionInput.addEventListener('input', () => {
    labelTouched = true;
  });
  codeNameInput.addEventListener('input', () => {
    const cn = codeNameInput.value.trim();
    if (!valueTouched) nameInput.value = _toSnakeCase(cn);
    if (!labelTouched) captionInput.value = _splitPascal(cn);
  });

  function close() {
    overlay.remove();
  }

  cancelBtn.onclick = close;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const add = () => {
    const codeName = codeNameInput.value.trim();
    const val = nameInput.value.trim();
    if (!codeName) {
      showToast('Name is required', 'error');
      return;
    }
    if (!val) {
      showToast('Value is required', 'error');
      return;
    }
    if (!/^[A-Z][A-Za-z0-9]*$/.test(codeName)) {
      showToast('Name must be PascalCase (e.g. OrderHandler)', 'error');
      return;
    }
    if (rawEnum.values.some((v) => v.value === val)) {
      showToast('Value "' + val + '" already exists', 'error');
      return;
    }
    const caption = captionInput.value.trim() || _splitPascal(codeName);
    const comment = commentInput.value.trim();

    rawEnum.values.push({ name: codeName, value: val, label: caption, description: comment });
    rtEnum.values.push({ codeName: codeName, name: caption, value: val, note: comment || null });

    setDirty(true);
    close();
    renderApiEnum(enumName);
    buildApiSidebar();
  };

  confirmBtn.onclick = add;
  commentInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') add();
    if (e.key === 'Escape') close();
  });
  codeNameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      nameInput.focus();
      e.preventDefault();
    }
    if (e.key === 'Escape') close();
  });
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      captionInput.focus();
      e.preventDefault();
    }
    if (e.key === 'Escape') close();
  });
  captionInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      commentInput.focus();
      e.preventDefault();
    }
    if (e.key === 'Escape') close();
  });
}

/**
 * Delete a value from an enum.
 */
export function deleteEnumValue(enumName: string, valueStr: string): void {
  const model = getRawModel()!;
  const rawEnum = model.enums?.[enumName];
  const rtEnum = state.apiEnums![enumName];
  if (!rawEnum || !rtEnum) return;

  rawEnum.values = rawEnum.values.filter((v) => v.value !== valueStr);
  rtEnum.values = rtEnum.values.filter((v) => v.value !== valueStr);

  // Cascade: drop the value from any attribute's allowedValues list
  _rewriteAllowedValueAcrossAttrs(enumName, valueStr, null);

  setDirty(true);
  renderApiEnum(enumName);
  buildApiSidebar();
}

/**
 * For every attribute typed as `enumName` (or `enumName[]`), rewrite
 * its allowedValues list: replace `oldVal` with `newVal`, or remove
 * the entry entirely when `newVal` is null/empty. Mutates raw + runtime.
 */
function _rewriteAllowedValueAcrossAttrs(enumName: string, oldVal: string, newVal: string | null): void {
  const model = getRawModel()!;
  const matchType = (t: string) => t === enumName || t === enumName + '[]';
  const rewriteList = (list: string[]) => {
    if (!Array.isArray(list)) return list;
    if (newVal && newVal !== oldVal) {
      return list.map((v) => (v === oldVal ? newVal : v));
    }
    // remove
    return list.filter((v) => v !== oldVal);
  };
  for (const [, rawEnt] of Object.entries(model.entities || {})) {
    for (const sec of rawEnt.sections || []) {
      for (const a of sec.attributes || []) {
        if (!matchType(a.type) || !Array.isArray(a.allowedValues)) continue;
        a.allowedValues = rewriteList(a.allowedValues);
        if (a.allowedValues && a.allowedValues.length === 0) a.allowedValues = null;
      }
    }
  }
  for (const [, rtEnt] of Object.entries(state.apiModel || {})) {
    for (const a of rtEnt.attrs || []) {
      if (!matchType(a.type) || !Array.isArray(a.allowedValues)) continue;
      a.allowedValues = rewriteList(a.allowedValues);
      if (a.allowedValues && a.allowedValues.length === 0) a.allowedValues = null;
    }
  }
  // Entities subtyped by this enum: follow the rename / removal in their
  // attributes' applicableSubtypes too
  for (const [entName, rtEnt] of Object.entries(state.apiModel || {})) {
    const etAttr = (rtEnt.attrs || []).find((a) => a.name === 'entityType');
    if (!etAttr || !matchType(etAttr.type)) continue;
    _applySubtypeChanges(entName, newVal && newVal !== oldVal ? { renamed: { [oldVal]: newVal } } : { removed: [oldVal] });
  }
}

/**
 * Edit an existing enum value inline.
 */
export function makeEnumValueEditable(el: HTMLElement, enumName: string, oldValue: string, field: string): void {
  if (el.querySelector('input')) return;
  const model = getRawModel()!;
  const rawEnum = model.enums?.[enumName];
  const rtEnum = state.apiEnums![enumName];
  if (!rawEnum || !rtEnum) return;

  const rawVal = rawEnum.values.find((v) => v.value === oldValue);
  const rtVal = rtEnum.values.find((v) => v.value === oldValue);
  if (!rawVal || !rtVal) return;

  let current: string;
  if (field === 'name') current = rawVal.name || '';
  else if (field === 'value') current = rawVal.value;
  else if (field === 'label') current = rawVal.label || '';
  else current = rawVal.description || '';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'ca-edit-input';
  input.value = current;
  el.textContent = '';
  el.appendChild(input);
  input.focus();
  input.select();

  const save = () => {
    const val = input.value.trim();
    if (field === 'name') {
      const oldName = rawVal.name || '';
      // Auto-update value + label if they still match the derived form
      // of the previous name (i.e. were never manually customized).
      const valueWasDerived = !oldName || rawVal.value === _toSnakeCase(oldName);
      const labelWasDerived = !oldName || (rawVal.label || '') === _splitPascal(oldName);
      rawVal.name = val;
      rtVal.codeName = val;
      if (val && valueWasDerived) {
        const newValue = _toSnakeCase(val);
        if (newValue && !rawEnum.values.some((v) => v !== rawVal && v.value === newValue)) {
          const prevValue = rawVal.value;
          rawVal.value = newValue;
          rtVal.value = newValue;
          if (prevValue !== newValue) {
            _rewriteAllowedValueAcrossAttrs(enumName, prevValue, newValue);
          }
        }
      }
      if (val && labelWasDerived) {
        const newLabel = _splitPascal(val);
        rawVal.label = newLabel;
        rtVal.name = newLabel || val;
      }
    } else if (field === 'value') {
      if (!val) {
        renderApiEnum(enumName);
        return;
      }
      const prevValue = rawVal.value;
      rawVal.value = val;
      rtVal.value = val;
      if (prevValue !== val) {
        _rewriteAllowedValueAcrossAttrs(enumName, prevValue, val);
      }
    } else if (field === 'label') {
      rawVal.label = val;
      rtVal.name = val || rawVal.name || rawVal.value;
    } else {
      rawVal.description = val;
      rtVal.note = val || null;
    }
    setDirty(true);
    renderApiEnum(enumName);
  };

  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') renderApiEnum(enumName);
  });
}

/**
 * Update enum description.
 */
export function updateEnumDescription(el: HTMLElement, enumName: string): void {
  if (el.querySelector('textarea')) return;
  const rtEnum = state.apiEnums![enumName];
  const model = getRawModel()!;
  const rawEnum = model.enums?.[enumName];
  if (!rtEnum || !rawEnum) return;

  const current = rtEnum.desc || '';
  const ta = document.createElement('textarea');
  ta.className = 'fn-prompt-input';
  ta.style.cssText = 'width:100%;min-height:40px;resize:vertical;margin:0;font-size:14px;';
  ta.value = current;
  el.textContent = '';
  el.appendChild(ta);
  ta.focus();

  const save = () => {
    const val = ta.value.trim();
    rawEnum.description = val;
    rtEnum.desc = val;
    setDirty(true);
    renderApiEnum(enumName);
  };

  ta.addEventListener('blur', save);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') renderApiEnum(enumName);
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      save();
    }
  });
}

/**
 * In-cell editing of the attribute table: text cells, the type and format
 * dropdowns, and the delegated click handler that picks the editor for a cell.
 */
import { updateAttribute } from './attr-update.ts';
import { constraintsForAttr } from './constraints.ts';
import { makeConstraintPopup } from './constraint-popup.ts';
import { makeSiviAutocomplete } from './sivi-autocomplete.ts';
import { makeCodelistPicker } from './codelist-picker.ts';
import { makeAllowedValuesPicker } from './allowed-values.ts';
import { makeSubtypesPicker } from './subtypes-picker.ts';
import { hideTruncationTip } from './truncation-tooltip.ts';
import { renderEntityDetail } from './entity-render.ts';
import { hideClTooltip } from '../base/codelist-tooltips.ts';
import { escapeHtml } from '../base/ui.ts';
import { state } from '../editor/state.ts';

/**
 * Make a cell editable. On click, replaces content with an input.
 * On blur/Enter saves, on Escape cancels.
 */
function makeEditable(
  cell: HTMLElement,
  entityName: string,
  attrName: string,
  field: string,
  currentValue: string,
  isMultiline = false,
): void {
  // Prevent double-editing
  if (cell.querySelector('input, textarea')) return;

  // Dismiss any truncation tooltip that may be showing
  hideTruncationTip();

  const originalHtml = cell.innerHTML;
  const displayValue = currentValue || '';

  if (isMultiline) {
    cell.innerHTML = `<textarea class="ca-edit-input ca-edit-textarea">${escapeHtml(displayValue)}</textarea>`;
  } else {
    cell.innerHTML = `<input type="text" class="ca-edit-input" value="${escapeHtml(displayValue)}">`;
  }

  const input = cell.querySelector<HTMLInputElement>('input, textarea')!;
  input.focus();
  input.select();

  const save = () => {
    const newValue = input.value.trim();
    if (newValue !== currentValue) {
      if (updateAttribute(entityName, attrName, field, newValue)) {
        // Re-render the detail view to show updated value
        renderEntityDetail(entityName);
      } else {
        cell.innerHTML = originalHtml;
      }
    } else {
      cell.innerHTML = originalHtml;
    }
  };

  const cancel = () => {
    cell.innerHTML = originalHtml;
  };

  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !isMultiline) {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      input.removeEventListener('blur', save);
      cancel();
    }
  });
}

/**
 * Make a Type cell editable with a dropdown.
 * Options: primitives + entity references (singular + array).
 */
function makeTypeDropdown(cell: HTMLElement, entityName: string, attrName: string, currentValue: string): void {
  if (cell.querySelector('select')) return;

  const originalHtml = cell.innerHTML;

  // Build options: primitives first, then entity refs
  const primitives = ['string', 'number', 'integer', 'boolean', 'Date'];
  const primitiveArrays = ['string[]', 'number[]', 'integer[]', 'boolean[]'];
  const entityNames = Object.keys(state.apiModel!).sort();

  let options = primitives
    .map((t) => `<option value="${escapeHtml(t)}"${currentValue === t ? ' selected' : ''}>${escapeHtml(t)}</option>`)
    .join('');
  options += primitiveArrays
    .map((t) => `<option value="${escapeHtml(t)}"${currentValue === t ? ' selected' : ''}>${escapeHtml(t)}</option>`)
    .join('');

  // Add entity references (singular and array)
  options += '<optgroup label="Entity References">';
  for (const eName of entityNames) {
    const singular = eName;
    const array = eName + '[]';
    options += `<option value="${escapeHtml(singular)}"${currentValue === singular ? ' selected' : ''}>${escapeHtml(singular)}</option>`;
    options += `<option value="${escapeHtml(array)}"${currentValue === array ? ' selected' : ''}>${escapeHtml(array)}</option>`;
  }
  options += '</optgroup>';

  // Add enums
  const enumNames = Object.keys(state.apiEnums || {}).sort();
  if (enumNames.length > 0) {
    options += '<optgroup label="Enums">';
    for (const eName of enumNames) {
      options += `<option value="${escapeHtml(eName)}"${currentValue === eName ? ' selected' : ''}>${escapeHtml(eName)}</option>`;
    }
    options += '</optgroup>';
  }

  cell.innerHTML = `<select class="ca-edit-input ca-edit-select">${options}</select>`;

  const select = cell.querySelector('select')!;
  select.focus();

  const save = () => {
    const newValue = select.value;
    if (newValue !== currentValue) {
      if (updateAttribute(entityName, attrName, 'type', newValue)) {
        renderEntityDetail(entityName);
      } else {
        cell.innerHTML = originalHtml;
      }
    } else {
      cell.innerHTML = originalHtml;
    }
  };

  const cancel = () => {
    cell.innerHTML = originalHtml;
  };

  select.addEventListener('change', save);
  select.addEventListener('blur', save);
  select.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      select.removeEventListener('blur', save);
      cancel();
    }
  });
}

/**
 * Make an attribute Format cell editable with a dropdown.
 * Options depend on the base type (string, number, integer).
 */
function makeFormatDropdown(cell: HTMLElement, entityName: string, attrName: string, currentValue: string, attrType: string): void {
  if (cell.querySelector('select')) return;

  hideTruncationTip();

  const originalHtml = cell.innerHTML;
  const baseType = (attrType || '').replace('[]', '').toLowerCase();

  let formats: string[];
  switch (baseType) {
    case 'string':
      formats = ['', 'date', 'date-time', 'byte', 'uri', 'email', 'uuid', 'password'];
      break;
    case 'number':
      formats = ['', 'float', 'double'];
      break;
    case 'integer':
    case 'int':
      formats = ['', 'int32', 'int64'];
      break;
    default:
      formats = [''];
  }

  const options = formats
    .map((f) => `<option value="${escapeHtml(f)}"${currentValue === f ? ' selected' : ''}>${escapeHtml(f || '(auto)')}</option>`)
    .join('');

  cell.innerHTML = `<select class="ca-edit-input ca-edit-select">${options}</select>`;

  const select = cell.querySelector('select')!;
  select.focus();

  const save = () => {
    const newValue = select.value;
    if (newValue !== currentValue) {
      if (updateAttribute(entityName, attrName, 'format', newValue || null)) {
        renderEntityDetail(entityName);
      } else {
        cell.innerHTML = originalHtml;
      }
    } else {
      cell.innerHTML = originalHtml;
    }
  };

  const cancel = () => {
    cell.innerHTML = originalHtml;
  };

  select.addEventListener('change', save);
  select.addEventListener('blur', save);
  select.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      select.removeEventListener('blur', save);
      cancel();
    }
  });
}

/**
 * Delegated click handler for editable cells.
 * Reads current values from the runtime model at click time.
 */
export function initCellEditing(entityName: string): void {
  const tbody = document.querySelector<HTMLElement>('.ca-attr-table tbody');
  if (!tbody) return;

  tbody.addEventListener('click', (e) => {
    hideClTooltip();
    const cell = (e.target as Element).closest<HTMLElement>('td[data-field]');
    if (!cell) return;
    const row = cell.closest<HTMLElement>('tr[data-attr]');
    if (!row) return;

    const attrName = row.dataset.attr!;
    const field = cell.dataset.field;
    const rtEntity = state.apiModel![entityName];
    if (!rtEntity) return;

    const attr = rtEntity.attrs.find((a) => a.name === attrName);
    if (!attr) return;

    switch (field) {
      case 'name':
        makeEditable(cell, entityName, attrName, 'name', attrName);
        break;
      case 'type':
        makeTypeDropdown(cell, entityName, attrName, attr.type || 'string');
        break;
      case 'sivi':
        makeSiviAutocomplete(cell, entityName, attrName, attr.sivi || '');
        break;
      case 'codelist':
        makeCodelistPicker(cell, entityName, attrName, attr.codelist || '');
        break;
      case 'allowed':
        makeAllowedValuesPicker(cell, entityName, attrName);
        break;
      case 'subtypes':
        makeSubtypesPicker(cell, entityName, attrName);
        break;
      case 'format':
        makeFormatDropdown(cell, entityName, attrName, attr.format || '', attr.type || 'string');
        break;
      case 'constraints':
        if (constraintsForAttr(attr).length === 0) return;
        makeConstraintPopup(entityName, attrName);
        break;
      case 'description':
        makeEditable(cell, entityName, attrName, 'description', attr.description || '', true);
        break;
      case 'example':
        makeEditable(cell, entityName, attrName, 'example', attr.example || '');
        break;
      case 'notes':
        makeEditable(cell, entityName, attrName, 'notes', attr.note || '', true);
        break;
    }
  });
}

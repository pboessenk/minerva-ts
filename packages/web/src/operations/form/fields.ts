/** Controls for single attributes: labels, primitives, enums and plain arrays. */
import { applyFieldConstraints, stampConstraints } from './constraints.ts';
import { truncate } from './type-info.ts';
import { getEnums } from '../model-access.ts';
import type { ApiAttr } from '../../editor/model-types.ts';
import { constraintSummary } from '../../editors/constraints.ts';

/**
 * Build a label element with a rich hover tooltip showing attribute metadata.
 * Tooltip shows: type, description, notes, example, SIVI reference, codelist.
 */
export function makeLabel(attr: ApiAttr): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.className = 'ca-form-label-wrap';

  const label = document.createElement('label');
  label.className = 'ca-form-label' + (attr.required ? ' ca-form-label-req' : '');
  label.textContent = attr.name;
  wrap.appendChild(label);

  // Build tooltip content from available metadata
  const lines: [string, string][] = [];
  lines.push(['Type', attr.type || '—']);
  lines.push(['Required', attr.required ? 'yes' : 'no']);
  if (attr.description) lines.push(['Description', attr.description]);
  if (attr.note) lines.push(['Notes', attr.note]);
  if (attr.example) lines.push(['Example', String(attr.example)]);
  for (const rule of constraintSummary(attr)) {
    const sep = rule.indexOf(': ');
    lines.push([rule.slice(0, sep), rule.slice(sep + 2)]);
  }
  if (attr.sivi) lines.push(['SIVI ref', attr.sivi]);
  if (attr.codelist) lines.push(['Codelist', attr.codelist]);

  const tip = document.createElement('div');
  tip.className = 'ca-form-tooltip';

  const tipTitle = document.createElement('div');
  tipTitle.className = 'ca-form-tooltip-title';
  tipTitle.textContent = attr.name;
  tip.appendChild(tipTitle);

  for (const [key, val] of lines) {
    const row = document.createElement('div');
    row.className = 'ca-form-tooltip-row';
    const k = document.createElement('span');
    k.className = 'ca-form-tooltip-key';
    k.textContent = key;
    const v = document.createElement('span');
    v.className = 'ca-form-tooltip-val';
    v.textContent = val;
    row.appendChild(k);
    row.appendChild(v);
    tip.appendChild(row);
  }

  wrap.appendChild(tip);
  return wrap;
}

/* ── Primitive fields ── */

export function buildPrimitiveField(attr: ApiAttr, fieldPath: string, value: unknown, baseType: string): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'ca-form-field';

  const label = makeLabel(attr);
  row.appendChild(label);

  const defaultVal = value !== undefined && value !== null ? value : '';

  if (baseType === 'boolean') {
    const cbWrap = document.createElement('div');
    cbWrap.className = 'ca-form-checkbox-wrap';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'ca-form-checkbox';
    cb.dataset.path = fieldPath;
    cb.dataset.ftype = 'boolean';

    const cbText = document.createElement('span');
    cbText.className = 'ca-form-checkbox-text';

    // Determine initial state: explicit true/false → set, absent → indeterminate
    const hasValue = value === true || value === false || value === 'true' || value === 'false';
    let cbState: 'indeterminate' | 'true' | 'false';
    if (hasValue) {
      cb.checked = value === true || value === 'true';
      cb.indeterminate = false;
      cbState = cb.checked ? 'true' : 'false';
      cbText.textContent = cbState;
    } else if (attr.required) {
      cb.checked = false;
      cb.indeterminate = false;
      cbState = 'false';
      cbText.textContent = 'false';
    } else {
      cb.checked = false;
      cb.indeterminate = true;
      cbState = 'indeterminate';
      cbText.textContent = 'not set';
      cbWrap.classList.add('ca-form-cb-indeterminate');
    }

    // 3-state cycle: indeterminate → true → false → indeterminate
    // No preventDefault: let the browser toggle, then adjust for the
    // false→indeterminate transition where we need to override.
    cb.addEventListener('click', () => {
      if (cbState === 'indeterminate') {
        // browser already set checked=true, indeterminate=false
        cbState = 'true';
        cbText.textContent = 'true';
        cbWrap.classList.remove('ca-form-cb-indeterminate');
      } else if (cbState === 'true') {
        // browser already set checked=false
        cbState = 'false';
        cbText.textContent = 'false';
      } else if (!attr.required) {
        // was false → back to indeterminate; undo browser toggle
        cbState = 'indeterminate';
        cb.checked = false;
        cb.indeterminate = true;
        cbText.textContent = 'not set';
        cbWrap.classList.add('ca-form-cb-indeterminate');
      } else {
        // required: browser already toggled false→true
        cbState = 'true';
        cbText.textContent = 'true';
      }
    });

    cbWrap.appendChild(cb);
    cbWrap.appendChild(cbText);
    row.appendChild(cbWrap);
  } else {
    const input = document.createElement('input');
    input.className = 'ca-form-input';
    input.dataset.path = fieldPath;
    input.dataset.ftype = baseType;

    if (baseType === 'number') {
      input.type = 'number';
      input.step = 'any';
      if (defaultVal !== '') input.value = String(defaultVal);
    } else if (baseType === 'integer') {
      input.type = 'number';
      input.step = '1';
      if (defaultVal !== '') input.value = String(defaultVal);
    } else if (baseType === 'Date') {
      input.type = 'date';
      if (defaultVal !== '') input.value = String(defaultVal);
    } else {
      input.type = 'text';
      input.value = String(defaultVal);
    }

    input.placeholder = attr.description ? truncate(attr.description, 50) : attr.name;
    input.spellcheck = false;
    applyFieldConstraints(input, attr, baseType);
    row.appendChild(input);
  }

  return row;
}

/* ── Enum fields ── */

export function buildEnumField(attr: ApiAttr, fieldPath: string, value: unknown, enumName: string): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'ca-form-field';
  row.appendChild(makeLabel(attr));

  const sel = document.createElement('select');
  sel.className = 'ca-form-select';
  sel.dataset.path = fieldPath;
  sel.dataset.ftype = 'enum';
  sel.dataset.enumName = enumName;

  // Empty option
  const emptyOpt = document.createElement('option');
  emptyOpt.value = '';
  emptyOpt.textContent = '— select —';
  sel.appendChild(emptyOpt);

  const en = (getEnums() ?? {})[enumName];
  // If the attribute has a scoped allowed-values subset (named type), only
  // show those members in the picker, otherwise the example will fail to
  // type-check against the constrained union / literal type.
  const allowed = attr.allowedValues && attr.allowedValues.length > 0 ? new Set(attr.allowedValues) : null;
  if (en && en.values) {
    for (const v of en.values) {
      if (allowed && !allowed.has(v.value)) continue;
      const opt = document.createElement('option');
      opt.value = v.value;
      opt.textContent = v.name || v.value;
      if (v.note) opt.title = v.note;
      sel.appendChild(opt);
    }
  }

  const defaultVal = value !== undefined && value !== null ? value : '';
  sel.value = String(defaultVal);

  row.appendChild(sel);
  return row;
}

/* ── Enum array (e.g. Role[]) ── */

export function buildEnumArrayField(attr: ApiAttr, fieldPath: string, value: unknown, enumName: string): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'ca-form-field ca-form-enum-array-field';
  row.appendChild(makeLabel(attr));

  const wrap = document.createElement('div');
  wrap.className = 'ca-form-enum-array-wrap';
  wrap.dataset.path = fieldPath;
  wrap.dataset.ftype = 'enum-array';
  wrap.dataset.enumName = enumName;
  stampConstraints(wrap, attr);

  // Tag / chip container
  const tagBox = document.createElement('div');
  tagBox.className = 'ca-form-enum-tags';
  wrap.appendChild(tagBox);

  // Add-row: dropdown + button
  const addRow = document.createElement('div');
  addRow.className = 'ca-form-enum-array-add';

  const sel = document.createElement('select');
  sel.className = 'ca-form-select ca-form-enum-array-select';
  const emptyOpt = document.createElement('option');
  emptyOpt.value = '';
  emptyOpt.textContent = '— add role —';
  sel.appendChild(emptyOpt);

  const en = (getEnums() ?? {})[enumName];
  // Honour the attribute's scoped allowed-values subset, if any.
  const allowed = attr.allowedValues && attr.allowedValues.length > 0 ? new Set(attr.allowedValues) : null;
  if (en && en.values) {
    for (const v of en.values) {
      if (allowed && !allowed.has(v.value)) continue;
      const opt = document.createElement('option');
      opt.value = v.value;
      opt.textContent = (v.codeName || v.name || v.value) + (v.note ? '  (' + v.note + ')' : '');
      sel.appendChild(opt);
    }
  }

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'ca-form-add-btn ca-form-enum-array-add-btn';
  addBtn.textContent = '+ Add';

  addBtn.addEventListener('click', () => {
    if (!sel.value) return;
    addEnumTag(tagBox, sel.value, enumName);
    sel.value = '';
  });

  addRow.appendChild(sel);
  addRow.appendChild(addBtn);
  wrap.appendChild(addRow);

  // Populate from existing data
  const items: unknown[] = Array.isArray(value) ? value : value ? [value] : [];
  for (const v of items) {
    addEnumTag(tagBox, v as string, enumName);
  }

  row.appendChild(wrap);
  return row;
}

/** Append a chip (label text plus remove button) to a tag container. */
export function appendTag(tagBox: HTMLElement, wireValue: string, display: string): void {
  const tag = document.createElement('span');
  tag.className = 'ca-form-enum-tag';
  tag.dataset.value = wireValue;

  const text = document.createElement('span');
  text.textContent = display;
  tag.appendChild(text);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'ca-form-enum-tag-remove';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', () => tag.remove());
  tag.appendChild(removeBtn);

  tagBox.appendChild(tag);
}

/** Add a single enum chip/tag to the tag container. */
function addEnumTag(tagBox: HTMLElement, wireValue: string, enumName: string): void {
  // Look up display label
  let display = wireValue;
  const en = (getEnums() ?? {})[enumName];
  if (en && en.values) {
    const found = en.values.find((v) => v.value === wireValue);
    if (found) display = found.codeName || found.name || found.value;
  }
  appendTag(tagBox, wireValue, display);
}

/* ── Unresolved type ── */

export function buildUnresolvedField(attr: ApiAttr, fieldPath: string, value: unknown): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'ca-form-field';
  row.appendChild(makeLabel(attr));

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'ca-form-input';
  input.dataset.path = fieldPath;
  input.dataset.ftype = 'string';
  input.value = value !== undefined && value !== null ? String(value) : '';
  input.placeholder = attr.name;
  input.spellcheck = false;

  const hint = document.createElement('span');
  hint.className = 'ca-form-type-hint';
  hint.textContent = '(unknown type: ' + attr.type + ')';

  row.appendChild(input);
  row.appendChild(hint);
  return row;
}

/* ── Primitive array (e.g. string[]) ── */

export function buildPrimitiveArrayField(attr: ApiAttr, fieldPath: string, value: unknown, baseType: string): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'ca-form-field';
  row.appendChild(makeLabel(attr));

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'ca-form-input';
  input.dataset.path = fieldPath;
  input.dataset.ftype = 'primitive-array';
  input.dataset.baseType = baseType;
  input.placeholder = 'Comma-separated values';
  input.spellcheck = false;
  stampConstraints(input, attr);

  if (Array.isArray(value)) {
    input.value = value.join(', ');
  } else if (value) {
    input.value = String(value);
  }

  const hint = document.createElement('span');
  hint.className = 'ca-form-type-hint';
  hint.textContent = baseType + '[]';

  row.appendChild(input);
  row.appendChild(hint);
  return row;
}

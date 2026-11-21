/**
 * The "Rules" popup: one dialog for every constraint of an attribute; a
 * section appears only for the families the type supports. Follows the
 * bump-dialog idiom: the Rules column cell is far too narrow for in-cell
 * editing.
 */
import type { Constraints } from './types.ts';
import {
  CONSTRAINT_KEYS,
  _constraintTypeInfo,
  constraintSummary,
  constraintsForAttr,
  emptyConstraints,
  pickConstraints,
} from './constraints.ts';
import { updateAttribute } from './attr-update.ts';
import { renderEntityDetail } from './entity-render.ts';
import { escapeHtml } from '../base/ui.ts';
import { state } from '../editor/state.ts';

// for the families the type supports. Follows the bump-dialog idiom: the
// Rules column cell is far too narrow for in-cell editing.
export function makeConstraintPopup(entityName: string, attrName: string): void {
  const rtEntity = state.apiModel![entityName];
  const attr = rtEntity && rtEntity.attrs.find((a) => a.name === attrName);
  if (!attr) return;
  const keys = constraintsForAttr(attr);
  if (keys.length === 0) return;
  const ti = _constraintTypeInfo(attr);
  const current = pickConstraints(attr);

  const field = (key: string, label: string, extra?: string) => `
        <label class="ca-cons-row">
            <span class="ca-cons-label">${label}</span>
            <input type="text" class="ca-cons-input" data-key="${key}" spellcheck="false" autocomplete="off">
            ${extra || ''}
        </label>`;
  const exclusiveBox = (key: string) => `<label class="ca-cons-excl"><input type="checkbox" data-excl="${key}"> exclusive</label>`;

  let body = '';
  if (ti.isString) {
    body +=
      '<div class="ca-cons-section">String</div>' +
      field('minLength', 'Min length') +
      field('maxLength', 'Max length') +
      field('pattern', 'Pattern');
  }
  if (ti.isNumeric) {
    body +=
      '<div class="ca-cons-section">Value</div>' +
      field('minimum', 'Minimum', exclusiveBox('minimum')) +
      field('maximum', 'Maximum', exclusiveBox('maximum'));
  }
  if (ti.isArray) {
    body += '<div class="ca-cons-section">Items</div>' + field('minItems', 'Min items') + field('maxItems', 'Max items');
  }
  if (keys.includes('default')) {
    body += '<div class="ca-cons-section">Default</div>';
    body += ti.isBoolean
      ? `<label class="ca-cons-row"><span class="ca-cons-label">Default</span>
                <select class="ca-cons-input ca-cons-select" data-key="default">
                    <option value="">(none)</option><option value="true">true</option><option value="false">false</option>
                </select></label>`
      : field('default', 'Default');
  }

  const overlay = document.createElement('div');
  overlay.className = 'ca-av-overlay';
  const popup = document.createElement('div');
  popup.className = 'ca-constraint-popup';
  popup.innerHTML = `
        <div class="ca-bump-title">Rules — ${escapeHtml(attrName)}<span class="ca-cons-type">${escapeHtml(attr.type || '')}</span></div>
        <div class="ca-cons-body">${body}</div>
        <div class="ca-cons-msg"></div>
        <div class="ca-av-footer">
            <button class="ca-av-btn-clear">Clear all</button>
            <button class="ca-av-btn-cancel">Cancel</button>
            <button class="ca-av-btn-save">Save</button>
        </div>`;
  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  const inputs: Record<string, HTMLInputElement | HTMLSelectElement> = {};
  popup.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-key]').forEach((el) => {
    inputs[el.dataset.key!] = el;
  });
  const excl: Record<string, HTMLInputElement> = {};
  popup.querySelectorAll<HTMLInputElement>('[data-excl]').forEach((el) => {
    excl[el.dataset.excl!] = el;
  });
  const msgEl = popup.querySelector('.ca-cons-msg')!;
  const saveBtn = popup.querySelector<HTMLButtonElement>('.ca-av-btn-save')!;
  const clearBtn = popup.querySelector<HTMLButtonElement>('.ca-av-btn-clear')!;

  // Initial values. A bound input shows whichever of the inclusive /
  // exclusive pair is set; the checkbox records which one it was.
  for (const k of ['minLength', 'maxLength', 'pattern', 'minItems', 'maxItems', 'default'] as const) {
    if (inputs[k] && current[k as keyof Constraints] != null) inputs[k].value = String(current[k as keyof Constraints]);
  }
  const seedBound = (inputKey: 'minimum' | 'maximum', exclKey: 'exclusiveMinimum' | 'exclusiveMaximum') => {
    if (!inputs[inputKey]) return;
    const v = current[inputKey] != null ? current[inputKey] : current[exclKey];
    if (v != null) inputs[inputKey].value = String(v);
    excl[inputKey]!.checked = current[inputKey] == null && current[exclKey] != null;
  };
  seedBound('minimum', 'exclusiveMinimum');
  seedBound('maximum', 'exclusiveMaximum');
  clearBtn.disabled = !CONSTRAINT_KEYS.some((k) => current[k] != null && current[k] !== '');

  const NUMBER_RE = /^-?\d+(\.\d+)?$/;

  // Read the form into {key: value|null}; numbers are stored as JSON
  // numbers (a string would break the Go model decoder), pattern and
  // default as strings. Returns the first validation error, if any.
  const readDraft = () => {
    const draft = emptyConstraints();
    const errors: string[] = [];
    const raw = (k: string) => (inputs[k] ? inputs[k].value.trim() : '');
    const count = (k: 'minLength' | 'maxLength' | 'minItems' | 'maxItems', label: string) => {
      const v = raw(k);
      if (v === '') return;
      if (!/^\d+$/.test(v)) {
        errors.push(label + ' must be a whole number of 0 or more');
        return;
      }
      draft[k] = Number(v);
    };
    const bound = (inputKey: 'minimum' | 'maximum', exclKey: 'exclusiveMinimum' | 'exclusiveMaximum', label: string) => {
      const v = raw(inputKey);
      if (v === '') return;
      if (!NUMBER_RE.test(v)) {
        errors.push(label + ' must be a number');
        return;
      }
      const n = Number(v);
      if (ti.isInteger && !Number.isInteger(n)) {
        errors.push(label + ' must be an integer for ' + attr.type);
        return;
      }
      draft[excl[inputKey] && excl[inputKey].checked ? exclKey : inputKey] = n;
    };

    if (ti.isString) {
      count('minLength', 'Min length');
      count('maxLength', 'Max length');
      if (draft.minLength != null && draft.maxLength != null && draft.minLength > draft.maxLength) {
        errors.push('Min length exceeds max length');
      }
      const p = raw('pattern');
      if (p !== '') {
        try {
          new RegExp(p);
          draft.pattern = p;
        } catch (ex) {
          errors.push('Pattern: ' + (ex as Error).message);
        }
      }
    }
    if (ti.isNumeric) {
      bound('minimum', 'exclusiveMinimum', 'Minimum');
      bound('maximum', 'exclusiveMaximum', 'Maximum');
      const lo = draft.minimum != null ? draft.minimum : draft.exclusiveMinimum;
      const hi = draft.maximum != null ? draft.maximum : draft.exclusiveMaximum;
      const anyExcl = draft.exclusiveMinimum != null || draft.exclusiveMaximum != null;
      if (lo != null && hi != null && (anyExcl ? lo >= hi : lo > hi)) {
        errors.push(anyExcl ? 'Minimum must be below maximum when a bound is exclusive' : 'Minimum exceeds maximum');
      }
    }
    if (ti.isArray) {
      count('minItems', 'Min items');
      count('maxItems', 'Max items');
      if (draft.minItems != null && draft.maxItems != null && draft.minItems > draft.maxItems) {
        errors.push('Min items exceeds max items');
      }
    }
    if (keys.includes('default')) {
      const d = raw('default');
      if (d !== '') {
        if (ti.isBoolean) {
          draft.default = d;
        } else if (ti.isNumeric) {
          // The default is stored as text, so an integer attribute needs an
          // integer literal ("1.0" would export as a float).
          const n = Number(d);
          if (!NUMBER_RE.test(d)) errors.push('Default must be a number');
          else if (ti.isInteger && !/^-?\d+$/.test(d)) errors.push('Default must be an integer for ' + attr.type);
          else {
            if (draft.minimum != null && n < draft.minimum) errors.push('Default is below minimum');
            if (draft.exclusiveMinimum != null && n <= draft.exclusiveMinimum) errors.push('Default is not above the exclusive minimum');
            if (draft.maximum != null && n > draft.maximum) errors.push('Default is above maximum');
            if (draft.exclusiveMaximum != null && n >= draft.exclusiveMaximum) errors.push('Default is not below the exclusive maximum');
            draft.default = d;
          }
        } else {
          const len = Array.from(d).length;
          if (draft.minLength != null && len < draft.minLength) errors.push('Default is shorter than min length');
          if (draft.maxLength != null && len > draft.maxLength) errors.push('Default is longer than max length');
          if (draft.pattern != null) {
            try {
              if (!new RegExp(draft.pattern).test(d)) errors.push('Default does not match the pattern');
            } catch {
              /* reported above */
            }
          }
          draft.default = d;
        }
      }
    }
    return { draft, error: errors[0] || '' };
  };

  const validate = () => {
    const { draft, error } = readDraft();
    const summary = constraintSummary(Object.assign({}, attr, draft));
    msgEl.textContent = error || (summary.length ? summary.join(' · ') : 'No rules — saving clears them all.');
    msgEl.className = 'ca-cons-msg' + (error ? ' ca-cons-error' : '');
    saveBtn.disabled = !!error;
    return draft;
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  document.addEventListener('keydown', onKey);

  // Write every changed key through updateAttribute (both graphs), then
  // re-render once. Keys the type no longer supports are nulled as well.
  const commit = (draft: Constraints) => {
    close();
    let changed = false;
    for (const k of CONSTRAINT_KEYS) {
      const next = draft[k] != null ? draft[k] : null;
      const prev = current[k] != null ? current[k] : null;
      if (next === prev) continue;
      if (!updateAttribute(entityName, attrName, k, next)) return;
      changed = true;
    }
    if (changed) renderEntityDetail(entityName);
  };

  popup.addEventListener('input', validate);
  popup.addEventListener('change', validate);
  popup.addEventListener('keydown', (e) => {
    const target = e.target as HTMLInputElement;
    if (e.key === 'Enter' && target.tagName === 'INPUT' && target.type === 'text' && !saveBtn.disabled) {
      commit(readDraft().draft);
    }
  });
  saveBtn.addEventListener('click', () => {
    if (!saveBtn.disabled) commit(readDraft().draft);
  });
  clearBtn.addEventListener('click', () => commit(emptyConstraints()));
  popup.querySelector('.ca-av-btn-cancel')!.addEventListener('click', close);
  popup.addEventListener('click', (e) => e.stopPropagation());
  overlay.addEventListener('click', close);

  validate();
  const first = popup.querySelector<HTMLInputElement | HTMLSelectElement>('.ca-cons-input');
  if (first) {
    first.focus();
    if ('select' in first) first.select();
  }
}

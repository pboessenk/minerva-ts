/** Required-field and rule validation of a rendered example form, shown as a badge with a panel. */
import type { SetConstraints } from '../types.ts';
import { escapeHtml } from '../../base/ui.ts';

interface MissingField {
  label: string;
  fieldPath: string;
  element: HTMLElement;
}

interface ConstraintViolation extends MissingField {
  message: string;
}

type ValidationItem = ({ kind: 'required' } & MissingField & { message?: undefined }) | ({ kind: 'constraint' } & ConstraintViolation);

interface ValidationState {
  badge: HTMLButtonElement | null;
  panel: HTMLDivElement | null;
  debounce: ReturnType<typeof setTimeout> | null;
}

// Created in installValidation().
let state: ValidationState;

export function installValidation(): void {
  state = { badge: null, panel: null, debounce: null };
}

/**
 * Scan a form container for empty required fields.
 */
function scanEmptyRequired(container: HTMLElement | null): MissingField[] {
  const missing: MissingField[] = [];
  if (!container) return missing;

  // Primitive / select / codelist fields with required labels
  container.querySelectorAll('.ca-form-label-req').forEach((label) => {
    const row = label.closest<HTMLElement>('.ca-form-field, .ca-form-field.ca-form-codelist-field');
    if (!row) return;
    // Skip fields inside unchecked optional entities (body hidden)
    const optBody = row.closest<HTMLElement>('.ca-form-optional-body');
    if (optBody && optBody.style.display === 'none') return;

    // Codelist-array or enum-array fields: detect by row class, count tags
    if (row.classList.contains('ca-form-cl-array-field') || row.classList.contains('ca-form-enum-array-field')) {
      const tags = row.getElementsByClassName('ca-form-enum-tag');
      if (tags.length > 0) return; // has selected values
      const wrap = row.querySelector<HTMLElement>('.ca-form-cl-array-wrap, .ca-form-enum-array-wrap');
      missing.push({
        label: label.textContent ?? '',
        fieldPath: wrap ? wrap.dataset.path || '' : '',
        element: wrap || row,
      });
      return;
    }

    const input = row.querySelector<HTMLInputElement>('input[data-path], select[data-path], textarea[data-path]');
    if (input) {
      const ftype = input.dataset.ftype;
      if (ftype === 'boolean') return; // booleans always have a value
      const val = input.value.trim();
      if (!val) {
        missing.push({
          label: label.textContent ?? '',
          fieldPath: input.dataset.path || '',
          element: input,
        });
      }
    }
  });

  // Required entity arrays: check if the array has at least one item
  container.querySelectorAll<HTMLElement>('.ca-form-array[data-ftype="entity-array"]').forEach((section) => {
    if (section.dataset.excluded === 'true') return;
    const items = section.querySelectorAll(':scope > .ca-form-array-items > .ca-form-array-item');
    if (items.length > 0) return;
    // Check if this array's parent entity field is required
    const wrapper = section.closest('.ca-form-entity');
    if (!wrapper) return;
    const summary = wrapper.querySelector(':scope > summary, :scope > .ca-form-optional-header');
    if (summary && summary.querySelector('[style*="color"]')) {
      missing.push({
        label: (section.dataset.path || '').split('.').pop() + '[]',
        fieldPath: section.dataset.path || '',
        element: section,
      });
    }
  });

  return missing;
}

/**
 * Scan a form container for values that violate their attribute constraints
 * (lengths, bounds, pattern, item counts). Empty values and empty arrays are
 * skipped: emptiness is the required-field scanner's job. Never blocks saving.
 */
function scanConstraintViolations(container: HTMLElement | null): ConstraintViolation[] {
  const out: ConstraintViolation[] = [];
  if (!container) return out;
  container.querySelectorAll('.ca-form-invalid').forEach((el) => el.classList.remove('ca-form-invalid'));
  container.querySelectorAll<HTMLInputElement>('[data-constraints]').forEach((el) => {
    const optBody = el.closest<HTMLElement>('.ca-form-optional-body');
    if (optBody && optBody.style.display === 'none') return;
    if (el.dataset.excluded === 'true') return;
    let c: SetConstraints;
    try {
      c = JSON.parse(el.dataset.constraints ?? '') as SetConstraints;
    } catch {
      return;
    }
    const problems: string[] = [];
    const ftype = el.dataset.ftype;
    if (ftype === 'entity-array') {
      checkItemCount(el.querySelectorAll(':scope > .ca-form-array-items > .ca-form-array-item').length, c, problems);
    } else if (ftype === 'enum-array' || ftype === 'codelist-array') {
      checkItemCount(el.getElementsByClassName('ca-form-enum-tag').length, c, problems);
    } else if (ftype === 'primitive-array') {
      const parts = el.value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      checkItemCount(parts.length, c, problems);
      parts.forEach((p) => checkScalarValue(p, el.dataset.baseType, c, problems));
    } else {
      const v = el.value.trim();
      if (v !== '') checkScalarValue(v, ftype, c, problems);
    }
    if (problems.length === 0) return;
    el.classList.add('ca-form-invalid');
    out.push({
      label: (el.dataset.path || '').split('.').pop() ?? '',
      fieldPath: el.dataset.path || '',
      element: el,
      message: problems.join('; '),
    });
  });
  return out;
}

function checkItemCount(n: number, c: SetConstraints, problems: string[]): void {
  if (n > 0 && c.minItems != null && n < c.minItems)
    problems.push('at least ' + c.minItems + ' item' + (c.minItems === 1 ? '' : 's') + ' (has ' + n + ')');
  if (c.maxItems != null && n > c.maxItems)
    problems.push('at most ' + c.maxItems + ' item' + (c.maxItems === 1 ? '' : 's') + ' (has ' + n + ')');
}

function checkScalarValue(v: string, baseType: string | undefined, c: SetConstraints, problems: string[]): void {
  if (baseType === 'number' || baseType === 'integer') {
    const n = Number(v);
    if (Number.isNaN(n)) return;
    if (c.minimum != null && n < c.minimum) problems.push('must be >= ' + c.minimum);
    if (c.exclusiveMinimum != null && n <= c.exclusiveMinimum) problems.push('must be > ' + c.exclusiveMinimum);
    if (c.maximum != null && n > c.maximum) problems.push('must be <= ' + c.maximum);
    if (c.exclusiveMaximum != null && n >= c.exclusiveMaximum) problems.push('must be < ' + c.exclusiveMaximum);
    return;
  }
  const len = Array.from(v).length;
  if (c.minLength != null && len < c.minLength) problems.push('at least ' + c.minLength + ' characters (has ' + len + ')');
  if (c.maxLength != null && len > c.maxLength) problems.push('at most ' + c.maxLength + ' characters (has ' + len + ')');
  if (c.pattern) {
    // Unanchored test, as JSON Schema defines pattern matching.
    try {
      if (!new RegExp(c.pattern).test(v)) problems.push('must match ' + c.pattern);
    } catch {
      /* invalid pattern: nothing to check */
    }
  }
}

/**
 * Initialize the validation badge for an example form container.
 * Call once after the form is built.
 */
export function initFormValidation(formContainer: HTMLElement): void {
  // Remove any previous badge/panel
  if (state.badge) state.badge.remove();
  if (state.panel) state.panel.remove();

  // Badge: small floating pill in the export bar
  const exportBar = document.querySelector('.ca-form-export-bar');
  if (!exportBar) return;

  const badge = document.createElement('button');
  badge.className = 'ca-vbadge';
  badge.title = 'Validation';
  exportBar.appendChild(badge);
  state.badge = badge;

  // Panel: expandable overlay anchored to the badge
  const panel = document.createElement('div');
  panel.className = 'ca-vpanel';
  panel.style.display = 'none';
  document.body.appendChild(panel);
  state.panel = panel;

  badge.addEventListener('click', (e) => {
    e.stopPropagation();
    if (panel.style.display === 'none') {
      positionPanel();
      panel.style.display = '';
    } else {
      panel.style.display = 'none';
    }
  });

  // Close panel on outside click
  document.addEventListener('click', (e) => {
    if (state.panel && state.panel.style.display !== 'none' && !state.panel.contains(e.target as Node | null) && e.target !== state.badge) {
      state.panel.style.display = 'none';
    }
  });

  // Debounced update on form edits
  const update = (): void => {
    if (state.debounce !== null) clearTimeout(state.debounce);
    state.debounce = setTimeout(() => updateValidation(formContainer), 200);
  };
  formContainer.addEventListener('input', update);
  formContainer.addEventListener('change', update);
  formContainer.addEventListener('click', (e) => {
    if ((e.target as Element).closest('button, .ca-form-optional-cb, .ca-form-enum-tag-remove')) {
      setTimeout(() => updateValidation(formContainer), 50);
    }
  });

  // Initial scan
  updateValidation(formContainer);
}

function positionPanel(): void {
  if (!state.badge || !state.panel) return;
  const rect = state.badge.getBoundingClientRect();
  state.panel.style.top = rect.bottom + 6 + 'px';
  state.panel.style.right = window.innerWidth - rect.right + 'px';
}

function updateValidation(container: HTMLElement): void {
  const badge = state.badge;
  if (!badge) return;
  const missing: ValidationItem[] = scanEmptyRequired(container).map((m) => ({ kind: 'required' as const, ...m }));
  const violations: ValidationItem[] = scanConstraintViolations(container).map((v) => ({ kind: 'constraint' as const, ...v }));
  const items = missing.concat(violations);
  const count = items.length;

  if (count === 0) {
    badge.className = 'ca-vbadge ca-vbadge-ok';
    badge.innerHTML = '✓';
    badge.title = 'All required fields filled, no rule violations';
    if (state.panel) {
      state.panel.innerHTML = '<div class="ca-vpanel-empty">✓ All required fields are filled and every value satisfies its rules</div>';
    }
    return;
  }

  const parts: string[] = [];
  if (missing.length) parts.push(missing.length + ' required field' + (missing.length > 1 ? 's' : '') + ' empty');
  if (violations.length) parts.push(violations.length + ' rule violation' + (violations.length > 1 ? 's' : ''));
  const headline = parts.join(', ');
  badge.className = 'ca-vbadge ca-vbadge-warn';
  badge.innerHTML = '⚠ ' + count;
  badge.title = headline;
  const panel = state.panel;
  if (!panel) return;

  panel.innerHTML =
    '<div class="ca-vpanel-header">' +
    escapeHtml(headline) +
    '</div>' +
    '<div class="ca-vpanel-list">' +
    items
      .map(
        (m, i) =>
          '<button class="ca-vpanel-item" data-idx="' +
          i +
          '">' +
          '<span class="ca-vpanel-path">' +
          escapeHtml(m.fieldPath || m.label) +
          '</span>' +
          '<span class="ca-vpanel-msg">' +
          escapeHtml(m.message || 'required, empty') +
          '</span>' +
          '</button>',
      )
      .join('') +
    '</div>';
  // Scroll-to on click
  panel.querySelectorAll('.ca-vpanel-item').forEach((btn, i) => {
    btn.addEventListener('click', () => {
      const el = items[i] && items[i].element;
      if (!el) return;
      // Open any collapsed parent details/optional sections
      let node: HTMLElement | null = el;
      while (node && node !== container) {
        if (node.tagName === 'DETAILS' && !(node as HTMLDetailsElement).open) (node as HTMLDetailsElement).open = true;
        const optBody: HTMLElement | null = node.closest('.ca-form-optional-body');
        if (optBody && optBody.style.display === 'none') {
          const cb = optBody.parentElement?.querySelector<HTMLInputElement>('.ca-form-optional-cb');
          if (cb && !cb.checked) {
            cb.checked = true;
            cb.dispatchEvent(new Event('change'));
          }
        }
        node = node.parentElement;
      }
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ca-vflash');
      setTimeout(() => el.classList.remove('ca-vflash'), 1500);
      panel.style.display = 'none';
    });
  });
}

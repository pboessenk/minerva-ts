/** Picker fields backed by SIVI codelists and SIVI entity sub-types. */
import type { ApiAttr, CodelistCode, EntityTypeSubtype } from '../types.ts';
import { makeLabel, appendTag } from './fields.ts';
import { stampConstraints } from './constraints.ts';
import { getCodelistMap, getEntityTypeData } from '../model-access.ts';
import { loadCodelistData, loadEntityTypeData } from '../../base/model-loader.ts';
import { escapeHtml } from '../../base/ui.ts';

/** Codes of the attribute's codelist, loading the codelist data on demand. */
async function loadCodes(attr: ApiAttr): Promise<CodelistCode[]> {
  const listName = attr.codelist as string;
  if (!getCodelistMap()[listName]) {
    await loadCodelistData();
  }
  const cl = (getCodelistMap() || {})[listName];
  let allCodes = cl && cl.Code ? cl.Code : [];
  // Filter by allowedValues if the attribute defines a subset
  if (attr.allowedValues && attr.allowedValues.length) {
    const allowed = new Set(attr.allowedValues);
    allCodes = allCodes.filter((c) => allowed.has(c.CodeValue || ''));
  }
  return allCodes;
}

/** Markup of one dropdown entry (code plus description). */
function dropdownItemHtml(code: string, desc: string): string {
  return `<div class="ca-form-cl-item" data-code="${escapeHtml(code)}">
                <span class="ca-form-cl-code">${escapeHtml(code)}</span>
                <span class="ca-form-cl-desc">${escapeHtml(desc)}</span>
            </div>`;
}

/**
 * Build a text input with an inline autocomplete dropdown
 * populated from the SIVI codelist entries (Code → CodeValue).
 * The user can also type any value manually.
 */
export function buildCodelistField(attr: ApiAttr, fieldPath: string, value: unknown): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'ca-form-field ca-form-codelist-field';
  row.appendChild(makeLabel(attr));

  const wrap = document.createElement('div');
  wrap.className = 'ca-form-codelist-wrap';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'ca-form-input';
  input.dataset.path = fieldPath;
  input.dataset.ftype = 'string';
  input.spellcheck = false;

  const defaultVal = value !== undefined && value !== null ? value : '';
  input.value = String(defaultVal);
  input.placeholder = attr.codelist + ' code…';

  const dropdown = document.createElement('div');
  dropdown.className = 'ca-form-cl-dropdown';
  dropdown.style.display = 'none';

  wrap.appendChild(input);
  wrap.appendChild(dropdown);
  row.appendChild(wrap);

  /* Codelist loading + filtering */
  let codes: CodelistCode[] | null = null; // lazy
  let justPicked = false;

  const ensureCodes = async (): Promise<void> => {
    if (codes !== null) return;
    codes = await loadCodes(attr);
  };

  const renderCodes = (query: string): void => {
    if (!codes || codes.length === 0) {
      dropdown.innerHTML = '<div class="ca-form-cl-empty">No codelist data</div>';
      dropdown.style.display = 'block';
      return;
    }
    const q = (query || '').toUpperCase();
    const matches = codes.filter(
      (c) => !q || (c.CodeValue || '').toUpperCase().includes(q) || (c.Description || '').toUpperCase().includes(q),
    );

    if (matches.length === 0) {
      dropdown.innerHTML = '<div class="ca-form-cl-empty">No matching codes</div>';
      dropdown.style.display = 'block';
      return;
    }

    dropdown.innerHTML = matches.map((c) => dropdownItemHtml(c.CodeValue || '', c.Description || '')).join('');
    dropdown.style.display = 'block';

    dropdown.querySelectorAll<HTMLElement>('.ca-form-cl-item').forEach((item) => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        justPicked = true;
        input.value = item.dataset.code ?? '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        dropdown.style.display = 'none';
        input.focus();
      });
    });
  };

  const showDropdown = async (): Promise<void> => {
    await ensureCodes();
    renderCodes(input.value.trim());
  };

  input.addEventListener('focus', () => {
    if (!justPicked) void showDropdown();
  });
  input.addEventListener('input', () => {
    if (justPicked) {
      justPicked = false;
      return;
    }
    void showDropdown();
  });
  input.addEventListener('blur', () => {
    // Small delay so mousedown on item fires first
    justPicked = false;
    setTimeout(() => {
      dropdown.style.display = 'none';
    }, 150);
  });

  return row;
}

/**
 * Build a text input with an inline autocomplete dropdown
 * populated from SIVI entity sub-types (e.g. coverage → 115 sub-types).
 * Derives the parent entity name from attr.sivi ("coverage.entityType" → "coverage").
 */
export function buildEntityTypeField(attr: ApiAttr, fieldPath: string, value: unknown): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'ca-form-field ca-form-codelist-field';
  row.appendChild(makeLabel(attr));

  const parentEntity = (attr.sivi as string).replace(/\.entityType$/, '');

  const wrapEl = document.createElement('div');
  wrapEl.className = 'ca-form-codelist-wrap';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'ca-form-input';
  input.dataset.path = fieldPath;
  input.dataset.ftype = 'string';
  input.spellcheck = false;

  const defaultVal = value !== undefined && value !== null ? value : '';
  input.value = String(defaultVal);
  input.placeholder = parentEntity + ' sub-type…';

  const dropdown = document.createElement('div');
  dropdown.className = 'ca-form-cl-dropdown';
  dropdown.style.display = 'none';

  wrapEl.appendChild(input);
  wrapEl.appendChild(dropdown);
  row.appendChild(wrapEl);

  /* Entity-type loading + filtering */
  let subtypes: EntityTypeSubtype[] | null = null; // lazy
  let justPicked = false;

  const ensureSubtypes = async (): Promise<void> => {
    if (subtypes !== null) return;
    if (!getEntityTypeData()?.[parentEntity]) {
      await loadEntityTypeData();
    }
    const entry = (getEntityTypeData() || {})[parentEntity];
    let allSubtypes = entry && entry.subtypes ? entry.subtypes : [];
    // Filter by allowedValues if the attribute defines a subset
    if (attr.allowedValues && attr.allowedValues.length) {
      const allowed = new Set(attr.allowedValues);
      allSubtypes = allSubtypes.filter((s) => allowed.has(s.name || ''));
    }
    subtypes = allSubtypes;
  };

  const renderSubtypes = (query: string): void => {
    if (!subtypes || subtypes.length === 0) {
      dropdown.innerHTML = '<div class="ca-form-cl-empty">No sub-type data</div>';
      dropdown.style.display = 'block';
      return;
    }
    const q = (query || '').toLowerCase();
    const matches = subtypes.filter(
      (s) => !q || (s.name || '').toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q),
    );

    if (matches.length === 0) {
      dropdown.innerHTML = '<div class="ca-form-cl-empty">No matching sub-types</div>';
      dropdown.style.display = 'block';
      return;
    }

    dropdown.innerHTML = matches.map((s) => dropdownItemHtml(s.name || '', s.description || '')).join('');
    dropdown.style.display = 'block';

    dropdown.querySelectorAll<HTMLElement>('.ca-form-cl-item').forEach((item) => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        justPicked = true;
        input.value = item.dataset.code ?? '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        dropdown.style.display = 'none';
        input.focus();
      });
    });
  };

  const showDropdown = async (): Promise<void> => {
    await ensureSubtypes();
    renderSubtypes(input.value.trim());
  };

  input.addEventListener('focus', () => {
    if (!justPicked) void showDropdown();
  });
  input.addEventListener('input', () => {
    if (justPicked) {
      justPicked = false;
      return;
    }
    void showDropdown();
  });
  input.addEventListener('blur', () => {
    justPicked = false;
    setTimeout(() => {
      dropdown.style.display = 'none';
    }, 150);
  });

  return row;
}

/* ── Codelist array (string[] backed by codelist) ── */

export function buildCodelistArrayField(attr: ApiAttr, fieldPath: string, value: unknown): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'ca-form-field ca-form-cl-array-field';
  row.appendChild(makeLabel(attr));

  const wrap = document.createElement('div');
  wrap.className = 'ca-form-cl-array-wrap';
  wrap.dataset.path = fieldPath;
  wrap.dataset.ftype = 'codelist-array';
  wrap.dataset.codelist = attr.codelist as string;
  stampConstraints(wrap, attr);

  // Tag / chip container
  const tagBox = document.createElement('div');
  tagBox.className = 'ca-form-enum-tags';
  wrap.appendChild(tagBox);

  // Add-row: searchable input + dropdown + button
  const addRow = document.createElement('div');
  addRow.className = 'ca-form-cl-array-add';

  const inputWrap = document.createElement('div');
  inputWrap.className = 'ca-form-codelist-wrap';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'ca-form-input ca-form-cl-array-input';
  input.placeholder = attr.codelist + ' code…';
  input.spellcheck = false;

  const dropdown = document.createElement('div');
  dropdown.className = 'ca-form-cl-dropdown';
  dropdown.style.display = 'none';

  inputWrap.appendChild(input);
  inputWrap.appendChild(dropdown);

  const addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'ca-form-add-btn ca-form-cl-array-add-btn';
  addBtn.textContent = '+ Add';

  addRow.appendChild(inputWrap);
  addRow.appendChild(addBtn);
  wrap.appendChild(addRow);

  /* Codelist loading + filtering */
  let codes: CodelistCode[] | null = null;
  let justPicked = false;

  const ensureCodes = async (): Promise<void> => {
    if (codes !== null) return;
    codes = await loadCodes(attr);
  };

  const renderCodes = (query: string): void => {
    if (!codes || codes.length === 0) {
      dropdown.innerHTML = '<div class="ca-form-cl-empty">No codelist data</div>';
      dropdown.style.display = 'block';
      return;
    }
    const q = (query || '').toUpperCase();
    const matches = codes.filter(
      (c) => !q || (c.CodeValue || '').toUpperCase().includes(q) || (c.Description || '').toUpperCase().includes(q),
    );

    if (matches.length === 0) {
      dropdown.innerHTML = '<div class="ca-form-cl-empty">No matching codes</div>';
      dropdown.style.display = 'block';
      return;
    }

    dropdown.innerHTML = matches.map((c) => dropdownItemHtml(c.CodeValue || '', c.Description || '')).join('');
    dropdown.style.display = 'block';

    dropdown.querySelectorAll<HTMLElement>('.ca-form-cl-item').forEach((item) => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        justPicked = true;
        input.value = item.dataset.code ?? '';
        dropdown.style.display = 'none';
      });
    });
  };

  const showDropdown = async (): Promise<void> => {
    await ensureCodes();
    renderCodes(input.value.trim());
  };

  input.addEventListener('focus', () => {
    if (!justPicked) void showDropdown();
  });
  input.addEventListener('input', () => {
    if (justPicked) {
      justPicked = false;
      return;
    }
    void showDropdown();
  });
  input.addEventListener('blur', () => {
    justPicked = false;
    setTimeout(() => {
      dropdown.style.display = 'none';
    }, 150);
  });

  // Add button picks current input value as a tag
  addBtn.addEventListener('click', () => {
    const val = input.value.trim();
    if (!val) return;
    // Prevent duplicates
    const existing = tagBox.querySelectorAll<HTMLElement>('.ca-form-enum-tag');
    for (const t of existing) {
      if (t.dataset.value === val) return;
    }
    addCodelistTag(tagBox, val, codes);
    input.value = '';
  });

  // Populate from existing data synchronously. The chips are what
  // collectFormValues() reads back, so they must exist before any export,
  // save or validation scan runs; the codelist fetch only supplies the
  // descriptions, which are filled in once it settles.
  const items: string[] = Array.isArray(value)
    ? (value as string[])
    : value
      ? String(value)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
  for (const v of items) {
    addCodelistTag(tagBox, v, codes);
  }
  void ensureCodes().then(() => {
    tagBox.querySelectorAll<HTMLElement>('.ca-form-enum-tag').forEach((tag) => {
      const text = tag.querySelector(':scope > span');
      if (text) text.textContent = codelistTagLabel(tag.dataset.value ?? '', codes);
    });
  });

  row.appendChild(wrap);
  return row;
}

/** Chip label: "CODE — Description" once the codelist is loaded, else the bare code. */
function codelistTagLabel(codeValue: string, codes: CodelistCode[] | null): string {
  if (codes) {
    const found = codes.find((c) => (c.CodeValue || '') === codeValue);
    if (found && found.Description) return codeValue + ' — ' + found.Description;
  }
  return codeValue;
}

/** Add a single codelist chip/tag to the tag container. */
function addCodelistTag(tagBox: HTMLElement, codeValue: string, codes: CodelistCode[] | null): void {
  appendTag(tagBox, codeValue, codelistTagLabel(codeValue, codes));
}

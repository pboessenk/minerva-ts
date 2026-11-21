/**
 * Allowed-values picker: restrict an attribute backed by a codelist, a SIVI
 * entityType or an enum to a subset of its values, and name that subset.
 */
import type { SourceValue } from './allowed-values-import.ts';
import type { RawAttribute } from '@minerva/core';
import type { ApiAttr } from '../editor/model-types.ts';
import { findRawAttr, pruneConstraints } from './constraints.ts';
import { _applySubtypeChanges, _diffSubtypes, _effectiveSubtypes } from './subtype-changes.ts';
import { _openAllowedValuesImport } from './allowed-values-import.ts';
import { renderEntityDetail } from './entity-render.ts';
import { codelistByName, codelistList, entityTypes, getRawModel } from './model-access.ts';
import { setDirty } from '../base/model-state.ts';
import { escapeHtml } from '../base/ui.ts';
import { loadCodelistData, loadEntityTypeData } from '../base/model-loader.ts';
import { state } from '../editor/state.ts';

/**
 * Resolve the full list of source values for an attribute.
 * Returns array of { code: string, desc: string }.
 */
async function _resolveSourceValues(attr: ApiAttr): Promise<SourceValue[]> {
  if (attr.codelist) {
    // Codelist source
    if (!codelistList() || codelistList()!.length === 0) {
      await loadCodelistData();
    }
    const cl = (codelistByName() || {})[attr.codelist];
    const codes = cl && cl.Code ? cl.Code : [];
    return codes.map((c) => ({ code: c.CodeValue || c.Value || '', desc: c.Description || '' }));
  }
  if (attr.sivi && attr.sivi.endsWith('.entityType')) {
    // EntityType source
    if (!entityTypes()) {
      await loadEntityTypeData();
    }
    const parentEntity = attr.sivi.replace('.entityType', '');
    const entry = (entityTypes() || {})[parentEntity];
    const subtypes = entry && entry.subtypes ? entry.subtypes : [];
    return subtypes.map((s) => ({ code: s.name || '', desc: s.description || '' }));
  }
  // Enum source (any attribute typed as an enum, scalar or array)
  const enumBase = (attr.type || '').replace(/\[\]$/, '');
  if (state.apiEnums && state.apiEnums![enumBase]) {
    const en = state.apiEnums![enumBase];
    return en.values.map((v) => ({ code: v.value || '', desc: v.note || v.name || '' }));
  }
  return [];
}

/**
 * Open an allowed-values picker popup for the given attribute.
 */
export async function makeAllowedValuesPicker(_cell: HTMLElement, entityName: string, attrName: string): Promise<void> {
  const rtEntity = state.apiModel![entityName];
  if (!rtEntity) return;
  const attr = rtEntity.attrs.find((a) => a.name === attrName);
  if (!attr) return;

  // Check if this attribute has a source (codelist, SIVI entityType, or any enum-typed attr)
  const enumBase = (attr.type || '').replace(/\[\]$/, '');
  const isEnum = !!(state.apiEnums && state.apiEnums![enumBase]);
  if (!attr.codelist && !(attr.sivi && attr.sivi.endsWith('.entityType')) && !isEnum) return;

  const sourceValues = await _resolveSourceValues(attr);
  if (sourceValues.length === 0) return;

  const currentSet = new Set(attr.allowedValues || []);

  // Create overlay (dark backdrop + centered modal container)
  const overlay = document.createElement('div');
  overlay.className = 'ca-av-overlay';
  document.body.appendChild(overlay);

  // Create popup inside overlay so CSS flex centering applies
  const popup = document.createElement('div');
  popup.className = 'ca-av-popup';

  let sourceName: string;
  if (attr.codelist) sourceName = attr.codelist;
  else if (isEnum) sourceName = enumBase + ' enum';
  else sourceName = attr.sivi!.replace('.entityType', '') + ' subtypes';
  const cl = attr.codelist;
  const autoName = entityName + attrName.charAt(0).toUpperCase() + attrName.slice(1) + (cl || '');
  popup.innerHTML = `
        <div class="ca-av-header">
            <div class="ca-av-title">${escapeHtml(sourceName)} — ${sourceValues.length} values</div>
            <input type="text" class="ca-av-filter" placeholder="Filter values…">
        </div>
        <div class="ca-av-actions">
            <button data-action="all">Select all</button>
            <button data-action="none">Clear all</button>
            <button data-action="reset">Reset (allow all)</button>
            <button data-action="import" class="ca-av-import" title="Import a comma-separated list of codes"><svg class="action-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Import</button>
        </div>
        <div class="ca-av-tabs">
            <button class="ca-av-tab active" data-tab="all">All</button>
            <button class="ca-av-tab" data-tab="selected">Selected</button>
            <button class="ca-av-tab" data-tab="unselected">Unselected</button>
        </div>
        <div class="ca-av-list"></div>
        <div class="ca-av-name-section">
            <div class="ca-av-name-row">
                <label class="ca-av-name-label">Enum</label>
                <input type="text" class="ca-av-name-input" value="" placeholder="">
            </div>
            <div class="ca-av-name-hint"></div>
        </div>
        <div class="ca-av-footer">
            <button class="ca-av-btn-cancel">Cancel</button>
            <button class="ca-av-btn-save">Save</button>
        </div>
    `;
  overlay.appendChild(popup);

  const listEl = popup.querySelector('.ca-av-list')!;
  const filterInput = popup.querySelector<HTMLInputElement>('.ca-av-filter')!;
  const nameLabel = popup.querySelector('.ca-av-name-label')!;
  const nameInput = popup.querySelector<HTMLInputElement>('.ca-av-name-input')!;
  const nameHint = popup.querySelector('.ca-av-name-hint')!;

  // Track selections in a working set (don't commit until Save)
  const workingSet = new Set(currentSet);
  let activeTab = 'all';
  let nameMode: 'general' | 'custom' | null = null;

  // Dynamically switch the name section between general (all) and custom (subset)
  const updateNameSection = () => {
    const isAll = workingSet.size === 0;
    const newMode = isAll ? 'general' : 'custom';
    if (newMode === nameMode) return; // no change
    nameMode = newMode;
    if (isAll) {
      if (isEnum) {
        // Enum source has no shared "codelist names" map — the enum
        // itself is the type. Hide the name input in this state.
        nameLabel.textContent = 'Type';
        nameInput.value = enumBase;
        nameInput.placeholder = enumBase;
        nameInput.disabled = true;
        nameHint.textContent = 'All values allowed — attribute uses the enum type directly.';
      } else {
        nameLabel.textContent = 'Enum general';
        nameInput.value = (state.apiCodelistNames && cl && state.apiCodelistNames[cl]) || '';
        nameInput.placeholder = cl || sourceName;
        nameInput.disabled = false;
        nameHint.textContent = 'Shared name for all attributes using this codelist. Leave empty to auto-generate.';
      }
    } else {
      nameLabel.textContent = 'Enum custom';
      nameInput.value = attr.allowedName || '';
      nameInput.placeholder = autoName;
      nameInput.disabled = false;
      nameHint.textContent = 'Per-attribute name for export types. Leave empty to auto-generate.';
    }
  };
  updateNameSection();

  const renderList = (query: string) => {
    const q = (query || '').toUpperCase().trim();
    const filtered = sourceValues.filter((v) => {
      if (activeTab === 'selected' && !workingSet.has(v.code)) return false;
      if (activeTab === 'unselected' && workingSet.has(v.code)) return false;
      return !q || v.code.toUpperCase().includes(q) || v.desc.toUpperCase().includes(q);
    });

    if (filtered.length === 0) {
      listEl.innerHTML = '<div class="ca-av-empty">No matching values</div>';
      return;
    }

    listEl.innerHTML = filtered
      .map((v) => {
        const checked = workingSet.has(v.code) ? 'checked' : '';
        return `<label class="ca-av-item">
                <input type="checkbox" data-code="${escapeHtml(v.code)}" ${checked}>
                <span class="ca-av-item-label">
                    <span class="ca-av-item-code">${escapeHtml(v.code)}</span>
                    ${v.desc ? `<span class="ca-av-item-desc">${escapeHtml(v.desc)}</span>` : ''}
                </span>
            </label>`;
      })
      .join('');
  };

  renderList('');

  filterInput.addEventListener('input', () => renderList(filterInput.value));

  // Tab switching
  popup.querySelectorAll<HTMLElement>('.ca-av-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab!;
      popup.querySelectorAll('.ca-av-tab').forEach((t) => t.classList.toggle('active', t === tab));
      renderList(filterInput.value);
    });
  });

  // Checkbox toggle via event delegation
  listEl.addEventListener('change', (e) => {
    const cb = e.target as HTMLInputElement;
    if (!cb.dataset.code) return;
    if (cb.checked) workingSet.add(cb.dataset.code);
    else workingSet.delete(cb.dataset.code);
    updateNameSection();
  });

  // Action buttons
  popup.querySelector('[data-action="all"]')!.addEventListener('click', () => {
    sourceValues.forEach((v) => workingSet.add(v.code));
    renderList(filterInput.value);
    updateNameSection();
  });
  popup.querySelector('[data-action="none"]')!.addEventListener('click', () => {
    workingSet.clear();
    renderList(filterInput.value);
    updateNameSection();
  });
  popup.querySelector('[data-action="reset"]')!.addEventListener('click', () => {
    // Reset = allow all = null, clear per-attr name but preserve shared general name
    commitAndClose(null, null, true);
  });
  popup.querySelector('[data-action="import"]')!.addEventListener('click', () => {
    _openAllowedValuesImport(sourceValues, workingSet, () => {
      renderList(filterInput.value);
      updateNameSection();
    });
  });

  const commitAndClose = (newAllowedValues: string[] | null, newAllowedName: string | null, isReset: boolean) => {
    overlay.remove();
    const model = getRawModel()!;

    // When saving as "all" (not reset), route name to shared codelistNames
    if (!isReset && newAllowedValues === null && cl) {
      if (!model.codelistNames) model.codelistNames = {};
      if (newAllowedName) {
        model.codelistNames[cl] = newAllowedName;
      } else {
        delete model.codelistNames[cl];
      }
      if (state.apiCodelistNames) {
        state.apiCodelistNames[cl] = newAllowedName || '';
      }
      newAllowedName = null; // Don't store on attribute
    }

    const oldSubtypes = attrName === 'entityType' ? _effectiveSubtypes(attr) : null;
    const entity = model.entities[entityName];
    if (entity) {
      for (const sec of entity.sections || []) {
        const rawAttr: RawAttribute | undefined = (sec.attributes || []).find((a) => a.name === attrName);
        if (rawAttr) {
          rawAttr.allowedValues = newAllowedValues;
          rawAttr.allowedName = newAllowedName;
          break;
        }
      }
    }
    attr.allowedValues = newAllowedValues;
    attr.allowedName = newAllowedName;
    // A named type exports as a $ref schema: element constraints and
    // defaults no longer apply, so drop them on both graphs.
    pruneConstraints(findRawAttr(entityName, attrName), attr);
    // If this is the entityType attribute, carry the added/removed subtypes
    // into the attributes' applicableSubtypes (leaving other choices alone)
    if (attrName === 'entityType') {
      _applySubtypeChanges(entityName, _diffSubtypes(oldSubtypes, _effectiveSubtypes(attr)));
    }
    setDirty(true);
    renderEntityDetail(entityName);
  };

  // Save
  popup.querySelector('.ca-av-btn-save')!.addEventListener('click', () => {
    const arr = Array.from(workingSet).sort();
    const nameVal = nameInput.value.trim() || null;
    commitAndClose(arr.length > 0 ? arr : null, nameVal, false);
  });

  // Cancel
  popup.querySelector('.ca-av-btn-cancel')!.addEventListener('click', () => {
    overlay.remove();
  });

  // Click on backdrop (outside popup) closes
  popup.addEventListener('click', (e) => e.stopPropagation());
  overlay.addEventListener('click', () => overlay.remove());

  filterInput.focus();
}

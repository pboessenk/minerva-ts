/**
 * Checkbox popup that sets which subtypes an attribute applies to.
 */
import { _getSiviSubtypeDefaults } from './sivi.ts';
import { renderEntityDetail } from './entity-render.ts';
import { getRawModel } from './model-access.ts';
import { setDirty } from '../base/model-state.ts';
import { escapeHtml } from '../base/ui.ts';
import { state } from '../editor/state.ts';

/* ── Subtypes Picker ── */

/**
 * Open a small checkbox popup to set which subtypes an attribute applies to.
 */
export function makeSubtypesPicker(_cell: HTMLElement, entityName: string, attrName: string): void {
  const rtEntity = state.apiModel![entityName];
  if (!rtEntity) return;
  const attr = rtEntity.attrs.find((a) => a.name === attrName);
  if (!attr) return;

  // Get allowed subtypes from the entityType attribute
  const etAttr = rtEntity.attrs.find((a) => a.name === 'entityType');
  if (!etAttr || !etAttr.allowedValues || !etAttr.allowedValues.length) return;
  const subtypes = etAttr.allowedValues;

  const currentSet = new Set(attr.applicableSubtypes || []);
  const isAll = currentSet.size === 0;

  // Look up SIVI defaults (intersected with allowed subtypes)
  const siviInfo = _getSiviSubtypeDefaults(entityName, attr.sivi);
  const siviDefaults = siviInfo.defaults;
  const hasSiviDefaults = siviInfo.hasSiviData;

  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'ca-av-overlay';
  document.body.appendChild(overlay);

  const popup = document.createElement('div');
  popup.className = 'ca-av-popup ca-st-popup';

  let siviDefaultsHtml = '';
  if (hasSiviDefaults) {
    const defaultsList =
      siviDefaults.length > 0
        ? siviDefaults.map((s) => `<div class="ca-st-default-item">${escapeHtml(s)}</div>`).join('')
        : '<div class="ca-st-default-item ca-st-default-none">None of your subtypes match SIVI</div>';
    const restoreBtn = siviDefaults.length > 0 ? '<button data-action="restore-sivi">Restore SIVI defaults</button>' : '';
    siviDefaultsHtml = `
            <div class="ca-st-defaults-section">
                <div class="ca-st-defaults-header">
                    <span>SIVI defaults (${siviDefaults.length} of ${subtypes.length})</span>
                    ${restoreBtn}
                </div>
                <div class="ca-st-defaults-list">${defaultsList}</div>
            </div>`;
  }

  popup.innerHTML = `
        <div class="ca-av-header">
            <div class="ca-av-title">Applicable subtypes for ${escapeHtml(attrName)}</div>
        </div>
        <div class="ca-av-actions">
            <button data-action="all">All (shared)</button>
            <button data-action="none">Clear all</button>
        </div>
        <div class="ca-av-list"></div>
        ${siviDefaultsHtml}
        <div class="ca-av-footer">
            <button class="ca-av-btn-cancel">Cancel</button>
            <button class="ca-av-btn-save">Save</button>
        </div>
    `;
  overlay.appendChild(popup);

  const listEl = popup.querySelector('.ca-av-list')!;
  const workingSet = new Set(currentSet);
  let allImplied = isAll; // true = empty set means "all", false = empty set means "none"

  const renderList = () => {
    const allSelected = allImplied && workingSet.size === 0;
    listEl.innerHTML = subtypes
      .map((st) => {
        const checked = allSelected || workingSet.has(st) ? 'checked' : '';
        const isImplied = allSelected;
        return `<label class="ca-av-item${isImplied ? ' ca-st-implied' : ''}">
                <input type="checkbox" data-code="${escapeHtml(st)}" ${checked}>
                <span class="ca-av-item-label">
                    <span class="ca-av-item-code">${escapeHtml(st)}</span>
                </span>
            </label>`;
      })
      .join('');
  };
  renderList();

  listEl.addEventListener('change', (e) => {
    const cb = e.target as HTMLInputElement;
    if (!cb.dataset.code) return;
    // Transition from "all implied" (empty set) to explicit
    if (allImplied && workingSet.size === 0 && !cb.checked) {
      for (const st of subtypes) workingSet.add(st);
      workingSet.delete(cb.dataset.code);
      allImplied = false;
    } else if (cb.checked) {
      workingSet.add(cb.dataset.code);
    } else {
      workingSet.delete(cb.dataset.code);
    }
    renderList();
  });

  popup.querySelector('[data-action="all"]')!.addEventListener('click', () => {
    workingSet.clear();
    allImplied = true;
    renderList();
  });
  popup.querySelector('[data-action="none"]')!.addEventListener('click', () => {
    workingSet.clear();
    allImplied = false;
    renderList();
  });

  if (hasSiviDefaults && siviDefaults.length > 0) {
    popup.querySelector('[data-action="restore-sivi"]')!.addEventListener('click', () => {
      workingSet.clear();
      if (siviDefaults.length < subtypes.length) {
        for (const st of siviDefaults) workingSet.add(st);
      }
      renderList();
    });
  }

  popup.querySelector('.ca-av-btn-save')!.addEventListener('click', () => {
    overlay.remove();
    // If all are checked or none specifically selected, save as null (shared)
    const arr = Array.from(workingSet).sort();
    const newValue = arr.length > 0 && arr.length < subtypes.length ? arr : null;

    // Update raw model
    const model = getRawModel()!;
    const entity = model.entities[entityName];
    if (entity) {
      for (const sec of entity.sections || []) {
        const rawAttr = (sec.attributes || []).find((a) => a.name === attrName);
        if (rawAttr) {
          rawAttr.applicableSubtypes = newValue;
          break;
        }
      }
    }
    // Update runtime model
    attr.applicableSubtypes = newValue;
    setDirty(true);
    renderEntityDetail(entityName);
  });

  popup.querySelector('.ca-av-btn-cancel')!.addEventListener('click', () => {
    overlay.remove();
  });

  popup.addEventListener('click', (e) => e.stopPropagation());
  overlay.addEventListener('click', () => overlay.remove());
}

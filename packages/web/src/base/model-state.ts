/** The raw model JSON as loaded from the server, and whether it has unsaved changes. */
import type { RawModel } from '../editor/model-types.ts';
import { invalidateSearchIndex } from '../editor/search-page.ts';

export type { RawModel };

interface ModelState {
  /** The raw JSON object as loaded from disk. */
  raw: RawModel | null;
  /** True when the model has been modified in memory. */
  dirty: boolean;
  /** Default model path. */
  path: string;
}

let modelState: ModelState;

/** Stores the raw JSON model, after fetching it from the server or loading it from a file. */
export function storeModel(json: RawModel): void {
  modelState.raw = json;
  modelState.dirty = false;
  updateDirtyUI();
}

export function getModel(): RawModel | null {
  return modelState.raw;
}

/** Marks the model as modified (anything but `false`). */
export function setDirty(dirty?: boolean): void {
  modelState.dirty = dirty !== false;
  updateDirtyUI();
  // Invalidate search index so next search re-indexes
  invalidateSearchIndex();
}

export function isDirty(): boolean {
  return modelState.dirty;
}

/** Dirty-state UI: a dot on the Save button. */
function updateDirtyUI(): void {
  const saveBtn = document.getElementById('editorSaveBtn');
  if (saveBtn) {
    const dot = saveBtn.querySelector('.dirty-dot');
    if (modelState.dirty) {
      if (!dot) {
        const d = document.createElement('span');
        d.className = 'dirty-dot';
        saveBtn.appendChild(d);
      }
      saveBtn.classList.add('has-changes');
    } else {
      if (dot) dot.remove();
      saveBtn.classList.remove('has-changes');
    }
  }
}

export function installModelState(): void {
  modelState = {
    raw: null,
    dirty: false,
    path: 'data/api_model.json',
  };

  // Warn before closing tab with unsaved changes
  window.addEventListener('beforeunload', (e) => {
    if (modelState.dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

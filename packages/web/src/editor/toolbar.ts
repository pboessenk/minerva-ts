/**
 * Editor toolbar: Save / Load / Export toolbar rendered above the editor area.
 */
import { exposeFunctions } from '../globals.ts';
import { showApiGraph } from './graph.ts';
import { buildApiSidebar } from './sidebar.ts';
import { loadedModel, rebuildFromRawModel, state } from './state.ts';
import type { JsonValue, RawModel } from '@minerva/core';
import { showToast } from '../base/ui.ts';
import { renderEntityDetail } from '../editors/entity-render.ts';
import { renderApiOperation } from '../operations/op-detail.ts';
import { flushExampleForm, renderApiExample } from '../operations/example-page.ts';
import { renderApiEnum } from '../editors/enum-render.ts';
import { getModel, setDirty, storeModel } from '../base/model-state.ts';

/* ── Editor Toolbar ── */
export function renderEditorToolbar(): void {
  // Only render once — but always refresh the info text
  if (document.getElementById('editorToolbar')) {
    updateToolbarInfo();
    return;
  }
  const main = document.getElementById('main') as HTMLElement;
  const toolbar = document.createElement('div');
  toolbar.id = 'editorToolbar';
  toolbar.className = 'editor-toolbar';
  toolbar.innerHTML = `
        <button id="editorSaveBtn" class="editor-toolbar-btn save-btn" onclick="editorSave()" title="Save model to disk">
            <svg class="toolbar-icon" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save
        </button>
        <button id="editorLoadBtn" class="editor-toolbar-btn load-btn" onclick="editorLoad()" title="Load model from file">
            <svg class="toolbar-icon" viewBox="0 0 24 24"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> Load
        </button>
        <div class="export-dropdown-wrap">
            <button id="editorExportBtn" class="editor-toolbar-btn export-btn" onclick="toggleExportDropdown()" title="Export model">
                <svg class="toolbar-icon" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Export ▾
            </button>
            <div id="exportDropdown" class="export-dropdown">
                <div class="export-dropdown-row">
                    <button class="export-dropdown-item" onclick="editorExport('csv')">
                        CSV<span class="export-desc">CSV spreadsheet</span>
                    </button>
                    <button class="export-copy-btn" onclick="editorExportToClipboard('csv')" title="Copy to clipboard"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
                </div>
                <div class="export-dropdown-row">
                    <button class="export-dropdown-item" onclick="editorExport('typescript')">
                        TypeScript<span class="export-desc">Interfaces + enums</span>
                    </button>
                    <button class="export-copy-btn" onclick="editorExportToClipboard('typescript')" title="Copy to clipboard"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
                </div>
                <div class="export-dropdown-row">
                    <button class="export-dropdown-item" onclick="editorExport('openapi')">
                        OpenAPI 3.1<span class="export-desc">YAML spec with schemas</span>
                    </button>
                    <button class="export-copy-btn" onclick="editorExportToClipboard('openapi')" title="Copy to clipboard"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
                </div>
                <div class="export-dropdown-row">
                    <button class="export-dropdown-item" onclick="editorExport('typespec')">
                        TypeSpec<span class="export-desc">.tsp models + decorators</span>
                    </button>
                    <button class="export-copy-btn" onclick="editorExportToClipboard('typespec')" title="Copy to clipboard"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
                </div>
                <div class="export-dropdown-row">
                    <button class="export-dropdown-item" onclick="editorExport('html')">
                        HTML<span class="export-desc">Standalone browsable spec</span>
                    </button>
                </div>
            </div>
        </div>
        <button id="editorCompareBtn" class="editor-toolbar-btn compare-btn" onclick="showCompareView()" title="Compare model against an OpenAPI contract">
            <svg class="toolbar-icon" viewBox="0 0 24 24"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg> Compare
        </button>
        <div class="editor-toolbar-spacer"></div>
        <span class="editor-toolbar-info" id="editorToolbarInfo"></span>
    `;
  main.insertBefore(toolbar, main.firstChild);

  // Update info text
  updateToolbarInfo();

  // Close export dropdown on outside click
  document.addEventListener('click', (e) => {
    const dd = document.getElementById('exportDropdown');
    if (dd && !(e.target as Element).closest('.export-dropdown-wrap')) {
      dd.classList.remove('visible');
    }
  });
}

export function updateToolbarInfo(): void {
  const info = document.getElementById('editorToolbarInfo');
  if (!info) return;
  const m = getModel();
  if (m) {
    const modified = m.lastModified ? new Date(m.lastModified).toLocaleDateString() : 'unknown';
    info.textContent = `v${m.version || '?'} — last saved ${modified}`;
  }
}

/* ── Save ── */
export async function editorSave(): Promise<boolean> {
  const m = getModel();
  if (!m) {
    showToast('No model loaded', 'error');
    return false;
  }

  // Flush any open example form into memory before serialising
  flushExampleForm();

  // Sync derived children back into raw model for export/ordering
  for (const [name, rtEnt] of Object.entries(loadedModel())) {
    const rawEnt = m.entities[name];
    if (rawEnt) {
      rawEnt.children = (rtEnt.children || []).map((c) => ({
        name: c.name,
        cardinality: c.card,
        condition: c.condition || undefined,
      }));
    }
  }

  // Sync operations back into raw model
  m.operations = (state.apiOps || []).map((op) => ({
    id: op.id,
    method: op.method,
    path: op.path,
    summary: op.summary || undefined,
    description: op.description || undefined,
    tags: op.tags && op.tags.length > 0 ? op.tags : undefined,
    requestBody: op.requestBody || undefined,
    requestBodyArray: op.requestBodyArray || undefined,
    parameters: op.parameters && op.parameters.length > 0 ? op.parameters : undefined,
    responses: op.responses || undefined,
  }));

  // Sync examples back into raw model
  m.examples = (state.apiExamples || [])
    .filter((ex) => ex.id && ex.operationId)
    .map((ex) => ({
      id: ex.id,
      operationId: ex.operationId,
      technicalName: ex.technicalName || undefined,
      summary: ex.summary || undefined,
      parameterValues: ex.parameterValues && Object.keys(ex.parameterValues).length > 0 ? ex.parameterValues : undefined,
      // Example bodies are objects of form values, which are all JSON.
      request: (ex.request || undefined) as JsonValue | undefined,
      response: (ex.response || undefined) as JsonValue | undefined,
      responseCode: ex.responseCode || undefined,
    }));

  // Update lastModified timestamp. The previous value doubles as the
  // optimistic-lock token: it is what this tab last loaded or saved, so
  // the server can detect that another session saved in between.
  const baseLastModified = m.lastModified || '';
  m.lastModified = new Date().toISOString();

  try {
    const apiConfig = state.apiConfig;
    const modelFile = apiConfig && apiConfig.dataPath ? apiConfig.dataPath.split('/').pop() : '';
    const saveUrl = modelFile ? '/api/save?model=' + encodeURIComponent(modelFile) : '/api/save';
    const doPost = (force: boolean): Promise<Response> =>
      fetch(saveUrl + (force ? (saveUrl.includes('?') ? '&' : '?') + 'force=1' : ''), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Base-Last-Modified': baseLastModified },
        body: JSON.stringify(m, null, 2),
      });
    let resp = await doPost(false);
    if (resp.status === 409) {
      let disk = '';
      try {
        disk = ((await resp.json()) as { diskLastModified?: string }).diskLastModified || '';
      } catch {
        /* ignore */
      }
      const overwrite = confirm(
        'The model file on disk changed since this tab loaded it' +
          (disk ? ` (disk: ${disk}, this tab: ${baseLastModified || 'unknown'})` : '') +
          '.\n\nAnother tab or session probably saved in between. Overwrite and lose those changes?',
      );
      if (!overwrite) {
        m.lastModified = baseLastModified; // keep the lock token in sync
        showToast('Save cancelled — reload the page to pick up the newer model', 'error');
        return false;
      }
      resp = await doPost(true);
    }
    if (resp.status === 400) {
      // The server refused the model (constraint validation): show its
      // messages instead of a bare status code.
      const text = await resp.text();
      let errors: string[] = [];
      try {
        errors = (JSON.parse(text) as { errors?: string[] }).errors || [];
      } catch {
        /* plain-text 400 */
      }
      if (errors.length === 0) errors = [text.trim() || 'HTTP 400'];
      console.error('Save rejected:', errors);
      m.lastModified = baseLastModified;
      const more = errors.length > 3 ? `\n(+${errors.length - 3} more, see console)` : '';
      showToast('Save rejected:\n' + errors.slice(0, 3).join('\n') + more, 'error', 8000);
      return false;
    }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    setDirty(false);
    updateToolbarInfo();
    showToast('Model saved to disk');
    return true;
  } catch (err) {
    // The new timestamp never reached disk; restore the lock token so
    // the next attempt does not self-conflict.
    m.lastModified = baseLastModified;
    showToast('Save failed: ' + (err as Error).message, 'error');
    return false;
  }
}

/* ── Load ── */
export function editorLoad(): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = (input.files as FileList)[0];
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text) as RawModel;
      // Validate basic structure
      if (!json.entities || typeof json.entities !== 'object') {
        throw new Error('Missing or invalid "entities" property');
      }
      // Re-load the model
      state.apiModelLoaded = false;
      state.apiModel = null;
      state.apiEnums = null;
      storeModel(json);
      rebuildFromRawModel(json);
      state.apiModelLoaded = true;
      setDirty(true);
      // Re-render
      buildApiSidebar();
      const active = state.apiActiveEntity;
      if (active) {
        if (active.startsWith('enum:')) renderApiEnum(active.slice(5));
        else if (active.startsWith('ex:')) renderApiExample(active.slice(3));
        else if (active.startsWith('op:')) renderApiOperation(active.slice(3));
        else renderEntityDetail(active);
      } else {
        showApiGraph();
      }
      updateToolbarInfo();
      showToast('Loaded: ' + file.name);
    } catch (err) {
      showToast('Load failed: ' + (err as Error).message, 'error');
    }
  };
  input.click();
}

/** Keeps the toolbar functions reachable for the inline handlers of the toolbar markup. */
export function install(): void {
  // These serve inline handlers in the markup (onclick="name(...)" and the like).
  exposeFunctions({
    editorSave,
    editorLoad,
  });
}

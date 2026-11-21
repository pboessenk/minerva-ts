/** Operation and response dialogs: create, edit, delete. */
import { getExamples, getOps, setExamples, setOps } from './model-access.ts';
import { renderApiOperation } from './op-detail.ts';
import { must } from './dom.ts';
import { setDirty } from '../base/model-state.ts';
import { escapeHtml, showToast } from '../base/ui.ts';
import { buildApiSidebar, selectApiEntity, showApiGraphView } from '../editor/sidebar.ts';
export function createOperation(): void {
  const overlay = document.createElement('div');
  overlay.className = 'fn-prompt-overlay';
  overlay.innerHTML = `
        <div class="fn-prompt">
            <div class="fn-prompt-title">New Endpoint</div>
            <select id="opNewMethod" class="fn-prompt-input" style="margin-bottom:8px;">
                <option value="GET">GET</option>
                <option value="POST" selected>POST</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
            </select>
            <input id="opNewPath" class="fn-prompt-input" placeholder="Path, e.g. /order" spellcheck="false" style="margin-bottom:8px;" />
            <input id="opNewId" class="fn-prompt-input" placeholder="Operation ID, e.g. createOrder" spellcheck="false" style="margin-bottom:8px;" />
            <input id="opNewSummary" class="fn-prompt-input" placeholder="Summary (optional)" spellcheck="false" style="margin-bottom:8px;" />
            <input id="opNewTags" class="fn-prompt-input" placeholder="Tags (comma-separated, optional)" spellcheck="false" style="margin-bottom:8px;" />
            <input id="opNewReqBody" class="fn-prompt-input" placeholder="Request body schema (entity name, optional)" spellcheck="false" style="margin-bottom:8px;" />
            <label class="ca-root-toggle" style="margin-bottom:12px;display:flex;"><input type="checkbox" id="opNewReqArray"> Request body is an array</label>
            <div class="fn-prompt-actions">
                <button class="fn-prompt-btn fn-prompt-cancel">Cancel</button>
                <button class="fn-prompt-btn fn-prompt-confirm">Create</button>
            </div>
        </div>
    `;
  document.body.appendChild(overlay);

  const pathInput = must<HTMLInputElement>(overlay, '#opNewPath');
  const idInput = must<HTMLInputElement>(overlay, '#opNewId');
  const confirmBtn = must<HTMLButtonElement>(overlay, '.fn-prompt-confirm');
  const cancelBtn = must<HTMLButtonElement>(overlay, '.fn-prompt-cancel');
  pathInput.focus();

  // Auto-suggest operation ID from method + path
  function suggestId() {
    const method = must<HTMLSelectElement>(overlay, '#opNewMethod').value.toLowerCase();
    const path = pathInput.value
      .replace(/^\//, '')
      .replace(/[^a-zA-Z0-9]/g, ' ')
      .trim();
    if (path) {
      const words = path.split(/\s+/);
      const camel = method + words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
      if (!idInput.dataset.manual) idInput.value = camel;
    }
  }
  pathInput.addEventListener('input', suggestId);
  must<HTMLSelectElement>(overlay, '#opNewMethod').addEventListener('change', suggestId);
  idInput.addEventListener('input', () => {
    idInput.dataset.manual = '1';
  });

  function close() {
    overlay.remove();
  }

  cancelBtn.onclick = close;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const create = () => {
    const id = idInput.value.trim();
    const method = must<HTMLSelectElement>(overlay, '#opNewMethod').value;
    const path = pathInput.value.trim();
    if (!id || !path) {
      showToast('ID and Path are required', 'error');
      return;
    }
    if ((getOps() || []).some((o) => o.id === id)) {
      showToast('Operation ID already exists', 'error');
      return;
    }

    const newOp = {
      id,
      method,
      path,
      summary: must<HTMLInputElement>(overlay, '#opNewSummary').value.trim(),
      description: '',
      tags: must<HTMLInputElement>(overlay, '#opNewTags')
        .value.trim()
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      requestBody: must<HTMLInputElement>(overlay, '#opNewReqBody').value.trim() || null,
      requestBodyArray: must<HTMLInputElement>(overlay, '#opNewReqArray').checked,
      responses: {},
    };
    getOps()!.push(newOp);
    setDirty(true);
    close();
    buildApiSidebar();
    selectApiEntity('op:' + id);
  };

  confirmBtn.onclick = create;
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') create();
  });
}

export function editOperation(opId: string): void {
  const op = (getOps() || []).find((o) => o.id === opId);
  if (!op) return;

  const overlay = document.createElement('div');
  overlay.className = 'fn-prompt-overlay';
  overlay.innerHTML = `
        <div class="fn-prompt">
            <div class="fn-prompt-title">Edit Endpoint</div>
            <select id="opEditMethod" class="fn-prompt-input" style="margin-bottom:8px;">
                <option value="GET" ${op.method === 'GET' ? 'selected' : ''}>GET</option>
                <option value="POST" ${op.method === 'POST' ? 'selected' : ''}>POST</option>
                <option value="PUT" ${op.method === 'PUT' ? 'selected' : ''}>PUT</option>
                <option value="PATCH" ${op.method === 'PATCH' ? 'selected' : ''}>PATCH</option>
                <option value="DELETE" ${op.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
            </select>
            <input id="opEditPath" class="fn-prompt-input" value="${escapeHtml(op.path)}" spellcheck="false" style="margin-bottom:8px;" />
            <input id="opEditId" class="fn-prompt-input" value="${escapeHtml(op.id)}" spellcheck="false" style="margin-bottom:8px;" />
            <input id="opEditTags" class="fn-prompt-input" value="${escapeHtml((op.tags || []).join(', '))}" placeholder="Tags (comma-separated, optional)" spellcheck="false" style="margin-bottom:8px;" />
            <input id="opEditReqBody" class="fn-prompt-input" value="${escapeHtml(op.requestBody || '')}" placeholder="Request body schema (entity, optional)" spellcheck="false" style="margin-bottom:8px;" />
            <label class="ca-root-toggle" style="margin-bottom:12px;display:flex;"><input type="checkbox" id="opEditReqArray" ${op.requestBodyArray ? 'checked' : ''}> Request body is an array</label>
            <div class="fn-prompt-actions">
                <button class="fn-prompt-btn fn-prompt-cancel">Cancel</button>
                <button class="fn-prompt-btn fn-prompt-confirm">Save</button>
            </div>
        </div>
    `;
  document.body.appendChild(overlay);
  must<HTMLInputElement>(overlay, '#opEditPath').focus();

  const confirmBtn = must<HTMLButtonElement>(overlay, '.fn-prompt-confirm');
  const cancelBtn = must<HTMLButtonElement>(overlay, '.fn-prompt-cancel');

  function close() {
    overlay.remove();
  }

  cancelBtn.onclick = close;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const save = () => {
    const newId = must<HTMLInputElement>(overlay, '#opEditId').value.trim();
    const newMethod = must<HTMLSelectElement>(overlay, '#opEditMethod').value;
    const newPath = must<HTMLInputElement>(overlay, '#opEditPath').value.trim();
    if (!newId || !newPath) {
      showToast('ID and Path are required', 'error');
      return;
    }

    // If ID changed, check uniqueness and update example references
    if (newId !== op.id) {
      if ((getOps() || []).some((o) => o.id === newId)) {
        showToast('Operation ID already exists', 'error');
        return;
      }
      (getExamples() || []).forEach((ex) => {
        if (ex.operationId === op.id) ex.operationId = newId;
      });
    }

    op.id = newId;
    op.method = newMethod;
    op.path = newPath;
    op.tags = must<HTMLInputElement>(overlay, '#opEditTags')
      .value.trim()
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    op.requestBody = must<HTMLInputElement>(overlay, '#opEditReqBody').value.trim() || null;
    op.requestBodyArray = must<HTMLInputElement>(overlay, '#opEditReqArray').checked;
    setDirty(true);
    close();
    buildApiSidebar();
    selectApiEntity('op:' + newId);
  };

  confirmBtn.onclick = save;
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') save();
  });
}

export function deleteOperation(opId: string): void {
  const op = (getOps() || []).find((o) => o.id === opId);
  if (!op) return;
  const exCount = (getExamples() || []).filter((ex) => ex.operationId === opId).length;
  const msg = exCount > 0 ? `Delete "${op.method} ${op.path}" and its ${exCount} example(s)?` : `Delete "${op.method} ${op.path}"?`;
  if (!confirm(msg)) return;

  setOps(getOps()!.filter((o) => o.id !== opId));
  setExamples((getExamples() || []).filter((ex) => ex.operationId !== opId));
  setDirty(true);
  buildApiSidebar();
  showApiGraphView();
}

export function addResponse(opId: string): void {
  const op = (getOps() || []).find((o) => o.id === opId);
  if (!op) return;

  const overlay = document.createElement('div');
  overlay.className = 'fn-prompt-overlay';
  overlay.innerHTML = `
        <div class="fn-prompt">
            <div class="fn-prompt-title">Add Response</div>
            <input id="respNewCode" class="fn-prompt-input" placeholder="HTTP status code, e.g. 200" spellcheck="false" style="margin-bottom:8px;" />
            <input id="respNewDesc" class="fn-prompt-input" placeholder="Description" spellcheck="false" style="margin-bottom:8px;" />
            <input id="respNewSchema" class="fn-prompt-input" placeholder="Schema (entity name, optional)" spellcheck="false" />
            <label class="fn-prompt-checkbox"><input type="checkbox" id="respNewArray"> Response body is an array</label>
            <div class="fn-prompt-actions">
                <button class="fn-prompt-btn fn-prompt-cancel">Cancel</button>
                <button class="fn-prompt-btn fn-prompt-confirm">Add</button>
            </div>
        </div>
    `;
  document.body.appendChild(overlay);
  must<HTMLInputElement>(overlay, '#respNewCode').focus();

  const confirmBtn = must<HTMLButtonElement>(overlay, '.fn-prompt-confirm');
  const cancelBtn = must<HTMLButtonElement>(overlay, '.fn-prompt-cancel');

  function close() {
    overlay.remove();
  }

  cancelBtn.onclick = close;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const add = () => {
    const code = must<HTMLInputElement>(overlay, '#respNewCode').value.trim();
    if (!code) {
      showToast('Status code is required', 'error');
      return;
    }
    if (!op.responses) op.responses = {};
    const isArr = must<HTMLInputElement>(overlay, '#respNewArray').checked;
    op.responses[code] = {
      description: must<HTMLInputElement>(overlay, '#respNewDesc').value.trim(),
      schema: must<HTMLInputElement>(overlay, '#respNewSchema').value.trim() || undefined,
      responseBodyArray: isArr || undefined,
    };
    setDirty(true);
    close();
    renderApiOperation(opId);
  };

  confirmBtn.onclick = add;
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter') add();
  });
}

export function toggleRespArray(opId: string, code: string, isArray: boolean): void {
  const op = (getOps() || []).find((o) => o.id === opId);
  if (!op || !op.responses || !op.responses[code]) return;
  op.responses[code].responseBodyArray = isArray;
  setDirty(true);
}

export function deleteResponse(opId: string, code: string): void {
  const op = (getOps() || []).find((o) => o.id === opId);
  if (!op || !op.responses) return;
  if (!confirm(`Delete response ${code}?`)) return;
  delete op.responses[code];
  setDirty(true);
  renderApiOperation(opId);
}

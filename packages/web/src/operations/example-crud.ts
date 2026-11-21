/** Example dialogs: create, import, quick-add response example, edit, delete. */
import { getExamples, getOps, setExamples } from './model-access.ts';
import { prepareExampleImport, prepareResponseImport } from './example-form.ts';
import type { ImportResult } from './example-form.ts';
import { renderApiOperation } from './op-detail.ts';
import { defaultRespCode } from './responses.ts';
import { must } from './dom.ts';
import { buildApiSidebar, selectApiEntity } from '../editor/sidebar.ts';
import { setDirty } from '../base/model-state.ts';
import { escapeHtml, showToast } from '../base/ui.ts';
export function createExample(operationId: string): void {
  const overlay = document.createElement('div');
  overlay.className = 'fn-prompt-overlay';
  overlay.innerHTML = `
        <div class="fn-prompt">
            <div class="fn-prompt-title">New Example</div>
            <input id="exNewId" class="fn-prompt-input" placeholder="Example ID (slug), e.g. basic-order" spellcheck="false" style="margin-bottom:8px;" />
            <input id="exNewTechName" class="fn-prompt-input" placeholder="Technical name (export identifier), e.g. basicOrder" spellcheck="false" style="margin-bottom:8px;" />
            <input id="exNewSummary" class="fn-prompt-input" placeholder="Description, e.g. An order with one item" spellcheck="false" />
            <div class="fn-prompt-actions">
                <button class="fn-prompt-btn fn-prompt-cancel">Cancel</button>
                <button class="fn-prompt-btn fn-prompt-confirm">Create</button>
            </div>
        </div>
    `;
  document.body.appendChild(overlay);

  const input = must<HTMLInputElement>(overlay, '#exNewId');
  const confirmBtn = must<HTMLButtonElement>(overlay, '.fn-prompt-confirm');
  const cancelBtn = must<HTMLButtonElement>(overlay, '.fn-prompt-cancel');
  input.focus();

  function close() {
    overlay.remove();
  }

  cancelBtn.onclick = close;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const create = () => {
    const id = must<HTMLInputElement>(overlay, '#exNewId').value.trim();
    const techName = must<HTMLInputElement>(overlay, '#exNewTechName').value.trim();
    const summary = must<HTMLInputElement>(overlay, '#exNewSummary').value.trim();
    if (!id) {
      showToast('Example ID is required', 'error');
      return;
    }
    if ((getExamples() || []).some((e) => e.id === id)) {
      showToast('Example ID already exists', 'error');
      return;
    }

    const op = (getOps() || []).find((o) => o.id === operationId);
    const newEx = {
      id,
      operationId,
      technicalName: techName || '',
      summary: summary || id,
      request: null,
      response: null,
      responseCode: defaultRespCode(op),
    };
    if (!getExamples()) setExamples([]);
    getExamples()!.push(newEx);
    setDirty(true);
    close();
    buildApiSidebar();
    selectApiEntity('ex:' + id);
  };

  confirmBtn.onclick = create;
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter') create();
  });
}

export function importExample(operationId: string): void {
  const op = (getOps() || []).find((o) => o.id === operationId);
  if (!op || !op.requestBody) {
    showToast('This operation has no request body', 'error');
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'fn-prompt-overlay';
  overlay.innerHTML = `
        <div class="fn-prompt" style="width:560px">
            <div class="fn-prompt-title">Import Example</div>
            <div class="ca-imp-state-input">
                <input id="exImpId" class="fn-prompt-input" placeholder="Example ID (slug), e.g. basic-order" spellcheck="false" style="margin-bottom:8px;" />
                <input id="exImpTechName" class="fn-prompt-input" placeholder="Technical name (export identifier), e.g. basicOrder" spellcheck="false" style="margin-bottom:8px;" />
                <input id="exImpSummary" class="fn-prompt-input" placeholder="Description, e.g. An order with one item" spellcheck="false" style="margin-bottom:8px;" />
                <textarea class="fn-prompt-input" rows="12" spellcheck="false"
                    style="min-height:200px;resize:vertical;font-size:12px;line-height:1.5;"
                    placeholder="Paste the request body JSON (e.g. ${op.requestBodyArray ? `an array of ${escapeHtml(op.requestBody)} objects` : `an ${escapeHtml(op.requestBody)} payload`})"></textarea>
                <div class="fn-prompt-error" style="display:none"></div>
                <div class="fn-prompt-actions">
                    <button class="fn-prompt-btn fn-prompt-cancel">Cancel</button>
                    <button class="fn-prompt-btn fn-prompt-confirm" data-action="review">Review</button>
                </div>
            </div>
            <div class="ca-imp-state-review" style="display:none">
                <div class="ca-imp-review"></div>
                <div class="fn-prompt-actions">
                    <button class="fn-prompt-btn fn-prompt-cancel" data-action="back">Back</button>
                    <button class="fn-prompt-btn fn-prompt-confirm" data-action="create">Create</button>
                </div>
            </div>
        </div>`;
  document.body.appendChild(overlay);

  const titleEl = must<HTMLElement>(overlay, '.fn-prompt-title');
  const inputState = must<HTMLElement>(overlay, '.ca-imp-state-input');
  const reviewState = must<HTMLElement>(overlay, '.ca-imp-state-review');
  const reviewEl = must<HTMLElement>(overlay, '.ca-imp-review');
  const createBtn = must<HTMLButtonElement>(overlay, '[data-action="create"]');
  const ta = must<HTMLTextAreaElement>(overlay, 'textarea');
  const errEl = must<HTMLElement>(overlay, '.fn-prompt-error');
  let pendingImport: Extract<ImportResult, { ok: true }> | null = null; // { cleaned, dropped } awaiting Create (null in input state)

  function showError(msg: string) {
    errEl.textContent = msg; // textContent: message may echo user-pasted text
    errEl.style.display = 'block';
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || (e.target as HTMLElement).tagName !== 'TEXTAREA')) {
      e.preventDefault();
      if (reviewState.style.display === 'none') review();
      else if (!createBtn.disabled) createImported();
    }
  }

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }

  const review = () => {
    const id = must<HTMLInputElement>(overlay, '#exImpId').value.trim();
    if (!id) {
      showError('Example ID is required');
      return;
    }
    if ((getExamples() || []).some((e) => e.id === id)) {
      showError('Example ID already exists');
      return;
    }

    const res = prepareExampleImport(op, ta.value);
    if (!res.ok) {
      showError(res.error);
      return;
    }

    const unit = op.requestBodyArray ? 'item(s)' : 'top-level field(s)';
    let html = `<div class="ca-imp-note">Matched against <span class="ca-imp-code">${escapeHtml(res.entityName)}</span>: ${res.matchedCount} of ${res.totalCount} ${unit} recognized.</div>`;
    if (res.dropped.length > 0) {
      const shown = res.dropped.slice(0, 30);
      const rows = shown.map((p) => `<div class="ca-imp-row"><span class="ca-imp-code">${escapeHtml(p)}</span></div>`).join('');
      const more =
        res.dropped.length > 30
          ? `<div class="ca-imp-row"><span class="ca-imp-desc">…and ${res.dropped.length - 30} more</span></div>`
          : '';
      html += `<div class="ca-imp-section-h ca-imp-removed">Will be dropped (${res.dropped.length})</div><div class="ca-imp-list">${rows}${more}</div>`;
    }
    html += res.notes.map((n) => `<div class="ca-imp-note">${escapeHtml(n)}</div>`).join('');

    const nothingMatched = res.matchedCount === 0 && res.totalCount > 0;
    if (nothingMatched) {
      html += `<div class="ca-imp-note ca-imp-removed">No fields matched — check the payload or the operation.</div>`;
    }
    reviewEl.innerHTML = html;
    createBtn.disabled = nothingMatched;
    pendingImport = nothingMatched ? null : res;
    titleEl.textContent = 'Review import';
    inputState.style.display = 'none';
    reviewState.style.display = '';
    (nothingMatched ? must<HTMLButtonElement>(overlay, '[data-action="back"]') : createBtn).focus();
  };

  const back = () => {
    pendingImport = null;
    createBtn.disabled = false;
    titleEl.textContent = 'Import Example';
    reviewState.style.display = 'none';
    inputState.style.display = '';
    ta.focus();
  };

  const createImported = () => {
    if (!pendingImport) return;
    const id = must<HTMLInputElement>(overlay, '#exImpId').value.trim();
    const techName = must<HTMLInputElement>(overlay, '#exImpTechName').value.trim();
    const summary = must<HTMLInputElement>(overlay, '#exImpSummary').value.trim();
    if ((getExamples() || []).some((e) => e.id === id)) {
      showToast('Example ID already exists', 'error');
      return;
    }

    const newEx = {
      id,
      operationId,
      technicalName: techName || '',
      summary: summary || id,
      request: pendingImport.cleaned,
      response: null,
      responseCode: defaultRespCode(op),
    };
    if (!getExamples()) setExamples([]);
    getExamples()!.push(newEx);
    setDirty(true);
    const droppedCount = pendingImport.dropped.length;
    close();
    buildApiSidebar();
    selectApiEntity('ex:' + id);
    showToast(`Imported example "${id}"` + (droppedCount ? ` — ${droppedCount} field(s) dropped` : ''));
  };

  ta.addEventListener('input', () => {
    errEl.style.display = 'none';
  });
  overlay.querySelectorAll('input').forEach((el) =>
    el.addEventListener('input', () => {
      errEl.style.display = 'none';
    }),
  );
  must<HTMLButtonElement>(overlay, '[data-action="review"]').addEventListener('click', review);
  must<HTMLButtonElement>(overlay, '[data-action="back"]').addEventListener('click', back);
  createBtn.addEventListener('click', createImported);
  must<HTMLButtonElement>(overlay, '.fn-prompt-cancel:not([data-action])').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);
  must<HTMLInputElement>(overlay, '#exImpId').focus();
}

/**
 * Build a unique example id from a base string (slugified). Returns '' when
 * the base yields no usable slug so the caller can try a fallback.
 */
export function uniqueExampleId(base: string): string {
  const slug = (base || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) return '';
  let id = slug,
    n = 2;
  while ((getExamples() || []).some((e) => e.id === id)) id = `${slug}-${n++}`;
  return id;
}

/**
 * Quick-add dialog for a response body example on one status code of an
 * operation. Creates a normal response-only entry in apiExamples
 * (request: null, responseCode: code) so it flows through the existing
 * @opExample / OpenAPI example export paths.
 */
export function addResponseExample(opId: string, code: string): void {
  const op = (getOps() || []).find((o) => o.id === opId);
  if (!op || !op.responses || !op.responses[code]) return;
  const resp = op.responses[code];
  if (!resp.schema) {
    showToast('This response has no schema', 'error');
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'fn-prompt-overlay';
  overlay.innerHTML = `
        <div class="fn-prompt" style="width:560px">
            <div class="fn-prompt-title">New ${escapeHtml(code)} Response Example</div>
            <input id="exRespSummary" class="fn-prompt-input" placeholder="Summary, e.g. Returns ${escapeHtml(code)} when …" spellcheck="false" style="margin-bottom:8px;" />
            <textarea class="fn-prompt-input" rows="12" spellcheck="false"
                style="min-height:200px;resize:vertical;font-size:12px;line-height:1.5;"
                placeholder="Paste the response body JSON (${resp.responseBodyArray ? `an array of ${escapeHtml(resp.schema)} objects` : `a ${escapeHtml(resp.schema)} payload`})"></textarea>
            <div class="fn-prompt-error" style="display:none"></div>
            <div class="fn-prompt-actions">
                <button class="fn-prompt-btn fn-prompt-cancel">Cancel</button>
                <button class="fn-prompt-btn fn-prompt-confirm">Save</button>
            </div>
        </div>`;
  document.body.appendChild(overlay);

  const ta = must<HTMLTextAreaElement>(overlay, 'textarea');
  const summaryEl = must<HTMLInputElement>(overlay, '#exRespSummary');
  const errEl = must<HTMLElement>(overlay, '.fn-prompt-error');
  // textContent on purpose: the message may echo user-pasted text
  function showError(msg: string) {
    errEl.textContent = msg;
    errEl.style.display = 'block';
  }
  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || (e.target as HTMLElement).tagName !== 'TEXTAREA')) {
      e.preventDefault();
      save();
    }
  }

  const save = () => {
    const summary = summaryEl.value.trim();
    if (!summary) {
      showError('Summary is required — it becomes the example title in the exports.');
      return;
    }
    const res = prepareResponseImport(op, code, ta.value);
    if (!res.ok) {
      showError(res.error);
      return;
    }
    const id = uniqueExampleId(summary) || uniqueExampleId(`${opId}-${code}-example`);
    const technicalName = id
      .split('-')
      .map((w, i) => (i ? w.charAt(0).toUpperCase() + w.slice(1) : w))
      .join('');
    setExamples(getExamples() || []);
    getExamples()!.push({
      id,
      operationId: opId,
      technicalName,
      summary,
      parameterValues: {},
      request: null,
      response: res.cleaned,
      responseCode: code,
    });
    setDirty(true);
    close();
    buildApiSidebar();
    renderApiOperation(opId);
    const droppedCount = res.dropped ? res.dropped.length : 0;
    showToast(`Example "${id}" added to ${code}` + (droppedCount ? ` — ${droppedCount} field(s) dropped` : ''));
  };

  ta.addEventListener('input', () => {
    errEl.style.display = 'none';
  });
  summaryEl.addEventListener('input', () => {
    errEl.style.display = 'none';
  });
  must<HTMLButtonElement>(overlay, '.fn-prompt-confirm').addEventListener('click', save);
  must<HTMLButtonElement>(overlay, '.fn-prompt-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);
  summaryEl.focus();
}

export function editExampleMeta(exId: string): void {
  const ex = (getExamples() || []).find((e) => e.id === exId);
  if (!ex) return;

  const overlay = document.createElement('div');
  overlay.className = 'fn-prompt-overlay';
  overlay.innerHTML = `
        <div class="fn-prompt">
            <div class="fn-prompt-title">Edit Example</div>
            <input id="exEditId" class="fn-prompt-input" value="${escapeHtml(ex.id)}" spellcheck="false" style="margin-bottom:8px;" />
            <input id="exEditTechName" class="fn-prompt-input" value="${escapeHtml(ex.technicalName || '')}" placeholder="Technical name (export identifier)" spellcheck="false" style="margin-bottom:8px;" />
            <input id="exEditSummary" class="fn-prompt-input" value="${escapeHtml(ex.summary || '')}" placeholder="Description" spellcheck="false" style="margin-bottom:8px;" />
            <select id="exEditOp" class="fn-prompt-input">
                ${(getOps() || []).map((o) => `<option value="${escapeHtml(o.id)}" ${o.id === ex.operationId ? 'selected' : ''}>${escapeHtml(o.method)} ${escapeHtml(o.path)} (${escapeHtml(o.id)})</option>`).join('')}
            </select>
            <div class="fn-prompt-actions">
                <button class="fn-prompt-btn fn-prompt-cancel">Cancel</button>
                <button class="fn-prompt-btn fn-prompt-confirm">Save</button>
            </div>
        </div>
    `;
  document.body.appendChild(overlay);

  const confirmBtn = must<HTMLButtonElement>(overlay, '.fn-prompt-confirm');
  const cancelBtn = must<HTMLButtonElement>(overlay, '.fn-prompt-cancel');
  must<HTMLInputElement>(overlay, '#exEditId').focus();

  function close() {
    overlay.remove();
  }

  cancelBtn.onclick = close;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const save = () => {
    const newId = must<HTMLInputElement>(overlay, '#exEditId').value.trim();
    const newTechName = must<HTMLInputElement>(overlay, '#exEditTechName').value.trim();
    const newSummary = must<HTMLInputElement>(overlay, '#exEditSummary').value.trim();
    const newOpId = must<HTMLSelectElement>(overlay, '#exEditOp').value;
    if (!newId) {
      showToast('Example ID is required', 'error');
      return;
    }
    if (newId !== ex.id && (getExamples() || []).some((e) => e.id === newId)) {
      showToast('Example ID already exists', 'error');
      return;
    }

    ex.id = newId;
    ex.technicalName = newTechName;
    ex.summary = newSummary || newId;
    ex.operationId = newOpId;
    setDirty(true);
    close();
    buildApiSidebar();
    selectApiEntity('ex:' + newId);
  };

  confirmBtn.onclick = save;
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') save();
  });
}

export function deleteExample(exId: string): void {
  const ex = (getExamples() || []).find((e) => e.id === exId);
  if (!ex) return;
  if (!confirm(`Delete example "${ex.summary || ex.id}"?`)) return;

  const opId = ex.operationId;
  setExamples(getExamples()!.filter((e) => e.id !== exId));
  setDirty(true);
  buildApiSidebar();
  selectApiEntity('op:' + opId);
}

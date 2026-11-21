/** Re-ordering and duplicating examples. */
import { getExamples, getOps } from './model-access.ts';
import { flushExampleForm } from './example-page.ts';
import { defaultRespCode } from './responses.ts';
import { must } from './dom.ts';
import type { ApiExample } from './types.ts';
import { escapeHtml, showToast } from '../base/ui.ts';
import { buildApiSidebar, selectApiEntity } from '../editor/sidebar.ts';
import { setDirty } from '../base/model-state.ts';
import { state } from '../editor/state.ts';
/**
 * Move example `exId` within its operation's group. `targetExId` is a sibling
 * (same operationId) to drop before (`after` false) or after (`after` true);
 * `null` means "make it the first example of the operation".
 * Mutates apiExamples in place: the flat, interleaved array is the persisted and
 * exported order. Returns false when the visible order would not change, so
 * callers can skip setDirty() and the re-render.
 */
export function moveExample(exId: string, targetExId: string | null, after: boolean): boolean {
  const all = getExamples() || [];
  const fromIdx = all.findIndex((e) => e.id === exId);
  if (fromIdx < 0) return false;
  const ex = all[fromIdx] as ApiExample;
  const group = all.filter((e) => e.operationId === ex.operationId); // this operation's examples, in order
  const rest = group.filter((e) => e !== ex); // ...without the dragged one
  const gFrom = group.indexOf(ex);
  let gTo = 0; // slot in `rest` to insert before
  if (targetExId != null) {
    const target = rest.find((e) => e.id === targetExId);
    if (!target) return false; // itself, unknown, or another operation
    gTo = rest.indexOf(target) + (after ? 1 : 0);
  }
  if (gTo === gFrom) return false; // same visible slot: no-op
  all.splice(fromIdx, 1);
  const insertAt =
    gTo < rest.length
      ? all.indexOf(rest[gTo] as ApiExample) // right before the sibling in that slot
      : all.indexOf(rest[rest.length - 1] as ApiExample) + 1; // after the group's last sibling
  all.splice(insertAt, 0, ex);
  return true;
}

/** First of `${base}`, `${base}${sep}2`, `${base}${sep}3`, … that `taken(name)` rejects. */
export function uniqueName(base: string, taken: (name: string) => boolean, sep: string): string {
  let name = base,
    n = 2;
  while (taken(name)) name = `${base}${sep}${n++}`;
  return name;
}

/** Plain-JSON deep copy of example data. Keeps _typeMap, unlike stripTypeMap in example-form.js. */
export function deepCopy<T>(v: T): T {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}

/**
 * Duplicate an example: a popup asks for the new id / technical name / summary,
 * then a deep copy of the source (request, response, parameter values and
 * response code) is added to the same operation.
 */
export function duplicateExample(exId: string): void {
  const src = (getExamples() || []).find((e) => e.id === exId);
  if (!src) return;

  const idTaken = (id: string) => (getExamples() || []).some((e) => e.id === id);
  const techTaken = (name: string) => (getExamples() || []).some((e) => (e.technicalName || '') === name);
  const suggestedId = uniqueName(src.id + '-copy', idTaken, '-');
  const suggestedTech = src.technicalName ? uniqueName(src.technicalName + 'Copy', techTaken, '') : '';
  const suggestedSummary = (src.summary || src.id) + ' (copy)';

  const overlay = document.createElement('div');
  overlay.className = 'fn-prompt-overlay';
  overlay.innerHTML = `
        <div class="fn-prompt">
            <div class="fn-prompt-title">Duplicate Example</div>
            <p class="fn-prompt-hint">Copy of <b>${escapeHtml(src.summary || src.id)}</b>: the request, response and parameter values are copied.</p>
            <input id="exDupId" class="fn-prompt-input" value="${escapeHtml(suggestedId)}" placeholder="Example ID (slug), e.g. basic-order" spellcheck="false" style="margin-bottom:8px;" />
            <input id="exDupTechName" class="fn-prompt-input" value="${escapeHtml(suggestedTech)}" placeholder="Technical name (export identifier), e.g. basicOrder" spellcheck="false" style="margin-bottom:8px;" />
            <input id="exDupSummary" class="fn-prompt-input" value="${escapeHtml(suggestedSummary)}" placeholder="Description, e.g. An order with one item" spellcheck="false" />
            <div class="fn-prompt-error" style="display:none"></div>
            <div class="fn-prompt-actions">
                <button class="fn-prompt-btn fn-prompt-cancel">Cancel</button>
                <button class="fn-prompt-btn fn-prompt-confirm">Duplicate</button>
            </div>
        </div>
    `;
  document.body.appendChild(overlay);

  const idEl = must<HTMLInputElement>(overlay, '#exDupId');
  const techEl = must<HTMLInputElement>(overlay, '#exDupTechName');
  const summaryEl = must<HTMLInputElement>(overlay, '#exDupSummary');
  const errEl = must<HTMLElement>(overlay, '.fn-prompt-error');
  // textContent on purpose: the message echoes user input
  function showError(msg: string) {
    errEl.textContent = msg;
    errEl.style.display = 'block';
  }
  function close() {
    overlay.remove();
  }

  const duplicate = () => {
    const id = idEl.value.trim();
    const techName = techEl.value.trim();
    const summary = summaryEl.value.trim();
    if (!id) {
      showError('Example ID is required');
      return;
    }
    if (idTaken(id)) {
      showError(`Example ID "${id}" already exists`);
      return;
    }
    const clash = techName ? (getExamples() || []).find((e) => e.technicalName === techName) : null;
    if (clash) {
      showError(
        `Technical name "${techName}" is already used by example "${clash.id}". It must be unique: it becomes the OpenAPI example key and the TypeScript export name.`,
      );
      return;
    }

    // The open example form may hold unsaved edits; pull them into src first.
    if (state.apiActiveEntity === 'ex:' + src.id) flushExampleForm();

    const op = (getOps() || []).find((o) => o.id === src.operationId);
    getExamples()!.push({
      id,
      operationId: src.operationId,
      technicalName: techName,
      summary: summary || id,
      parameterValues: deepCopy(src.parameterValues) || {},
      request: deepCopy(src.request),
      response: deepCopy(src.response),
      responseCode: src.responseCode || defaultRespCode(op),
    });
    setDirty(true);
    close();
    buildApiSidebar();
    selectApiEntity('ex:' + id);
    showToast(`Duplicated as "${id}"`);
  };

  [idEl, techEl, summaryEl].forEach((el) =>
    el.addEventListener('input', () => {
      errEl.style.display = 'none';
    }),
  );
  must<HTMLButtonElement>(overlay, '.fn-prompt-confirm').onclick = duplicate;
  must<HTMLButtonElement>(overlay, '.fn-prompt-cancel').onclick = close;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Enter') duplicate();
  });
  idEl.focus();
  idEl.select();
}

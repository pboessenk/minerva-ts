/** Example detail page: parameter values, request and response forms, flushing the forms back. */
import { getEntities, getExamples, getOps } from './model-access.ts';
import { buildEntityForm, collectFormValues, initFormValidation, reconcileExampleData, stripTypeMap } from './example-form.ts';
import { buildRespCodeOptions, defaultRespCode, respSchemaForCode } from './responses.ts';
import type { JsonObject, TypeMap } from './types.ts';
import type { ApiOperation } from '../editor/model-types.ts';
import { must } from './dom.ts';
import { setDirty } from '../base/model-state.ts';
import { escapeHtml } from '../base/ui.ts';
import { state } from '../editor/state.ts';
import { jsArg } from '../base/html.ts';

/** The _typeMap stored inside an example body (or array item), or null. */
function typeMapOf(item: unknown): TypeMap | null {
  const tm = item && (item as JsonObject)._typeMap;
  return tm ? (tm as TypeMap) : null;
}

export function rebuildRespForm(container: HTMLElement, op: ApiOperation | undefined, code: string, data: unknown, rawExId: string): void {
  container.innerHTML = '';
  const { entity, isArray } = respSchemaForCode(op, code);
  if (!entity || !getEntities()?.[entity]) return;
  if (isArray) {
    renderArrayBodyItems(container, entity, data, rawExId);
  } else {
    const form = buildEntityForm(entity, '', data, 0);
    container.appendChild(form);
    container.querySelectorAll<HTMLDetailsElement>('details.ca-form-entity, details.ca-form-array-item').forEach((d) => {
      d.open = false;
    });
  }
  container.addEventListener('input', () => setDirty(true));
  container.addEventListener('change', () => setDirty(true));
  container.addEventListener('click', (e) => {
    if ((e.target as Element).closest('button, .ca-form-optional-cb')) setDirty(true);
  });
}

export function renderApiExample(exId: string): void {
  const ex = (getExamples() || []).find((e) => e.id === exId);
  if (!ex) return;

  const op = (getOps() || []).find((o) => o.id === ex.operationId);
  if (!ex.responseCode) {
    ex.responseCode = defaultRespCode(op);
    setDirty(true);
  }
  const opLabel = op ? `${op.method} ${op.path}` : ex.operationId;
  const rawId = ex.id;
  const rawOpId = ex.operationId;

  const backLink = `<a href="#" onclick="selectApiEntity(${jsArg(`op:${rawOpId}`)});return false;" class="ca-back-link">\u2190 ${escapeHtml(opLabel)}</a>`;

  // Derive entity from operation's requestBody
  const entityName = op ? op.requestBody : null;
  const isArrayBody = op && op.requestBodyArray;

  // Derive response entity from the example's selected response code
  const { entity: respEntityName, isArray: isRespArray } = respSchemaForCode(op, ex.responseCode);

  // Reconcile stored data against current model (if entity exists)
  let reconciledData: JsonObject | JsonObject[] = ex.request || (isArrayBody ? [] : {});
  if (entityName && getEntities()?.[entityName]) {
    if (isArrayBody) {
      // Reconcile each array item
      if (!Array.isArray(reconciledData)) reconciledData = reconciledData ? [reconciledData] : [];
      reconciledData = reconciledData.map((item) => {
        const storedTypeMap = typeMapOf(item);
        const cleaned = reconcileExampleData(entityName, item, storedTypeMap, 0);
        return cleaned !== null ? cleaned : item;
      });
      ex.request = reconciledData;
    } else {
      const storedTypeMap = typeMapOf(ex.request);
      const cleaned = reconcileExampleData(entityName, ex.request, storedTypeMap, 0);
      if (cleaned !== null) {
        const beforeJson = JSON.stringify(stripTypeMap(ex.request));
        const afterJson = JSON.stringify(cleaned);
        if (beforeJson !== afterJson) {
          reconciledData = cleaned;
          ex.request = cleaned;
          setDirty(true);
        } else {
          reconciledData = cleaned;
        }
      }
    }
  }

  // Reconcile response data against current model
  let reconciledResp: JsonObject | JsonObject[] = ex.response || (isRespArray ? [] : {});
  if (respEntityName && getEntities()?.[respEntityName]) {
    if (isRespArray) {
      if (!Array.isArray(reconciledResp)) reconciledResp = reconciledResp ? [reconciledResp] : [];
      const cleaned = reconciledResp.map((item) => {
        const storedTypeMap = typeMapOf(item);
        const c = reconcileExampleData(respEntityName, item, storedTypeMap, 0);
        return c !== null ? c : item;
      });
      // Only apply if reconciliation produced non-empty items
      const hasContent = cleaned.some((item) => Object.keys(item).length > 0);
      if (hasContent) {
        reconciledResp = cleaned;
        ex.response = cleaned;
      }
    } else {
      const storedTypeMap = typeMapOf(ex.response);
      const cleaned = reconcileExampleData(respEntityName, ex.response, storedTypeMap, 0);
      if (cleaned !== null && Object.keys(cleaned).length > 0) {
        reconciledResp = cleaned;
        ex.response = cleaned;
      }
    }
  }

  // Build parameter value inputs if the operation has parameters
  const opParams = op ? op.parameters || [] : [];
  let paramValuesHtml = '';
  if (opParams.length > 0) {
    const paramInputs = opParams
      .map((p) => {
        const val = (ex.parameterValues && ex.parameterValues[p.name]) || '';
        const safePName = escapeHtml(p.name);
        return `<div class="ca-param-value-row">
                <label class="ca-param-value-label">${safePName} <span class="ca-param-value-in">(${escapeHtml(p.in)})</span></label>
                <input type="text" class="fn-prompt-input ca-param-value-input" data-param="${safePName}" value="${escapeHtml(val)}" placeholder="${escapeHtml(p.type || 'string')}">
            </div>`;
      })
      .join('');
    paramValuesHtml = `
        <div class="section">
            <h3>Parameter Values</h3>
            <div id="exParamValues">${paramInputs}</div>
        </div>`;
  }

  const listView = must<HTMLElement>(document, '#listView');
  listView.innerHTML = `
        ${backLink}
        <h1><span class="ca-example-icon-lg">\u25b7</span> ${escapeHtml(ex.summary || ex.id)}
            <span class="ca-entity-actions">
                <button class="ca-action-btn ca-rename-btn" onclick="editExampleMeta(${jsArg(rawId)})" title="Edit ID/Summary"><svg class="action-icon" viewBox="0 0 24 24"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg></button>
                <button class="ca-action-btn ca-duplicate-btn" onclick="duplicateExample(${jsArg(rawId)})" title="Duplicate"><svg class="action-icon" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
                <button class="ca-action-btn ca-danger-btn" onclick="deleteExample(${jsArg(rawId)})" title="Delete"><svg class="action-icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
            </span>
        </h1>
        <p class="subtitle">Example for <a href="#" onclick="selectApiEntity(${jsArg(`op:${rawOpId}`)});return false;" class="ca-entity-link">${escapeHtml(opLabel)}</a></p>
        <p class="ca-example-id-display">ID: <code>${escapeHtml(ex.id)}</code>${ex.technicalName ? ' &nbsp;|&nbsp; Technical name: <code>' + escapeHtml(ex.technicalName) + '</code>' : ''}</p>

        <div class="ca-form-export-bar">
            <button class="ca-form-export-btn" onclick="exportExampleJson(${jsArg(rawId)}, 'clipboard')">Copy JSON</button>
            <button class="ca-form-export-btn" onclick="exportExampleJson(${jsArg(rawId)}, 'download')">Download JSON</button>
            <button class="ca-form-export-btn" onclick="exportExampleCsv(${jsArg(rawId)})" title="One row per value: Part, Path, Index, Value, Type, SIVI reference">Download CSV</button>
        </div>

        ${paramValuesHtml}

        <div class="section">
            <h3>Request Body${entityName ? ' <span class="ca-form-type-hint">(' + escapeHtml(entityName) + (isArrayBody ? '[]' : '') + ')</span>' : ''}</h3>
            <div id="exFormContainer"></div>
        </div>

        ${
          respEntityName
            ? `<div class="section" id="exRespSection">
            <h3>Response Body
                <select id="exRespCodeSelect" class="ca-resp-code-select">${buildRespCodeOptions(op, ex.responseCode)}</select>
            </h3>
            <div id="exRespFormContainer"></div>
        </div>`
            : ''
        }
    `;

  // Build structured form or show fallback
  const formContainer = must<HTMLElement>(document, '#exFormContainer');
  if (entityName && getEntities()?.[entityName]) {
    if (isArrayBody) {
      // Array mode: render each item with add/remove
      renderArrayBodyItems(formContainer, entityName, reconciledData, rawId);
    } else {
      const form = buildEntityForm(entityName, '', reconciledData, 0);
      formContainer.appendChild(form);
      // Collapse all nested entities and array items by default
      formContainer.querySelectorAll<HTMLDetailsElement>('details.ca-form-entity, details.ca-form-array-item').forEach((d) => {
        d.open = false;
      });
    }

    // Mark model dirty on any user edit inside the example form
    formContainer.addEventListener('input', () => setDirty(true));
    formContainer.addEventListener('change', () => setDirty(true));
    // Catch button clicks (add/remove tags, add/remove array items) that
    // mutate the form but don't fire input/change events
    formContainer.addEventListener('click', (e) => {
      if ((e.target as Element).closest('button, .ca-form-optional-cb')) setDirty(true);
    });

    // Initialize required-field validation badge
    initFormValidation(formContainer);
  } else if (entityName) {
    formContainer.innerHTML = `<div class="ca-form-warning">Entity "${escapeHtml(entityName)}" not found in the domain model.</div>`;
  } else {
    formContainer.innerHTML = '<p class="ca-form-no-schema">This operation has no request body schema defined.</p>';
  }

  // Mark dirty on parameter value edits
  const pvContainer = document.getElementById('exParamValues');
  if (pvContainer) {
    pvContainer.addEventListener('input', () => setDirty(true));
  }

  // Build response form
  const respFormContainer = document.getElementById('exRespFormContainer');
  if (respFormContainer && respEntityName && getEntities()?.[respEntityName]) {
    rebuildRespForm(respFormContainer, op, ex.responseCode, reconciledResp, rawId);
  }

  // Wire response code dropdown
  const respCodeSelect = document.getElementById('exRespCodeSelect') as HTMLSelectElement | null;
  if (respCodeSelect) {
    respCodeSelect.addEventListener('change', () => {
      const newCode = respCodeSelect.value;
      if (newCode === ex.responseCode) return;
      const hasData = ex.response && JSON.stringify(ex.response) !== 'null' && JSON.stringify(ex.response) !== '{}';
      if (hasData && !confirm('Switching response code will clear your current response data. Continue?')) {
        respCodeSelect.value = ex.responseCode;
        return;
      }
      // Flush current form before switching
      flushExampleForm();
      ex.responseCode = newCode;
      ex.response = null;
      setDirty(true);
      const rc = document.getElementById('exRespFormContainer');
      if (rc) {
        const { isArray: newIsArray } = respSchemaForCode(op, newCode);
        const emptyData = newIsArray ? [] : {};
        rebuildRespForm(rc, op, newCode, emptyData, rawId);
      }
    });
  }
}

export function renderArrayBodyItems(container: HTMLElement, entityName: string, items: unknown, rawExId: string): void {
  container.innerHTML = '';
  const arr = Array.isArray(items) ? items : [];
  const containerId = container.id || 'exFormContainer';

  arr.forEach((itemData, idx) => {
    const itemWrap = document.createElement('details');
    itemWrap.className = 'ca-form-array-item';
    itemWrap.open = true;
    itemWrap.dataset.arrayIdx = String(idx);

    const summary = document.createElement('summary');
    summary.className = 'ca-form-array-summary';
    summary.innerHTML = `<span class="ca-form-array-label">${escapeHtml(entityName)} [${idx}]</span>
            <button class="ca-delete-btn" onclick="event.stopPropagation();_removeArrayBodyItem(${idx},${jsArg(containerId)})" title="Remove item">\u2715</button>`;
    itemWrap.appendChild(summary);

    const form = buildEntityForm(entityName, '', itemData || {}, 0);
    itemWrap.appendChild(form);
    container.appendChild(itemWrap);
  });

  // Collapse nested entities inside each item
  container.querySelectorAll<HTMLDetailsElement>('details.ca-form-entity').forEach((d) => {
    d.open = false;
  });

  // Add item button
  const addBtn = document.createElement('button');
  addBtn.className = 'ca-add-attr-btn';
  addBtn.textContent = '+ Add ' + entityName;
  addBtn.onclick = () => {
    const newItems = collectArrayBodyItems(container, entityName);
    newItems.push({});
    renderArrayBodyItems(container, entityName, newItems, rawExId);
    setDirty(true);
  };
  container.appendChild(addBtn);
}

export function removeArrayBodyItem(idx: number, containerId: string): void {
  const container = document.getElementById(containerId || 'exFormContainer');
  if (!container) return;
  const active = state.apiActiveEntity || '';
  if (!active.startsWith('ex:')) return;
  const exId = active.slice(3);
  const ex = (getExamples() || []).find((e) => e.id === exId);
  if (!ex) return;
  const op = (getOps() || []).find((o) => o.id === ex.operationId);

  const isResp = containerId === 'exRespFormContainer';
  const entityName = isResp ? respSchemaForCode(op, ex.responseCode).entity : op ? op.requestBody : null;
  if (!entityName) return;

  const items = collectArrayBodyItems(container, entityName);
  items.splice(idx, 1);
  renderArrayBodyItems(container, entityName, items, exId.replace(/'/g, "\\'"));
  setDirty(true);
}

export function collectArrayBodyItems(container: HTMLElement, entityName: string): JsonObject[] {
  const items: JsonObject[] = [];
  container.querySelectorAll<HTMLElement>(':scope > details.ca-form-array-item').forEach((detail) => {
    const { data, typeMap } = collectFormValues(entityName, detail);
    data._typeMap = typeMap;
    items.push(data);
  });
  return items;
}

/**
 * Flush the currently-rendered example form (if any) into apiExamples.
 * Called by editorSave() before serialising to disk.
 */
export function flushExampleForm(): void {
  const formContainer = document.getElementById('exFormContainer');
  if (!formContainer) return;

  // Find which example is rendered
  const active = state.apiActiveEntity || '';
  if (!active.startsWith('ex:')) return;
  const exId = active.slice(3);

  const ex = (getExamples() || []).find((e) => e.id === exId);
  if (!ex) return;

  // Flush parameter values
  const paramContainer = document.getElementById('exParamValues');
  if (paramContainer) {
    const pv: Record<string, string> = {};
    paramContainer.querySelectorAll<HTMLInputElement>('.ca-param-value-input').forEach((input) => {
      const name = input.dataset.param;
      const val = input.value.trim();
      if (name && val) pv[name] = val;
    });
    ex.parameterValues = pv;
  }

  const op = (getOps() || []).find((o) => o.id === ex.operationId);
  const entityName = op ? op.requestBody : null;
  // No early return when the op has no request body: the response flush
  // below must still run (response-only examples on body-less operations).
  if (entityName) {
    if (op?.requestBodyArray) {
      ex.request = collectArrayBodyItems(formContainer, entityName);
    } else {
      const { data, typeMap } = collectFormValues(entityName, formContainer);
      data._typeMap = typeMap;
      ex.request = data;
    }
  }

  // Flush response body
  const respFormContainer = document.getElementById('exRespFormContainer');
  const { entity: respEntityName, isArray: isRespArray } = respSchemaForCode(op, ex.responseCode);
  if (respFormContainer && respEntityName) {
    if (isRespArray) {
      const respItems = collectArrayBodyItems(respFormContainer, respEntityName);
      // Only overwrite if form has actual content
      const hasContent = respItems.some((item) => {
        const keys = Object.keys(item).filter((k) => k !== '_typeMap');
        return keys.length > 0;
      });
      if (hasContent || !ex.response) ex.response = respItems;
    } else {
      const { data: rData, typeMap: rTypeMap } = collectFormValues(respEntityName, respFormContainer);
      const rKeys = Object.keys(rData).filter((k) => k !== '_typeMap');
      if (rKeys.length > 0 || !ex.response) {
        rData._typeMap = rTypeMap;
        ex.response = rData;
      }
    }
  }
}

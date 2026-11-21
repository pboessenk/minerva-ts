/** Operation detail page: method, path, parameters, request body, responses, examples. */
import { getExamples, getOps } from './model-access.ts';
import {
  makeOpFieldEditable,
  makeParamFieldEditable,
  makeParamInEditable,
  makeRespDescEditable,
  makeRespSchemaEditable,
  makeTagsEditable,
} from './op-inline-edit.ts';
import { must } from './dom.ts';
import { jsArg } from '../base/html.ts';
import { escapeHtml } from '../base/ui.ts';
export function renderApiOperation(opId: string): void {
  const op = (getOps() || []).find((o) => o.id === opId);
  if (!op) return;

  const listView = must<HTMLElement>(document, '#listView');
  const backLink = `<a href="#" onclick="showApiGraphView();return false;" class="ca-back-link">\u2190 Domain Model</a>`;
  const rawId = op.id;

  let requestBodyHtml = '';
  if (op.requestBody) {
    const arrayTag = op.requestBodyArray ? '[]' : '';
    requestBodyHtml = `
            <div class="section">
                <h3>Request Body</h3>
                <div class="ca-code-card">
                    <span class="ca-code-label">Content-Type:</span> <span class="ca-code-value">application/json</span><br>
                    <span class="ca-code-label">Schema:</span>
                    <a href="#" onclick="selectApiEntity(${jsArg(op.requestBody)});return false;" class="ca-entity-link">${escapeHtml(op.requestBody)}${arrayTag}</a>
                </div>
            </div>`;
  }

  // Parameters section
  const params = op.parameters || [];
  let paramsHtml = '';
  if (params.length > 0) {
    const paramRows = params
      .map((p, i) => {
        return `<tr>
                <td class="ca-cell-editable ca-param-name" data-opid="${escapeHtml(rawId)}" data-pidx="${i}">${escapeHtml(p.name)}</td>
                <td class="ca-cell-editable ca-param-in" data-opid="${escapeHtml(rawId)}" data-pidx="${i}">${escapeHtml(p.in)}</td>
                <td class="ca-cell-editable ca-param-type" data-opid="${escapeHtml(rawId)}" data-pidx="${i}">${escapeHtml(p.type)}</td>
                <td class="ca-cell-center"><input type="checkbox" ${p.required ? 'checked' : ''} onchange="toggleParamRequired(${jsArg(rawId)}, ${i}, this.checked)"></td>
                <td class="ca-cell-editable ca-param-desc" data-opid="${escapeHtml(rawId)}" data-pidx="${i}">${p.description ? escapeHtml(p.description) : '<span class="ca-cell-placeholder">+ description</span>'}</td>
                <td class="ca-cell-center"><button class="ca-delete-btn" onclick="deleteParam(${jsArg(rawId)}, ${i})" title="Delete parameter">\u2715</button></td>
            </tr>`;
      })
      .join('');
    paramsHtml = `
            <div class="section">
                <h3>Parameters (${params.length})</h3>
                <table class="ca-attr-table">
                    <thead><tr><th>Name</th><th>In</th><th>Type</th><th class="ca-cell-center">Req</th><th>Description</th><th></th></tr></thead>
                    <tbody>${paramRows}</tbody>
                </table>
                <div class="ca-add-buttons"><button class="ca-add-attr-btn" onclick="addParam(${jsArg(rawId)})">+ Add Parameter</button></div>
            </div>`;
  } else {
    paramsHtml = `
            <div class="section">
                <h3>Parameters</h3>
                <p class="empty">No parameters defined.</p>
                <div class="ca-add-buttons"><button class="ca-add-attr-btn" onclick="addParam(${jsArg(rawId)})">+ Add Parameter</button></div>
            </div>`;
  }

  let responsesHtml = '';
  const respEntries = Object.entries(op.responses || {});
  if (respEntries.length > 0) {
    const rows = respEntries
      .map(([code, resp]) => {
        const statusClass = code.startsWith('2') ? 'ca-http-2xx' : code.startsWith('4') ? 'ca-http-4xx' : 'ca-http-other';
        const arrayChecked = resp.responseBodyArray ? 'checked' : '';
        const schemaDisplay = resp.schema
          ? `<a href="#" onclick="event.stopPropagation();selectApiEntity(${jsArg(resp.schema)});return false;" class="ca-entity-link">${escapeHtml(resp.schema)}</a>`
          : '<span class="ca-cell-placeholder">+ schema</span>';
        // Example cell: quick response-body example, schema-bearing rows only
        // (@opExample statusCode/body only type-checks against schema-backed
        // response models, and OpenAPI examples need a content block).
        const exCount = (getExamples() || []).filter((ex) => ex.operationId === opId && ex.responseCode === code).length;
        const exampleCell = resp.schema
          ? `<td class="ca-cell-center"><button class="ca-add-attr-btn" onclick="addResponseExample(${jsArg(rawId)},${jsArg(code)})" title="Add a ${escapeHtml(code)} response body example">+ Example${exCount ? ` (${exCount})` : ''}</button></td>`
          : `<td class="ca-cell-center"><span class="ca-cell-placeholder" title="Add a schema to enable examples">\u2014</span></td>`;
        return `<tr>
                <td><span class="ca-http-code ${statusClass}">${escapeHtml(code)}</span></td>
                <td class="ca-cell-editable ca-resp-desc" data-opid="${escapeHtml(rawId)}" data-code="${escapeHtml(code)}">${escapeHtml(resp.description || '')}</td>
                <td class="ca-cell-editable ca-resp-schema" data-opid="${escapeHtml(rawId)}" data-code="${escapeHtml(code)}">${schemaDisplay}</td>
                <td class="ca-cell-center"><input type="checkbox" ${arrayChecked} onchange="toggleRespArray(${jsArg(rawId)},${jsArg(code)},this.checked)" title="Response is an array"></td>
                ${exampleCell}
                <td class="ca-cell-center"><button class="ca-delete-btn" onclick="deleteResponse(${jsArg(rawId)}, ${jsArg(code)})" title="Delete response">\u2715</button></td>
            </tr>`;
      })
      .join('');

    responsesHtml = `
            <div class="section">
                <h3>Responses</h3>
                <table class="ca-attr-table">
                    <thead><tr><th>Status</th><th>Description</th><th>Schema</th><th style="text-align:center">Is array</th><th class="ca-cell-center">Example</th><th></th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
                <div class="ca-add-buttons"><button class="ca-add-attr-btn" onclick="addResponse(${jsArg(rawId)})">+ Add Response</button></div>
            </div>`;
  } else {
    responsesHtml = `
            <div class="section">
                <h3>Responses</h3>
                <p class="empty">No responses defined.</p>
                <div class="ca-add-buttons"><button class="ca-add-attr-btn" onclick="addResponse(${jsArg(rawId)})">+ Add Response</button></div>
            </div>`;
  }

  // Examples for this operation
  const opExamples = (getExamples() || []).filter((ex) => ex.operationId === opId);
  let examplesHtml = '';
  if (opExamples.length > 0) {
    const exCards = opExamples
      .map((ex) => {
        const rawExId = ex.id;
        return `
            <div class="ca-example-card" onclick="selectApiEntity(${jsArg(`ex:${rawExId}`)})">
                <div class="ca-example-card-head">
                    <div class="ca-example-card-title">${escapeHtml(ex.summary || ex.id)}</div>
                    <button class="ca-action-btn ca-duplicate-btn" onclick="event.stopPropagation();duplicateExample(${jsArg(rawExId)})" title="Duplicate example"><svg class="action-icon" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
                </div>
                <div class="ca-example-card-id">${escapeHtml(ex.id)}</div>
            </div>`;
      })
      .join('');
    const importBtn = op.requestBody ? `<button class="ca-add-attr-btn" onclick="importExample(${jsArg(rawId)})">Import JSON</button>` : '';
    examplesHtml = `
            <div class="section">
                <h3>Examples (${opExamples.length})</h3>
                <div class="ca-example-cards">${exCards}</div>
                <div class="ca-add-buttons"><button class="ca-add-attr-btn" onclick="createExample(${jsArg(rawId)})">+ Add Example</button>${importBtn}</div>
            </div>`;
  } else {
    const importBtn = op.requestBody ? `<button class="ca-add-attr-btn" onclick="importExample(${jsArg(rawId)})">Import JSON</button>` : '';
    examplesHtml = `
            <div class="section">
                <h3>Examples</h3>
                <p class="empty">No examples yet. Add one to show in Swagger UI and specs.</p>
                <div class="ca-add-buttons"><button class="ca-add-attr-btn" onclick="createExample(${jsArg(rawId)})">+ Add Example</button>${importBtn}</div>
            </div>`;
  }

  listView.innerHTML = `
        ${backLink}
        <h1><span class="ca-method-badge ca-method-${escapeHtml(op.method.toLowerCase())}">${escapeHtml(op.method)}</span> <span class="ca-op-path">${escapeHtml(op.path)}</span>
            <span class="ca-entity-actions">
                <button class="ca-action-btn ca-rename-btn" onclick="editOperation(${jsArg(rawId)})" title="Edit"><svg class="action-icon" viewBox="0 0 24 24"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg></button>
                <button class="ca-action-btn ca-danger-btn" onclick="deleteOperation(${jsArg(rawId)})" title="Delete"><svg class="action-icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
            </span>
        </h1>
        <p class="subtitle ca-editable-op-field" data-opid="${escapeHtml(rawId)}" data-field="summary">${op.summary ? escapeHtml(op.summary) : '<span class="ca-cell-placeholder">(click to add summary)</span>'}</p>
        <div class="ca-op-tags" data-opid="${escapeHtml(rawId)}" style="cursor:pointer;margin-bottom:8px;" title="Click to edit tags">${op.tags && op.tags.length > 0 ? op.tags.map((t) => `<span class="ca-tag-badge">${escapeHtml(t)}</span>`).join(' ') : '<span class="ca-cell-placeholder">+ tags</span>'}</div>
        ${op.description ? `<p class="ca-op-description ca-editable-op-field" data-opid="${escapeHtml(rawId)}" data-field="description">${escapeHtml(op.description)}</p>` : `<p class="ca-op-description ca-editable-op-field ca-cell-placeholder" data-opid="${escapeHtml(rawId)}" data-field="description">(click to add description)</p>`}
        ${paramsHtml}
        ${requestBodyHtml}
        ${responsesHtml}
        ${examplesHtml}
    `;

  // Wire up click-to-edit on summary and description
  listView.querySelectorAll<HTMLElement>('.ca-editable-op-field').forEach((el) => {
    el.style.cursor = 'pointer';
    el.addEventListener('click', () => makeOpFieldEditable(el));
  });

  // Wire up click-to-edit on response descriptions and schemas
  listView.querySelectorAll<HTMLElement>('.ca-resp-desc').forEach((td) => {
    td.addEventListener('click', () => makeRespDescEditable(td));
  });
  listView.querySelectorAll<HTMLElement>('.ca-resp-schema').forEach((td) => {
    td.addEventListener('click', () => makeRespSchemaEditable(td));
  });

  // Wire up click-to-edit on parameter cells
  listView.querySelectorAll<HTMLElement>('.ca-param-name, .ca-param-type, .ca-param-desc').forEach((td) => {
    td.addEventListener('click', () => makeParamFieldEditable(td));
  });
  listView.querySelectorAll<HTMLElement>('.ca-param-in').forEach((td) => {
    td.addEventListener('click', () => makeParamInEditable(td));
  });

  // Wire up click-to-edit on tags
  listView.querySelectorAll<HTMLElement>('.ca-op-tags').forEach((el) => {
    el.addEventListener('click', () => makeTagsEditable(el));
  });
}

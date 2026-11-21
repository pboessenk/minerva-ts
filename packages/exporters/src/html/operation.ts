import {
  examplesForOperation,
  hasExampleData,
  sortedResponseCodes,
  stringifySorted,
  toPlainValue,
  toUpper,
  tryParseJson,
  type Example,
  type Operation,
} from '@minerva/core';
import { type RenderContext, esc, slug } from './markup.ts';

/** Removes the editor's `_typeMap` members at every depth of a decoded value. */
function stripTypeMap(value: unknown): unknown {
  if (value instanceof Map) {
    const out = new Map<string, unknown>();
    for (const [key, member] of value) {
      if (key !== '_typeMap') out.set(key, stripTypeMap(member));
    }
    return out;
  }
  if (Array.isArray(value)) return value.map(stripTypeMap);
  return value;
}

/** True when a decoded value holds a number that is not finite (out of double range). */
function hasNonFinite(value: unknown): boolean {
  if (typeof value === 'number') return !Number.isFinite(value);
  if (value instanceof Map) return [...value.values()].some(hasNonFinite);
  if (Array.isArray(value)) return value.some(hasNonFinite);
  return false;
}

/**
 * An example payload pretty-printed for display: decoded, `_typeMap`
 * removed, then re-encoded with sorted keys. A payload that cannot be
 * decoded (including a number outside double range) is shown as written.
 */
export function formatExampleJson(raw: string): string {
  const node = tryParseJson(raw);
  if (node === undefined) return raw;
  const value = toPlainValue(node);
  if (hasNonFinite(value)) return raw;
  return stringifySorted(stripTypeMap(value), '', '  ');
}

function renderExample(example: Example): string {
  const name = example.technicalName !== '' ? example.technicalName : example.id;
  let out = `<details class="ml-example"><summary><span class="ml-example-name">${esc(name)}</span>`;
  if (example.summary !== '') out += `<span class="ml-example-summary">&mdash; ${esc(example.summary)}</span>`;
  out += '</summary><div class="ml-example-body">';
  if (example.parameterValues.size > 0) {
    out += `<h4>Parameters</h4><pre>${esc(stringifySorted(example.parameterValues, '', '  '))}</pre>`;
  }
  if (hasExampleData(example.request)) {
    out += `<h4>Request</h4><pre>${esc(formatExampleJson(example.request as string))}</pre>`;
  }
  if (hasExampleData(example.response)) {
    const code = example.responseCode !== '' ? ` (${esc(example.responseCode)})` : '';
    out += `<h4>Response${code}</h4><pre>${esc(formatExampleJson(example.response as string))}</pre>`;
  }
  return out + '</div></details>';
}

/** One operation card: method and path, body and response schemas, parameters and examples. */
export function renderOperation(rc: RenderContext, operation: Operation): string {
  const method = operation.method !== '' ? toUpper(operation.method) : 'GET';
  let out = `<div class="ml-op" id="op-${slug(operation.id)}"><div class="ml-op-head">`;
  out += `<span class="ml-method ml-method-${esc(method)}">${esc(method)}</span>`;
  out += `<span class="ml-op-path">${esc(operation.path)}</span>`;
  if (operation.summary !== '') out += `<span class="ml-op-summary">${esc(operation.summary)}</span>`;
  out += '</div><div class="ml-op-body">';
  if (operation.description !== '') out += `<p>${esc(operation.description)}</p>`;

  if (operation.requestBody !== '') {
    const array = operation.requestBodyArray ? '[]' : '';
    out += `<div class="ml-op-row"><strong>Request body:</strong> <a href="#${slug(operation.requestBody)}">${esc(operation.requestBody)}${array}</a></div>`;
  }
  for (const code of sortedResponseCodes(operation)) {
    const response = operation.responses.get(code)!;
    let target = '';
    if (response.schema !== '') {
      const array = response.responseBodyArray ? '[]' : '';
      target = ` &rarr; <a href="#${slug(response.schema)}">${esc(response.schema)}${array}</a>`;
    }
    out += `<div class="ml-op-row"><strong>Response ${esc(code)}:</strong> ${esc(response.description)}${target}</div>`;
  }

  if (operation.parameters.length > 0) {
    out += '<div class="ml-op-row"><strong>Parameters:</strong></div>';
    out +=
      '<table class="ml-param-table"><thead><tr><th>Name</th><th>In</th><th>Type</th><th>Req</th><th>Description</th></tr></thead><tbody>';
    for (const p of operation.parameters) {
      out += `<tr><td><code>${esc(p.name)}</code></td><td>${esc(p.in)}</td><td>${esc(p.type)}</td><td>${p.required ? 'yes' : ''}</td><td>${esc(p.description)}</td></tr>`;
    }
    out += '</tbody></table>';
  }

  const examples = examplesForOperation(rc.model, operation.id);
  if (examples.length > 0) {
    out += '<div class="ml-examples">';
    out += `<h4 style="margin:14px 0 6px;font-size:12px;color:#59636e;text-transform:uppercase;letter-spacing:0.03em;">Examples (${examples.length})</h4>`;
    for (const example of examples) out += renderExample(example);
    out += '</div>';
  }
  return out + '</div></div>';
}

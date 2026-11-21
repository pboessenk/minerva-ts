/**
 * Example CSV export.
 *
 * Flattens one operation example (path/query parameters, request body,
 * response body) into rows of Part, Path, Index, Value, Type and SIVI
 * reference and downloads them as CSV from the example form. Paths are the
 * JSON property paths without indices, so they are identical across examples;
 * array positions go into the Index column as 0-based [n] segments (JSON/JSONPath
 * style), one per array level, which gives one row per array entry. Types and
 * SIVI references come from the domain model, not from the stored _typeMap,
 * which stops at array boundaries.
 */
import { formTypeInfo, stripTypeMap } from './example-form.ts';
import { flushExampleForm } from './example-page.ts';
import { getEntities, getExamples, getOps } from './model-access.ts';
import { respSchemaForCode } from './responses.ts';
import { exposeFunctions } from '../globals.ts';
import type { ApiAttr, ApiExample, ApiOp, JsonObject } from './types.ts';
import { downloadTextFile, showToast } from '../base/ui.ts';

export interface CsvRow {
  part: string;
  path: string;
  index: string;
  value: string;
  type: string;
  sivi: string;
}

const EXAMPLE_CSV_HEADER = ['Part', 'Path', 'Index', 'Value', 'Type', 'SIVI reference'];

/** RFC 4180 field: quoted when it holds a comma, quote, line break or edge space. */
function csvField(s: unknown): string {
  const v = s == null ? '' : String(s);
  return /[",\r\n]|^\s|\s$/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

/** Scalar rendering: strings verbatim, numbers and booleans as written, null empty. */
function csvValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  return typeof v === 'string' ? v : String(v);
}

/** JSON type name for keys the model does not know. */
function jsonType(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function isPlainObject(v: unknown): v is JsonObject {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Recursive flattening. `entityName` is the model entity describing `node`
 * (null when unknown), `attr` the model attribute that led here (null at the
 * root). Objects and arrays only contribute path / index segments; leaves
 * become rows. Empty containers yield nothing.
 */
function walkValue(
  node: unknown,
  entityName: string | null,
  pathSegs: string[],
  idxSegs: string[],
  attr: ApiAttr | null,
  part: string,
  rows: CsvRow[],
): void {
  if (Array.isArray(node)) {
    node.forEach((item, i) => walkValue(item, entityName, pathSegs, idxSegs.concat('[' + i + ']'), attr, part, rows));
    return;
  }
  if (isPlainObject(node)) {
    // Model order first (what the form shows), then keys the model does not know.
    const attrs = ((entityName !== null && getEntities()?.[entityName]) || { attrs: [] }).attrs || [];
    const ordered: [string, ApiAttr | null][] = [];
    for (const a of attrs) {
      if (a.type === '_section') continue;
      if (Object.hasOwn(node, a.name)) ordered.push([a.name, a]);
    }
    const known = new Set(ordered.map(([k]) => k));
    for (const key of Object.keys(node)) {
      if (key === '_typeMap' || known.has(key)) continue;
      ordered.push([key, null]);
    }
    for (const [key, childAttr] of ordered) {
      const info = formTypeInfo(childAttr ? childAttr.type : undefined);
      const childEntity = info.kind === 'entity' || info.kind === 'entity-array' ? info.base : null;
      walkValue(node[key], childEntity, pathSegs.concat(key), idxSegs, childAttr, part, rows);
    }
    return;
  }
  rows.push({
    part,
    path: pathSegs.join('.'),
    index: idxSegs.join(''),
    value: csvValue(node),
    type: attr ? attr.type : jsonType(node),
    sivi: attr && attr.sivi ? attr.sivi : '',
  });
}

/** Rows of one body (object or root array); `entityName` may be null. */
function flattenBody(part: string, body: unknown, entityName: string | null, rows: CsvRow[]): void {
  if (body === null || body === undefined) return;
  walkValue(body, entityName || null, [], [], null, part, rows);
}

/**
 * All CSV rows of an example: parameters (operation order), request body,
 * response status code and body. Works on the stored example object as well
 * as on a freshly flushed one (request/response may be null or absent).
 */
export function exampleCsvRows(ex: ApiExample | undefined | null, op: ApiOp | undefined): CsvRow[] {
  const rows: CsvRow[] = [];
  if (!ex) return rows;
  const params = ex.parameterValues || {};
  for (const p of (op && op.parameters) || []) {
    const v = params[p.name];
    if (v === undefined || v === null || String(v).trim() === '') continue;
    rows.push({ part: 'parameter', path: p.name, index: '', value: csvValue(v), type: p.type || 'string', sivi: '' });
  }
  if (ex.request !== null && ex.request !== undefined) {
    flattenBody('request', stripTypeMap(ex.request), op ? op.requestBody : null, rows);
  }
  if (ex.responseCode) {
    // Not a body path (hence the parentheses): says which response the rows below show.
    rows.push({ part: 'response', path: '(statusCode)', index: '', value: String(ex.responseCode), type: '', sivi: '' });
  }
  if (ex.response !== null && ex.response !== undefined) {
    const { entity } = respSchemaForCode(op, ex.responseCode);
    flattenBody('response', stripTypeMap(ex.response), entity, rows);
  }
  return rows;
}

/** CSV text: UTF-8 BOM (Excel), header, CRLF line ends. */
export function rowsToCsv(rows: CsvRow[]): string {
  const lines = [EXAMPLE_CSV_HEADER.map(csvField).join(',')];
  for (const r of rows) {
    lines.push([r.part, r.path, r.index, r.value, r.type, r.sivi].map(csvField).join(','));
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

/** Export-bar button: flatten the open example (current form state) and download it. */
export function exportExampleCsv(exId: string): void {
  const ex = (getExamples() || []).find((e) => e.id === exId);
  if (!ex) {
    showToast('Example not found: ' + exId, 'error');
    return;
  }
  const op = (getOps() || []).find((o) => o.id === ex.operationId);
  if (!op) {
    showToast('Operation not found for example: ' + exId, 'error');
    return;
  }
  try {
    // Pull parameters, request and response of the open form into the example first.
    flushExampleForm();
    const csv = rowsToCsv(exampleCsvRows(ex, op));
    downloadTextFile(exId + '.csv', csv, 'text/csv;charset=utf-8');
    showToast('Downloaded ' + exId + '.csv');
  } catch (err) {
    console.error('Example CSV export failed:', err);
    showToast('CSV export failed: ' + (err as Error).message, 'error');
  }
}

/** Makes the export button's inline handler find exportExampleCsv. */
export function install(): void {
  // These serve inline handlers in the markup (onclick="name(...)" and the like).
  exposeFunctions({
    exportExampleCsv,
  });
}

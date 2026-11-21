/** JSON export of an example body and preparation of a pasted JSON import. */
import type { ApiOp, ExampleBody, JsonObject, TypeMap } from '../types.ts';
import { collectFormValues } from './collect.ts';
import { reconcileExampleData } from './reconcile.ts';
import { getEntities, getOps, getExamples } from '../model-access.ts';
import { downloadTextFile, showToast } from '../../base/ui.ts';

/** Deep-clone an object, removing any _typeMap key. */
export function stripTypeMap(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripTypeMap);
  const out: JsonObject = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === '_typeMap') continue;
    out[k] = stripTypeMap(v);
  }
  return out;
}

/**
 * Export an example's request body as clean JSON.
 * @param exId Example ID
 * @param mode 'clipboard' or 'download'
 */
export function exportExampleJson(exId: string, mode: 'clipboard' | 'download'): void {
  const ex = (getExamples() || []).find((e) => e.id === exId);
  if (!ex) {
    showToast('Example not found', 'error');
    return;
  }

  // Collect fresh from the form if it's currently rendered
  const formContainer = document.getElementById('exFormContainer');
  let data: ExampleBody = ex.request;

  if (formContainer) {
    const op = (getOps() || []).find((o) => o.id === ex.operationId);
    const entityName = op ? op.requestBody : null;
    if (entityName) {
      const collected = collectFormValues(entityName, formContainer);
      data = collected.data;
    }
  }

  // Strip _typeMap from exported data
  const cleaned = data ? stripTypeMap(data) : {};
  const json = JSON.stringify(cleaned, null, 2);

  if (mode === 'clipboard') {
    navigator.clipboard
      .writeText(json)
      .then(() => {
        showToast('Copied to clipboard');
      })
      .catch(() => {
        showToast('Copy failed — check browser permissions', 'error');
      });
  } else if (mode === 'download') {
    downloadTextFile(exId + '.json', json, 'application/json');
    showToast('Downloaded ' + exId + '.json');
  }
}

/** Result of preparing a pasted payload: the cleaned body plus what was dropped, or an error. */
export type ImportResult =
  | {
      ok: true;
      cleaned: JsonObject | JsonObject[];
      dropped: string[];
      notes: string[];
      matchedCount: number;
      totalCount: number;
      entityName: string;
    }
  | { ok: false; error: string };

/**
 * Parse and reconcile a pasted request-body payload for an operation,
 * without touching getExamples(). The caller shows `dropped`/`notes` in a
 * review step and stores `cleaned` as the new example's request.
 */
export function prepareExampleImport(op: ApiOp | undefined | null, rawText: string): ImportResult {
  const entityName = op ? op.requestBody : null;
  if (!op || !entityName || !getEntities()?.[entityName]) {
    return { ok: false, error: 'This operation has no request body entity to import into.' };
  }
  return prepareBodyImport(entityName, !!op.requestBodyArray, rawText, 'operation');
}

/**
 * Response-body variant of prepareExampleImport: validates and reconciles a
 * pasted JSON body against the schema of one response (op.responses[code]).
 * Same return shape.
 */
export function prepareResponseImport(op: ApiOp | undefined | null, code: string, rawText: string): ImportResult {
  const resp = op && op.responses ? op.responses[code] : null;
  const entityName = resp ? resp.schema : null;
  if (!resp || !entityName || !getEntities()?.[entityName]) {
    return { ok: false, error: 'This response has no schema entity to import into.' };
  }
  return prepareBodyImport(entityName, !!resp.responseBodyArray, rawText, 'response');
}

/**
 * Entity-agnostic core shared by prepareExampleImport (request bodies) and
 * prepareResponseImport (response bodies). `what` ('operation'|'response')
 * selects the error wording and which half of a pasted example envelope is
 * unwrapped.
 */
function prepareBodyImport(entityName: string, isArray: boolean, rawText: string, what: 'operation' | 'response'): ImportResult {
  const notes: string[] = [];
  const text = (rawText || '').replace(/^﻿/, '').trim();
  if (!text) return { ok: false, error: 'Paste a JSON payload first.' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: 'Invalid JSON: ' + (err as Error).message };
  }

  // Unwrap a full example envelope (e.g. copied from the model file)
  const envelopeKey = what === 'response' ? 'response' : 'request';
  const exampleKeys = ['id', 'operationId', 'technicalName', 'summary', 'parameterValues', 'request', 'response', 'responseCode'];
  if (
    parsed &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    envelopeKey in parsed &&
    Object.keys(parsed).every((k) => exampleKeys.includes(k))
  ) {
    parsed = (parsed as JsonObject)[envelopeKey];
    notes.push(`Example envelope detected — imported the '${envelopeKey}' body; other fields were ignored.`);
  }

  const dropped: string[] = [];

  if (isArray) {
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      parsed = [parsed];
      notes.push('This ' + what + ' expects an array body — the pasted object was wrapped as a single item.');
    }
    if (!Array.isArray(parsed)) {
      return { ok: false, error: 'This ' + what + ' expects an array of ' + entityName + ' objects.' };
    }
    const cleaned: JsonObject[] = [];
    let sawTypeMap = false;
    parsed.forEach((item: unknown, i: number) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        dropped.push('[' + i + ']: not an object — item dropped');
        return;
      }
      const tm = importTypeMapOf(item as JsonObject);
      if (tm) sawTypeMap = true;
      const itemOrig = stripTypeMap(item);
      const c = reconcileExampleData(entityName, item, tm, 0);
      if (c === null || Object.keys(c).length === 0) {
        dropped.push('[' + i + ']: no fields matched — item dropped');
        return;
      }
      computeDroppedPaths(itemOrig, c, '[' + i + ']', dropped);
      cleaned.push(c);
    });
    if (sawTypeMap) notes.push('A _typeMap key was found in the pasted JSON — used for type checks, then removed.');
    return { ok: true, cleaned, dropped, notes, matchedCount: cleaned.length, totalCount: parsed.length, entityName };
  }

  if (Array.isArray(parsed)) {
    return { ok: false, error: 'This ' + what + ' expects a single ' + entityName + ' object, but the pasted JSON is an array.' };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'The pasted JSON must be a ' + entityName + ' object.' };
  }

  const tm = importTypeMapOf(parsed as JsonObject);
  if (tm) notes.push('A _typeMap key was found in the pasted JSON — used for type checks, then removed.');
  const orig = stripTypeMap(parsed) as JsonObject;
  const cleaned = reconcileExampleData(entityName, parsed, tm, 0) || {};
  computeDroppedPaths(orig, cleaned, '', dropped);
  return { ok: true, cleaned, dropped, notes, matchedCount: Object.keys(cleaned).length, totalCount: Object.keys(orig).length, entityName };
}

/** Extract a plain-object _typeMap from a payload, or null. */
function importTypeMapOf(obj: JsonObject | null): TypeMap | null {
  const tm = obj ? obj._typeMap : null;
  return tm && typeof tm === 'object' && !Array.isArray(tm) ? (tm as TypeMap) : null;
}

/**
 * Collect dot-paths present in `orig` but pruned from `cleaned` by
 * reconcileExampleData. Array items are matched by index (min length),
 * so drops of middle items are reported as a count, not per path.
 */
function computeDroppedPaths(orig: unknown, cleaned: unknown, prefix: string, out: string[]): void {
  if (!orig || typeof orig !== 'object' || Array.isArray(orig)) return;
  for (const [key, oVal] of Object.entries(orig)) {
    const path = prefix ? prefix + '.' + key : key;
    if (!cleaned || typeof cleaned !== 'object' || !(key in cleaned)) {
      out.push(path);
      continue;
    }
    const cVal = (cleaned as JsonObject)[key];
    if (Array.isArray(oVal) && Array.isArray(cVal)) {
      const hasObjects = oVal.some((v) => v && typeof v === 'object' && !Array.isArray(v));
      if (hasObjects) {
        if (cVal.length < oVal.length) {
          out.push(path + ': ' + (oVal.length - cVal.length) + ' of ' + oVal.length + ' item(s) dropped');
        }
        const n = Math.min(oVal.length, cVal.length);
        for (let i = 0; i < n; i++) computeDroppedPaths(oVal[i], cVal[i], path + '[' + i + ']', out);
      } else if (cVal.length < oVal.length) {
        out.push(path + ': ' + (oVal.length - cVal.length) + ' value(s) removed (not in the codelist)');
      }
    } else if (oVal && typeof oVal === 'object' && !Array.isArray(oVal) && cVal && typeof cVal === 'object' && !Array.isArray(cVal)) {
      computeDroppedPaths(oVal, cVal, path, out);
    }
  }
}

import { readFileSync, writeFileSync } from 'node:fs';
import { ModelDecodeError, decodeModel, jsonString, quote, tryParseJson, validateModel } from '@minerva/core';
import { type HttpResponse, json, methodNotAllowed, textError } from '../http/response.ts';
import type { Workspace } from '../workspace/workspace.ts';
import { isResponse, requestedModelFile } from './model-file.ts';

function invalid(errors: string[]): HttpResponse {
  const list = errors.map((e) => jsonString(e, { escapeHtml: false })).join(',');
  return json(400, `{"errors":[${list}],"status":"invalid"}\n`);
}

/** The `lastModified` of the model currently on disk, or an empty string. */
function lastModifiedOnDisk(path: string): string {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return '';
  }
  const root = tryParseJson(text);
  if (root === undefined || root.kind !== 'object') return '';
  let value = '';
  for (const entry of root.entries) {
    if (entry.key.toLowerCase() !== 'lastmodified') continue;
    if (entry.value.kind === 'string') value = entry.value.value;
    else if (entry.value.kind !== 'null') return '';
  }
  return value;
}

/**
 * POST /api/save: writes the request body to the model file, byte for byte.
 *
 * Two guards run first:
 *
 *  1. The body must decode as a model and pass constraint validation;
 *     otherwise 400 with the list of problems, which the editor shows as is.
 *  2. Optimistic locking: the client sends the `lastModified` it loaded in
 *     `X-Base-Last-Modified`. When the file on disk carries a different one,
 *     another session saved in between and the answer is 409, so the editor
 *     can ask instead of silently overwriting. `force=1` skips this check.
 *
 * The body is stored exactly as received, never re-serialised, so the model
 * file stays whatever the editor wrote, including keys this server does not
 * know about.
 */
export function save(workspace: Workspace, method: string, query: URLSearchParams, baseLastModified: string, body: Buffer): HttpResponse {
  if (method !== 'POST') return methodNotAllowed();
  const file = requestedModelFile(workspace, query);
  if (isResponse(file)) return file;
  const destination = workspace.modelPath(file);

  let errors: string[];
  try {
    errors = validateModel(decodeModel(body.toString('utf8')));
  } catch (err) {
    if (!(err instanceof ModelDecodeError)) throw err;
    return invalid(['invalid model JSON: ' + err.message]);
  }
  if (errors.length > 0) return invalid(errors);

  if (query.get('force') !== '1') {
    const onDisk = lastModifiedOnDisk(destination);
    if (onDisk !== '' && onDisk !== baseLastModified) {
      return json(409, `{"status":"conflict","diskLastModified":${quote(onDisk)}}`);
    }
  }

  try {
    writeFileSync(destination, body);
  } catch (err) {
    return textError(500, 'Failed to write file: ' + (err as Error).message);
  }
  return json(200, `{"status":"saved","path":"${destination}"}`);
}

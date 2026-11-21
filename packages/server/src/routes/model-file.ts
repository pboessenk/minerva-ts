import { readFileSync } from 'node:fs';
import { type Model, ModelDecodeError, decodeModel } from '@minerva/core';
import { type HttpResponse, textError } from '../http/response.ts';
import type { Workspace } from '../workspace/workspace.ts';

/**
 * The model file a request refers to: its `model` parameter, else the
 * workspace default. Only a bare file name is accepted, never a path.
 */
export function requestedModelFile(workspace: Workspace, query: URLSearchParams): string | HttpResponse {
  const file = query.get('model') || workspace.defaultModelFile;
  if (file.includes('/') || file.includes('\\') || file.includes('..')) {
    return textError(400, 'Invalid model filename');
  }
  return file;
}

/** Reads and decodes a model, or returns the error response to send. */
export function loadModel(workspace: Workspace, file: string): Model | HttpResponse {
  const path = workspace.modelPath(file);
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    const reason = (err as NodeJS.ErrnoException).code === 'ENOENT' ? 'no such file or directory' : (err as Error).message;
    return textError(500, `read model: open ${path}: ${reason}`);
  }
  try {
    return decodeModel(text);
  } catch (err) {
    if (err instanceof ModelDecodeError) return textError(500, `parse model: ${err.message}`);
    throw err;
  }
}

export function isResponse(value: unknown): value is HttpResponse {
  return typeof value === 'object' && value !== null && 'status' in value && 'body' in value;
}

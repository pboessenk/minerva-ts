import { buildCatalogLookups, filterModel, resolveExportSettings, trimSpace } from '@minerva/core';
import { EXPORTERS, FORMATS, NotImplementedError, isFormat } from '@minerva/exporters';
import { type HttpResponse, methodNotAllowed, respond, textError } from '../http/response.ts';
import type { Workspace } from '../workspace/workspace.ts';
import { isResponse, loadModel, requestedModelFile } from './model-file.ts';

/**
 * GET /api/export?format=...&model=...&roots=A,B
 *
 * Reads the model from disk, narrows it to the requested root entities and
 * hands it to the exporter for `format`. Remaining query parameters are
 * format options (for example `entityGap=1` for CSV).
 */
export function exportModel(workspace: Workspace, method: string, query: URLSearchParams, now: Date): HttpResponse {
  if (method !== 'GET') return methodNotAllowed();
  const file = requestedModelFile(workspace, query);
  if (isResponse(file)) return file;
  const loaded = loadModel(workspace, file);
  if (isResponse(loaded)) return loaded;

  const roots = (query.get('roots') ?? '')
    .split(',')
    .map(trimSpace)
    .filter((root) => root !== '');
  const model = filterModel(loaded, roots);

  const format = query.get('format') ?? '';
  if (!isFormat(format)) return textError(400, `Unknown format. Supported: ${FORMATS.join(', ')}`);
  let result: ReturnType<(typeof EXPORTERS)[typeof format]['run']>;
  try {
    result = EXPORTERS[format].run(
      {
        model,
        lookups: buildCatalogLookups(workspace.catalog, model),
        settings: resolveExportSettings(model, workspace.manifest, file),
        now,
      },
      (name) => query.get(name),
    );
  } catch (err) {
    if (err instanceof NotImplementedError) return textError(501, err.message);
    throw err;
  }
  return respond(200, result.contentType, result.body, {
    'Content-Disposition': `attachment; filename="${result.filename}"`,
  });
}

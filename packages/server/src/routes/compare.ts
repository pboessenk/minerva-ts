import { existsSync, readFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import {
  type CompareSource,
  ContractDecodeError,
  type DriftFinding,
  type DriftReport,
  buildCodelistLookup,
  buildDriftReport,
  parseOpenApiDocument,
} from '@minerva/core';
import { type JsonRecord, encodeJson, omitEmpty } from '../http/encode-json.ts';
import { type HttpResponse, json, methodNotAllowed, textError } from '../http/response.ts';
import type { Workspace } from '../workspace/workspace.ts';
import { isResponse, loadModel, requestedModelFile } from './model-file.ts';

/**
 * GET /api/compare/sources?model=...
 *
 * The contracts a model declares under `compareSources` whose files exist in
 * this workspace, as `[{ id, label }]`.
 */
export function compareSources(workspace: Workspace, method: string, query: URLSearchParams): HttpResponse {
  if (method !== 'GET') return methodNotAllowed();
  const file = requestedModelFile(workspace, query);
  if (isResponse(file)) return file;
  const model = loadModel(workspace, file);
  if (isResponse(model)) return model;

  const available = model.compareSources
    .filter((source) => {
      const path = workspace.resolveContractPath(source.path);
      return path !== undefined && existsSync(path);
    })
    .map((source) => ({ id: source.id, label: source.label }));
  return json(200, encodeJson(available) + '\n');
}

/** Largest contract accepted as a request body. */
const MAX_CONTRACT_BYTES = 20 << 20;

/** Reads a request body of at most `limit` bytes; `undefined` when it is longer. */
function readLimitedBody(req: IncomingMessage, limit: number): Promise<Buffer | undefined> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      // Past the limit the rest is read and dropped, so the answer can still be sent.
      if (size <= limit) chunks.push(chunk);
    });
    req.on('end', () => resolve(size <= limit ? Buffer.concat(chunks) : undefined));
    req.on('error', reject);
  });
}

/** Why a contract file cannot be read, in the wording the drift report uses. */
function readFailure(path: string, err: NodeJS.ErrnoException): string {
  switch (err.code) {
    case 'ENOENT':
      return `open ${path}: no such file or directory`;
    case 'EISDIR':
      return `read ${path}: is a directory`;
    case 'EACCES':
      return `open ${path}: permission denied`;
    case 'ENOTDIR':
      return `open ${path}: not a directory`;
    case 'ELOOP':
      return `open ${path}: too many levels of symbolic links`;
    case 'ENAMETOOLONG':
      return `open ${path}: file name too long`;
    default:
      return `open ${path}: ${err.message}`;
  }
}

/** The contract file of the model's source `sourceId`, or the error response to send. */
function readSourceContract(workspace: Workspace, sources: readonly CompareSource[], sourceId: string): Buffer | HttpResponse {
  const source = sources.find((s) => s.id === sourceId);
  if (source === undefined) return textError(404, 'Unknown contract source for this model');
  const path = workspace.resolveContractPath(source.path);
  if (path === undefined) {
    return textError(
      400,
      source.path === '' ? 'contract source has no path' : "contract path must be relative to the project root, without '..'",
    );
  }
  try {
    return readFileSync(path);
  } catch (err) {
    return textError(404, 'Contract file not available: ' + readFailure(path, err as NodeJS.ErrnoException));
  }
}

function findingRecord(f: DriftFinding): JsonRecord {
  return {
    category: f.category,
    severity: f.severity,
    entity: omitEmpty(f.entity),
    property: omitEmpty(f.property),
    operation: omitEmpty(f.operation),
    code: omitEmpty(f.code),
    model: omitEmpty(f.model),
    contract: omitEmpty(f.contract),
    onlyInModel: f.onlyInModel.length > 0 ? f.onlyInModel : undefined,
    onlyInContract: f.onlyInContract.length > 0 ? f.onlyInContract : undefined,
    changeNeeded: f.changeNeeded,
  };
}

function reportRecord(modelFile: string, report: DriftReport, generatedAt: string): JsonRecord {
  const { stats } = report;
  return {
    modelFile,
    modelTitle: report.modelTitle,
    modelVersion: report.modelVersion,
    contractTitle: report.contractTitle,
    contractVersion: report.contractVersion,
    generatedAt,
    stats: {
      errors: stats.errors,
      warnings: stats.warnings,
      infos: stats.infos,
      modelSchemas: stats.modelSchemas,
      contractSchemas: stats.contractSchemas,
      matchedSchemas: stats.matchedSchemas,
      modelOperations: stats.modelOperations,
      contractOperations: stats.contractOperations,
      matchedOperations: stats.matchedOperations,
    },
    // A report without findings has `null` here, not an empty list.
    findings: report.findings.length > 0 ? report.findings.map(findingRecord) : null,
  };
}

/** RFC 3339 in UTC, whole seconds: `2026-01-02T03:04:05Z`. */
function rfc3339(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/**
 * POST /api/compare?model=...[&source=<id>][&includeDescriptions=1]
 *
 * Compares the model with an OpenAPI 3.x JSON contract and answers with the
 * drift report. The contract is the request body or, with `source=`, the file
 * of that contract source of the model (the body is then ignored), so a
 * client only ever names a source, never a path.
 */
export async function compare(
  workspace: Workspace,
  method: string,
  query: URLSearchParams,
  req: IncomingMessage,
  now: Date,
): Promise<HttpResponse> {
  if (method !== 'POST') return methodNotAllowed();
  const file = requestedModelFile(workspace, query);
  if (isResponse(file)) return file;
  const model = loadModel(workspace, file);
  if (isResponse(model)) return model;

  let contract: Buffer;
  const sourceId = query.get('source') ?? '';
  if (sourceId !== '') {
    const read = readSourceContract(workspace, model.compareSources, sourceId);
    if (isResponse(read)) return read;
    contract = read;
  } else {
    const body = await readLimitedBody(req, MAX_CONTRACT_BYTES);
    if (body === undefined) return textError(400, 'Failed to read body: http: request body too large');
    contract = body;
  }
  if (contract.length === 0) return textError(400, 'Empty OpenAPI document');

  let doc: ReturnType<typeof parseOpenApiDocument>;
  try {
    doc = parseOpenApiDocument(contract.toString('utf8'));
  } catch (err) {
    if (err instanceof ContractDecodeError) return textError(400, 'Invalid OpenAPI JSON: ' + err.message);
    throw err;
  }

  const report = buildDriftReport(model, doc, buildCodelistLookup(workspace.catalog.codelists), {
    includeDescriptions: query.get('includeDescriptions') === '1',
  });
  return json(200, encodeJson(reportRecord(file, report, rfc3339(now))) + '\n');
}

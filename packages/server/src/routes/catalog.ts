import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { type CustomDescriptions, decodeCustomDescriptions } from '@minerva/core';
import { type JsonRecord, type JsonValue, encodeJson, omitEmpty } from '../http/encode-json.ts';
import { type HttpResponse, json, methodNotAllowed, textError } from '../http/response.ts';
import type { Workspace } from '../workspace/workspace.ts';

/** `list` when it has elements, else `undefined` (so the member is omitted). */
function omitEmptyList<T>(list: T[]): T[] | undefined {
  return list.length === 0 ? undefined : list;
}

/**
 * Whether the catalogue folder `name` is absent: the catalogue was never
 * fetched, so the editor gets an empty one. A folder that exists but cannot
 * be read is still an error.
 */
function notFetched(workspace: Workspace, name: string): boolean {
  return !existsSync(join(workspace.dataDir, name));
}

/** GET /api/codelists: every codelist, in the catalogue's on-disk shape. */
export function codelists(workspace: Workspace, method: string): HttpResponse {
  if (method !== 'GET') return methodNotAllowed();
  const items = workspace.catalog.codelists ?? (notFetched(workspace, 'codelists') ? [] : null);
  if (items === null) return textError(500, 'Codelists not loaded');
  const body: JsonRecord = {
    Items: items.map((item) => ({
      Name: item.name,
      Description: omitEmpty(item.description),
      Code: item.codes === null ? null : item.codes.map((c) => ({ CodeValue: c.codeValue, Description: c.description })),
    })),
  };
  return json(200, encodeJson(body) + '\n');
}

/** GET /api/datacat: the data catalogue, in its on-disk shape. */
export function datacat(workspace: Workspace, method: string): HttpResponse {
  if (method !== 'GET') return methodNotAllowed();
  const entities = workspace.catalog.entities ?? (notFetched(workspace, 'datacat') ? [] : null);
  if (entities === null) return textError(500, 'Datacat not loaded');
  const body: JsonRecord = {
    Entity: entities.map((entity) => ({
      Name: entity.name,
      Description: omitEmpty(entity.description),
      EntityType: omitEmptyList(
        entity.entityTypes.map((entityType) => ({
          Name: entityType.name,
          Description: omitEmpty(entityType.description),
          Attribute: omitEmptyList(
            entityType.attributes.map((a) => ({
              Name: a.name,
              Description: omitEmpty(a.description),
              Datatype: omitEmpty(a.datatype),
              Codelist: omitEmpty(a.codelist),
              AFD1: omitEmpty(a.afd1),
            })),
          ),
        })),
      ),
    })),
  };
  return json(200, encodeJson(body) + '\n');
}

/**
 * The entity-type summary derived from the data catalogue: per entity its
 * subtypes, and per subtype the attributes that are bound to a codelist.
 * Computed once; the catalogue does not change while the server runs.
 */
export function buildEntityTypeSummary(workspace: Workspace): string {
  const summary = new Map<string, JsonValue>();
  for (const entity of workspace.catalog.entities ?? []) {
    const subtypes = entity.entityTypes.map((entityType) => {
      const codelistAttributes = entityType.attributes
        .filter((a) => a.codelist !== '')
        .map((a) => ({ name: a.name, codelist: a.codelist, datatype: a.datatype }));
      return {
        name: entityType.name,
        description: entityType.description,
        attrCount: entityType.attributes.length,
        // An absent list is `null`, not `[]`; the editor relies on neither.
        codelistAttrs: codelistAttributes.length === 0 ? null : codelistAttributes,
      };
    });
    summary.set(entity.name, { description: entity.description, subtypes: subtypes.length === 0 ? null : subtypes });
  }
  return encodeJson(summary);
}

/** GET /api/entitytypes */
export function entityTypes(summary: string, method: string): HttpResponse {
  return method === 'GET' ? json(200, summary) : methodNotAllowed();
}

function customDescriptionsBody(custom: CustomDescriptions, indent = ''): string {
  return encodeJson({ subtypes: custom.subtypes, codeNotes: custom.codeNotes.size === 0 ? undefined : custom.codeNotes }, indent);
}

/** GET/POST /api/custom-descriptions: workspace text layered over the catalogue. */
export function customDescriptions(workspace: Workspace, method: string, body: Buffer): HttpResponse {
  if (method === 'GET') return json(200, customDescriptionsBody(workspace.catalog.custom) + '\n');
  if (method !== 'POST') return methodNotAllowed();
  const custom = decodeCustomDescriptions(body.toString('utf8'));
  if (custom === undefined) return textError(400, 'Invalid JSON: expected {"subtypes": {...}, "codeNotes": {...}}');
  try {
    workspace.saveCustomDescriptions(custom, customDescriptionsBody(custom, '  '));
  } catch (err) {
    return textError(500, 'Failed to write: ' + (err as Error).message);
  }
  return json(200, '{"status":"saved"}');
}

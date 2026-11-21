import type { IncomingMessage, ServerResponse } from 'node:http';
import { guardRequest } from './http/guard.ts';
import { type HttpResponse, notFound, readBody, send, textError } from './http/response.ts';
import { cleanRelativePath, serveFile } from './http/static.ts';
import * as catalog from './routes/catalog.ts';
import { compare, compareSources } from './routes/compare.ts';
import { exportModel } from './routes/export.ts';
import * as web from './routes/web.ts';
import { save } from './routes/save.ts';
import { Workspace } from './workspace/workspace.ts';

export interface AppOptions {
  /** The data directory to serve. */
  dataDir: string;
  /** Clock used for timestamps in exports. Defaults to the system clock. */
  now?: () => Date;
  /** Serve the editor as built by `pnpm build` instead of building it on each request. */
  prebuiltEditor?: boolean;
}

export interface App {
  readonly workspace: Workspace;
  /** A request listener for `http.createServer`. */
  handle(req: IncomingMessage, res: ServerResponse): void;
}

/**
 * Builds the HTTP application for one workspace.
 *
 * | Method   | Path                     |                                              |
 * |----------|--------------------------|----------------------------------------------|
 * | GET      | /                        | the editor                                   |
 * | GET      | /data/*                  | files of the data directory                  |
 * | GET      | /assets/*                | editor script and stylesheet                 |
 * | POST     | /api/save                | validate and write a model                   |
 * | GET      | /api/export              | export a model                               |
 * | GET      | /api/codelists           | reference catalogue: codelists               |
 * | GET      | /api/datacat             | reference catalogue: entities                |
 * | GET      | /api/entitytypes         | summary derived from the catalogue           |
 * | GET/POST | /api/custom-descriptions | workspace text layered over the catalogue    |
 * | GET      | /api/compare/sources     | contracts a model can be compared against    |
 * | POST     | /api/compare             | drift report: model versus OpenAPI contract  |
 *
 * Every request passes `guardRequest` first: only localhost, and writes only
 * from the editor's own origin with a JSON body.
 */
export function createApp(options: AppOptions): App {
  const workspace = new Workspace(options.dataDir);
  const now = options.now ?? (() => new Date());
  const entityTypeSummary = catalog.buildEntityTypeSummary(workspace);

  async function route(req: IncomingMessage): Promise<HttpResponse> {
    const method = req.method ?? 'GET';
    const refused = guardRequest(method, req.headers);
    if (refused !== undefined) return refused;
    const url = new URL(req.url ?? '/', 'http://localhost');
    let path: string;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      return textError(400, 'invalid URL path');
    }
    const query = url.searchParams;

    switch (path) {
      case '/':
        return web.indexPage(workspace);
      case '/api/save':
        return save(workspace, method, query, String(req.headers['x-base-last-modified'] ?? ''), await readBody(req));
      case '/api/codelists':
        return catalog.codelists(workspace, method);
      case '/api/datacat':
        return catalog.datacat(workspace, method);
      case '/api/entitytypes':
        return catalog.entityTypes(entityTypeSummary, method);
      case '/api/custom-descriptions':
        return catalog.customDescriptions(workspace, method, method === 'POST' ? await readBody(req) : Buffer.alloc(0));
      case '/api/export':
        return exportModel(workspace, method, query, now());
      case '/api/compare/sources':
        return compareSources(workspace, method, query);
      case '/api/compare':
        return compare(workspace, method, query, req, now());
    }
    if (path.startsWith('/data/')) return serveFile(workspace.dataDir, cleanRelativePath(path.slice('/data/'.length)));
    if (path.startsWith('/assets/')) return web.asset(cleanRelativePath(path.slice('/assets/'.length)), options.prebuiltEditor === true);
    return notFound();
  }

  return {
    workspace,
    handle(req, res) {
      route(req)
        .catch((err: unknown) => textError(500, 'Internal error: ' + (err instanceof Error ? err.message : String(err))))
        .then((response) => send(req, res, response));
    },
  };
}

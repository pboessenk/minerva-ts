import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type ManifestModel, compareStrings, escapeHtml, modelLabel } from '@minerva/core';
import { DIST_DIR, STATIC_DIR, buildApp } from '@minerva/web/build';
import { encodeJson } from '../http/encode-json.ts';
import { type HttpResponse, respond, textError } from '../http/response.ts';
import { serveFile } from '../http/static.ts';
import type { Workspace } from '../workspace/workspace.ts';

/**
 * The editor: the page, its script and its stylesheet (packages/web).
 *
 * The script is built on request, so a change to the editor shows on reload.
 */

/** Options of a model's editor view. */
export function editorViewConfig(model: ManifestModel): Record<string, string> {
  const config: Record<string, string> = { label: modelLabel(model), dataPath: `/data/${model.file}` };
  if (model.color !== '') config['fallbackColor'] = model.color;
  if (model.group !== '') config['group'] = model.group;
  return config;
}

const FOOTER_STYLE =
  'position:fixed;bottom:12px;right:16px;font-size:11px;color:#484f58;letter-spacing:0.3px;z-index:10;pointer-events:none;';

/** GET / */
export function indexPage(workspace: Workspace): HttpResponse {
  const html = readFileSync(join(STATIC_DIR, 'index.html'), 'utf8');
  const models = [...workspace.models]
    .sort((a, b) => compareStrings(a.id, b.id))
    .map((model) => ({ id: model.id, config: editorViewConfig(model) }));
  const boot = `<script type="application/json" id="minerva-boot">${encodeJson({ models })}</script>`;
  const footer = workspace.manifest.footer;
  return respond(
    200,
    'text/html; charset=utf-8',
    html
      .replace('<!-- MINERVA_BOOT -->', () => boot)
      .replace('<!-- MINERVA_FOOTER -->', () => (footer === '' ? '' : `<div style="${FOOTER_STYLE}">${escapeHtml(footer)}</div>`)),
    { 'Cache-Control': 'no-store' },
  );
}

/**
 * GET /assets/*: the page's stylesheet and the editor script. The script is
 * built from source on each request, or, with `prebuilt`, read from what
 * `pnpm build` wrote.
 */
export async function asset(relativePath: string, prebuilt: boolean): Promise<HttpResponse> {
  if (relativePath === 'app.js' || relativePath === 'app.js.map') {
    if (prebuilt) return serveFile(DIST_DIR, relativePath);
    try {
      const bundle = await buildApp();
      return relativePath === 'app.js'
        ? respond(200, 'text/javascript; charset=utf-8', bundle.js, { 'Cache-Control': 'no-store' })
        : respond(200, 'application/json', bundle.map, { 'Cache-Control': 'no-store' });
    } catch (err) {
      return textError(500, 'Building the editor failed: ' + (err instanceof Error ? err.message : String(err)));
    }
  }
  if (relativePath === 'index.html') return textError(404, '404 page not found');
  return serveFile(STATIC_DIR, relativePath);
}

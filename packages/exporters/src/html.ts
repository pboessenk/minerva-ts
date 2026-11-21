import {
  UNTITLED,
  buildEntityOrder,
  collectAllowedTypes,
  compactJson,
  sortStrings,
  trimSpace,
  type Example,
  type Model,
} from '@minerva/core';
import type { ExportContext, ExportResult } from './context.ts';
import { EXPORT_CSS, SEARCH_JS } from './html/assets.ts';
import { renderBody } from './html/body.ts';
import type { RenderContext } from './html/markup.ts';
import { renderPage } from './html/page.ts';
import { subtypeFilterCss } from './html/subtype-css.ts';
import { renderTabBar } from './html/tabs.ts';
import { renderToc } from './html/toc.ts';
import { buildEntityTree } from './html/tree.ts';

export interface HtmlOptions {
  /** Keep internal-only documentation (open points, attribute notes). */
  includeInternalDocs: boolean;
}

const REENCODE_ESCAPED = new RegExp(`[<>&${String.fromCharCode(0x2028, 0x2029)}]`, 'g');

/**
 * An example payload as it reads in a re-encoded copy of the model: compact,
 * with `<`, `>`, `&`, U+2028 and U+2029 escaped. The public export has always
 * worked on such a copy. The difference only shows for a payload displayed
 * as written, i.e. one `formatExampleJson` cannot decode.
 */
function reencodedPayload(raw: string | null): string | null {
  if (raw === null) return null;
  const compact = compactJson(raw);
  if (compact === undefined) return raw;
  return compact.replace(REENCODE_ESCAPED, (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
}

/**
 * The model without internal-only documentation (entity and enum open
 * points, attribute notes), so a public export does not contain it at all
 * rather than merely hiding it.
 */
function stripInternalDocs(model: Model): Model {
  const entities = new Map(
    [...model.entities].map(([name, entity]) => [
      name,
      {
        ...entity,
        openPoints: [],
        sections: entity.sections.map((section) => ({
          ...section,
          attributes: section.attributes.map((a) => ({ ...a, notes: '' })),
        })),
      },
    ]),
  );
  const enums = new Map([...model.enums].map(([name, enumeration]) => [name, { ...enumeration, openPoints: [] }]));
  const examples = model.examples.map(
    (ex): Example => ({ ...ex, request: reencodedPayload(ex.request), response: reencodedPayload(ex.response) }),
  );
  return { ...model, entities, enums, examples };
}

/** `YYYY-MM-DD HH:MM UTC` */
function formatTimestamp(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const day = `${String(date.getUTCFullYear()).padStart(4, '0')}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  return `${day} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

/** Characters that are awkward in a file name become `_`. */
function filenameSafe(s: string): string {
  return s.replace(/[ /\\:]/g, '_');
}

/**
 * HTML export: one self-contained page documenting the model. It works
 * without JavaScript: sections, the entity tree, tabs and the subtype
 * switcher are all HTML and CSS. A small script adds a search box when it
 * can run.
 */
export function exportHtml(ctx: ExportContext, options: HtmlOptions): ExportResult {
  const model = options.includeInternalDocs ? ctx.model : stripInternalDocs(ctx.model);

  // Only the named codelist types (the aliases the specification exports
  // emit) are listed, each with exactly its own values.
  const namedTypes = new Map(
    collectAllowedTypes(model, buildEntityOrder(model, ctx.settings.primaryRoot), ctx.lookups.codelists).map((type) => [type.name, type]),
  );
  const codelistNames = sortStrings(namedTypes.keys());
  // Every enum is listed, referenced or not.
  const enumNames = sortStrings(model.enums.keys());

  const tree = buildEntityTree(model);
  const rc: RenderContext = { model, lookups: ctx.lookups, namedTypes, canonicalParent: tree.canonicalParent };
  const body = renderBody(rc, tree, enumNames, codelistNames);

  const trimmed = trimSpace(model.title);
  const title = trimmed !== '' ? trimmed : UNTITLED;
  const page = renderPage({
    title,
    subtitle: model.subtitle,
    version: model.version,
    lastModified: model.lastModified,
    generatedAt: formatTimestamp(ctx.now),
    entityCount: model.entities.size,
    operationCount: model.operations.length,
    enumCount: model.enums.size,
    css: EXPORT_CSS,
    subtypeCss: subtypeFilterCss(model),
    bodyHtml: body.html,
    tocHtml: renderToc(model, tree, enumNames, codelistNames),
    tabBar: renderTabBar(body.sections),
    searchJs: SEARCH_JS,
  });
  return { body: page, contentType: 'text/html; charset=utf-8', filename: `${filenameSafe(title)}.html` };
}

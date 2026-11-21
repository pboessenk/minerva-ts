import { escapeHtmlTemplateText as text } from '@minerva/core';

/**
 * The page around the rendered parts. Plain values are escaped as element
 * text; stylesheet, script and markup parts are inserted as they are.
 */
export interface PageView {
  readonly title: string;
  readonly subtitle: string;
  readonly version: string;
  readonly lastModified: string;
  /** `YYYY-MM-DD HH:MM UTC` */
  readonly generatedAt: string;
  readonly entityCount: number;
  readonly operationCount: number;
  readonly enumCount: number;
  readonly css: string;
  readonly subtypeCss: string;
  readonly bodyHtml: string;
  readonly tocHtml: string;
  readonly tabBar: string;
  readonly searchJs: string;
}

export function renderPage(v: PageView): string {
  const subtypeStyle = v.subtypeCss !== '' ? `<style>${v.subtypeCss}</style>` : '';
  const lastModified = v.lastModified !== '' ? ` &middot; ${text(v.lastModified)}` : '';
  const subtitle = v.subtitle !== '' ? `<p class="ml-subtitle">${text(v.subtitle)}</p>` : '';
  const tabs = v.tabBar !== '' ? `<nav id="ml-tabs" class="ml-tabs" role="tablist">${v.tabBar}</nav>` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${text(v.title)}</title>
<style>${v.css}</style>
${subtypeStyle}
</head>
<body>
<div id="ml-app">
    <aside id="ml-sidebar">
        <div class="ml-side-head">
            <div class="ml-side-title">${text(v.title)}</div>
            <div class="ml-side-meta">v${text(v.version)}${lastModified}</div>
        </div>
        <div class="ml-search-wrap" hidden>
            <input id="ml-search" type="search" placeholder="Search entities, attributes, codes…" autocomplete="off" spellcheck="false">
        </div>
        <nav id="ml-toc">${v.tocHtml}</nav>
    </aside>
    <main id="ml-main">
        <header class="ml-doc-head">
            <h1>${text(v.title)}</h1>
            ${subtitle}
            <p class="ml-doc-meta">Generated ${text(v.generatedAt)} &middot; ${v.entityCount} entities &middot; ${v.operationCount} operations &middot; ${v.enumCount} enums</p>
        </header>
        ${tabs}
        <div id="ml-body">${v.bodyHtml}</div>
    </main>
</div>
<script>${v.searchJs}</script>
</body>
</html>
`;
}

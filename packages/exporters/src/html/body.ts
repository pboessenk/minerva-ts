import { renderCodelist } from './codelist.ts';
import { renderEnum } from './enum.ts';
import type { RenderContext } from './markup.ts';
import { renderOperation } from './operation.ts';
import { TABS, type Tab, section } from './tabs.ts';
import { type EntityTree, renderTreeNode } from './tree.ts';

export interface Body {
  readonly html: string;
  /** The sections the body contains, for the tab bar. */
  readonly sections: ReadonlySet<Tab>;
}

/** The main column: operations, the entity tree, enums and named codelist types. */
export function renderBody(rc: RenderContext, tree: EntityTree, enumNames: readonly string[], codelistNames: readonly string[]): Body {
  const sections = new Set<Tab>();
  let html = '';

  if (rc.model.operations.length > 0) {
    sections.add(TABS.ops);
    html += section(TABS.ops, rc.model.operations.map((op) => renderOperation(rc, op)).join(''));
  }

  sections.add(TABS.entities);
  let entities = '';
  if (tree.roots.length > 0) {
    entities += `<div class="ml-tree-roots">${tree.roots.map((node) => renderTreeNode(rc, node, '')).join('')}</div>`;
  } else {
    entities += '<p class="ml-empty">No root entities defined.</p>';
  }
  if (tree.orphans.length > 0) {
    entities +=
      '<h3 class="ml-orphans-h">Orphans <span class="ml-orphans-note">(not reachable from any root)</span></h3>' +
      `<div class="ml-tree-roots">${tree.orphans.map((node) => renderTreeNode(rc, node, '')).join('')}</div>`;
  }
  html += section(TABS.entities, entities);

  if (enumNames.length > 0) {
    sections.add(TABS.enums);
    html += section(TABS.enums, enumNames.map((name) => renderEnum(rc.model, name)).join(''));
  }
  if (codelistNames.length > 0) {
    sections.add(TABS.codelists);
    html += section(TABS.codelists, codelistNames.map((name) => renderCodelist(rc, name)).join(''));
  }
  return { html, sections };
}

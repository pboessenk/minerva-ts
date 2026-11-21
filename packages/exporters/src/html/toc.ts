import type { Model } from '@minerva/core';
import { esc, slug } from './markup.ts';
import type { EntityTree, TreeNode } from './tree.ts';

function tocNode(model: Model, node: TreeNode): string {
  if (!node.canonical) {
    const missing = node.missing ? ' ml-toc-missing' : '';
    return `<li class="ml-toc-li ml-toc-ref${missing}"><a href="#${slug(node.name)}" data-toc="entity">${esc(node.name)} <span class="ml-toc-ref-mark" title="reference">&#8599;</span></a></li>`;
  }
  const dot = model.entities.get(node.name)?.root === true ? '<span class="ml-root-dot" title="root"></span>' : '';
  const link = `${dot}<a href="#${slug(node.name)}" data-toc="entity">${esc(node.name)}</a>`;
  if (node.descendants.length === 0) return `<li class="ml-toc-li"><span class="ml-toc-leaf">${link}</span></li>`;
  const open = node.depth === 0 ? ' open' : '';
  let out = `<li class="ml-toc-li"><details class="ml-toc-branch"${open}><summary><span class="ml-toc-chevron" aria-hidden="true"></span>${link}</summary><ul class="ml-toc-tree">`;
  for (const descendant of node.descendants) out += tocNode(model, descendant);
  return out + '</ul></details></li>';
}

/** A flat list section of the sidebar; empty when there are no items. */
function listSection(heading: string, items: readonly string[]): string {
  if (items.length === 0) return '';
  return `<div class="ml-toc-section"><div class="ml-toc-h">${heading}</div><ul class="ml-toc-list">${items.join('')}</ul></div>`;
}

/** The sidebar: the entity tree, then operations, enums and codelists. */
export function renderToc(model: Model, tree: EntityTree, enumNames: readonly string[], codelistNames: readonly string[]): string {
  let out = '<div class="ml-toc-section"><div class="ml-toc-h">Entities</div><ul class="ml-toc-tree">';
  for (const node of tree.roots) out += tocNode(model, node);
  out += '</ul>';
  if (tree.orphans.length > 0) {
    out += '<div class="ml-toc-h ml-toc-h-sub">Orphans</div><ul class="ml-toc-tree">';
    for (const node of tree.orphans) out += tocNode(model, node);
    out += '</ul>';
  }
  out += '</div>';

  out += listSection(
    'Operations',
    model.operations.map((op) => `<li><a href="#op-${slug(op.id)}" data-toc="op">${esc(op.method)} ${esc(op.path)}</a></li>`),
  );
  out += listSection(
    'Enums',
    enumNames.map((name) => `<li><a href="#enum-${slug(name)}" data-toc="enum">${esc(name)}</a></li>`),
  );
  out += listSection(
    'Codelists',
    codelistNames.map((name) => `<li><a href="#cl-${slug(name)}" data-toc="codelist">${esc(name)}</a></li>`),
  );
  return out;
}

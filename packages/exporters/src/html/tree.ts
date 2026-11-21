import { sortStrings, subtypesOf, trimSuffix, type Child, type Model } from '@minerva/core';
import { renderEntityCard } from './entity-card.ts';
import { type RenderContext, banners, esc, slug } from './markup.ts';

/**
 * The entity tree: every root entity with its children, depth first. The
 * first occurrence of an entity is shown in full ("canonical"); later
 * occurrences are compact references to it.
 */
export interface TreeNode {
  readonly name: string;
  /** The parent-to-child link that introduced this node; `null` at the top level. */
  readonly child: Child | null;
  readonly depth: number;
  readonly canonical: boolean;
  /** A child link naming an entity the model does not have. */
  readonly missing: boolean;
  readonly descendants: readonly TreeNode[];
}

export interface EntityTree {
  /** One node per root entity, in name order. */
  readonly roots: readonly TreeNode[];
  /** Entities not reachable from any root, in name order. */
  readonly orphans: readonly TreeNode[];
  /** Entity name -> the entity under which it is shown in full; empty at the top level. */
  readonly canonicalParent: ReadonlyMap<string, string>;
}

export function buildEntityTree(model: Model): EntityTree {
  const canonicalParent = new Map<string, string>();

  const build = (name: string, parent: string, child: Child | null, depth: number): TreeNode => {
    const entity = model.entities.get(name);
    const node = { name, child, depth, canonical: false, missing: false, descendants: [] as TreeNode[] };
    if (entity === undefined) return { ...node, missing: true };
    if (canonicalParent.has(name)) return node;
    canonicalParent.set(name, parent);
    const descendants = entity.children.map((c) => build(c.name, name, c, depth + 1));
    return { ...node, canonical: true, descendants };
  };

  const rootNames = sortStrings([...model.entities].filter(([, entity]) => entity.root).map(([name]) => name));
  const roots = rootNames.map((name) => build(name, '', null, 0));
  // Listed before any orphan is built: an orphan shown under an earlier one
  // still gets its own top-level row, as a reference.
  const orphanNames = sortStrings([...model.entities.keys()].filter((name) => !canonicalParent.has(name)));
  const orphans = orphanNames.map((name) => build(name, '', null, 0));
  return { roots, orphans, canonicalParent };
}

/**
 * Referenced entity -> the subtypes (space separated) of the attribute that
 * references it, for attributes scoped to particular subtypes. Lets the
 * subtype switcher hide child nodes.
 */
function childSubtypes(model: Model, entityName: string): Map<string, string> {
  const out = new Map<string, string>();
  const entity = model.entities.get(entityName);
  if (entity === undefined) return out;
  for (const section of entity.sections) {
    for (const a of section.attributes) {
      if (a.applicableSubtypes.length === 0) continue;
      const base = trimSuffix(a.type, '[]');
      if (model.entities.has(base)) out.set(base, a.applicableSubtypes.join(' '));
    }
  }
  return out;
}

/** A compact row pointing at the canonical occurrence of an entity. */
function referenceRow(rc: RenderContext, node: TreeNode, subs: string, badges: string): string {
  let out = `<div class="ml-tree-ref" data-depth="${node.depth}" data-ref-to="${slug(node.name)}"`;
  if (subs !== '') out += ` data-subs="${esc(subs)}"`;
  out += '><span class="ml-tree-leader" aria-hidden="true">&#8627;</span>';
  if (node.missing) {
    out += `<span class="ml-ref-name">${esc(node.name)}</span>`;
    out += ' <span class="ml-ref-where ml-ref-missing">unknown entity</span>';
  } else {
    out += `<a class="ml-ref-name ml-link" href="#${slug(node.name)}">${esc(node.name)}</a>`;
    const parent = rc.canonicalParent.get(node.name) ?? '';
    if (parent !== '') {
      out += ` <span class="ml-ref-where">defined under <a href="#${slug(parent)}">${esc(parent)}</a></span>`;
    }
  }
  return out + badges + '</div>';
}

/** The hidden radios and visible labels of the subtype switcher. */
function subtypeSwitcher(entityName: string, subtypes: readonly string[]): { radios: string; bar: string } {
  const id = slug(entityName);
  const group = `subg-${id}`;
  let radios = `<input class="ml-subr" type="radio" name="${group}" id="sub-${id}-__base__" checked>`;
  let bar = '<div class="ml-subtype-bar"><span class="ml-subtype-bar-label">View subtype:</span>';
  bar += `<label class="ml-subtype-opt" for="sub-${id}-__base__">Base (all)</label>`;
  for (const subtype of subtypes) {
    radios += `<input class="ml-subr" type="radio" name="${group}" id="sub-${id}-${slug(subtype)}">`;
    bar += `<label class="ml-subtype-opt" for="sub-${id}-${slug(subtype)}">${esc(subtype)}</label>`;
  }
  return { radios, bar: bar + '</div>' };
}

/**
 * One tree node. `subs` lists the subtypes of the parent the node applies to
 * (space separated), or is empty when it applies to all.
 */
export function renderTreeNode(rc: RenderContext, node: TreeNode, subs: string): string {
  const entity = rc.model.entities.get(node.name);

  let badges = '';
  if (node.child !== null) {
    if (node.child.cardinality !== '') {
      badges += `<span class="ml-card-badge" title="cardinality">${esc(node.child.cardinality)}</span>`;
    }
    if (node.child.condition !== '') {
      badges += `<span class="ml-cond-badge" title="condition">${esc(node.child.condition)}</span>`;
    }
  }
  if (!node.canonical) return referenceRow(rc, node, subs, badges);

  let attributeCount = 0;
  let siviCount = 0;
  for (const section of entity?.sections ?? []) {
    for (const a of section.attributes) {
      attributeCount++;
      if (a.siviReference !== null && a.siviReference !== '') siviCount++;
    }
  }

  let out = `<details class="ml-tree-node" id="${slug(node.name)}" data-depth="${node.depth}"`;
  if (subs !== '') out += ` data-subs="${esc(subs)}"`;
  if (node.depth === 0) out += ' open';
  out += '><summary class="ml-tree-summary"><span class="ml-tree-chevron" aria-hidden="true"></span>';
  if (entity?.root === true) out += '<span class="ml-root-dot" title="Root entity"></span>';
  out += `<span class="ml-ent-name">${esc(node.name)}</span>`;
  out += badges;
  if (attributeCount > 0) out += `<span class="ml-ent-count" title="attribute count">${attributeCount}</span>`;
  if (siviCount > 0) out += `<span class="ml-ent-sivi-count" title="SIVI references">${siviCount} SIVI</span>`;
  if (entity !== undefined && entity.description !== '') {
    out += `<span class="ml-ent-desc">${esc(entity.description)}</span>`;
  }
  out += '</summary><div class="ml-tree-body">';

  // The radios must be direct children of .ml-tree-body: the generated
  // subtype CSS reaches the card and the children through sibling selectors.
  const subtypes = entity !== undefined ? subtypesOf(entity) : null;
  const switcher = subtypes !== null ? subtypeSwitcher(node.name, subtypes) : null;
  if (switcher !== null) out += switcher.radios;
  out += banners(entity?.openPoints ?? []);
  if (switcher !== null) out += switcher.bar;

  out += renderEntityCard(rc, node.name);

  if (node.descendants.length > 0) {
    const scoped = childSubtypes(rc.model, node.name);
    out += '<div class="ml-children">';
    for (const descendant of node.descendants) out += renderTreeNode(rc, descendant, scoped.get(descendant.name) ?? '');
    out += '</div>';
  }
  return out + '</div></details>';
}

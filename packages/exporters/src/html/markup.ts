import { escapeHtml, type AllowedType, type CatalogLookups, type Model, type OpenPoint } from '@minerva/core';

/** Escapes text for element content and quoted attribute values. */
export const esc = escapeHtml;

/** An id-safe form of a name: every character outside `[a-zA-Z0-9_-]` becomes `_` (one per code point). */
export function slug(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/gu, '_');
}

/** The anchor of one attribute row. */
export function attributeAnchor(entityName: string, attributeName: string): string {
  return `attr-${slug(entityName)}-${slug(attributeName)}`;
}

/** Open-point banners above an entity or enum; empty when there are none. */
export function banners(openPoints: readonly OpenPoint[]): string {
  if (openPoints.length === 0) return '';
  let out = '<div class="ml-banners">';
  for (const point of openPoints) {
    const type = point.type !== '' ? point.type : 'warning';
    out += `<div class="ml-banner ml-banner-${esc(type)}">${esc(point.text)}</div>`;
  }
  return out + '</div>';
}

/** Everything the section renderers read. */
export interface RenderContext {
  readonly model: Model;
  readonly lookups: CatalogLookups;
  /** The named codelist types, by type name. */
  readonly namedTypes: ReadonlyMap<string, AllowedType>;
  /** Entity name -> the entity under which it is shown in full; empty for a top-level entity. */
  readonly canonicalParent: ReadonlyMap<string, string>;
}

import {
  CONSTRAINT_KEYS,
  DISCRIMINATOR,
  allowedTypeName,
  attributeDescription,
  constraintMap,
  hasNamedType,
  subtypesOf,
  trimSuffix,
  type Attribute,
} from '@minerva/core';
import { type RenderContext, attributeAnchor, esc, slug } from './markup.ts';

/**
 * The attribute type, linked to where it is documented: a named codelist
 * type shows (and links to) the alias the specification exporters emit; an
 * entity or enum type links to its section.
 */
function typeBadge(rc: RenderContext, entityName: string, a: Attribute, discriminated: boolean): string {
  const { model } = rc;
  // Discriminators of subtyped entities get no named type, as in the
  // specification exports.
  const named = hasNamedType(a) && (!discriminated || a.name !== DISCRIMINATOR) ? allowedTypeName(entityName, a, model) : '';
  const display = named !== '' && a.type.endsWith('[]') ? named + '[]' : named !== '' ? named : a.type;

  let text = esc(display);
  if (a.format !== '') text += `<span class="ml-attr-fmt">&middot;${esc(a.format)}</span>`;

  const base = trimSuffix(a.type, '[]');
  // The lookups strip one more `[]`, so `X[][]` still links to entity X.
  const lookup = trimSuffix(base, '[]');
  if (named !== '') return `<a class="ml-attr-type ml-link" href="#cl-${slug(named)}">${text}</a>`;
  if (model.entities.has(lookup)) return `<a class="ml-attr-type ml-link" href="#${slug(base)}">${text}</a>`;
  if (model.enums.has(lookup)) return `<a class="ml-attr-type ml-link" href="#enum-${slug(base)}">${text}</a>`;
  return `<span class="ml-attr-type">${text}</span>`;
}

/** One attribute: a header line with name, type and badges, then description and example. */
function attributeRow(rc: RenderContext, entityName: string, a: Attribute, discriminated: boolean): string {
  const subs = a.applicableSubtypes.join(' ');
  let out = `<div class="ml-attr" id="${attributeAnchor(entityName, a.name)}"`;
  if (subs !== '') out += ` data-subs="${esc(subs)}"`;
  out += ` data-name="${esc(a.name)}"`;
  if (a.name === DISCRIMINATOR) out += ' data-entitytype="1"';
  out += '>';

  out += '<div class="ml-attr-head">';
  const requiredMark = a.required ? '<span class="ml-req-mark" title="required">*</span>' : '';
  out += `<span class="ml-attr-name">${esc(a.name)}${requiredMark}</span>`;
  out += typeBadge(rc, entityName, a, discriminated);
  if (a.pattern !== '') {
    out += `<span class="ml-attr-pattern" title="pattern: ${esc(a.pattern)}">${esc(a.pattern)}</span>`;
  }
  const constraints = constraintMap(a);
  for (const key of CONSTRAINT_KEYS) {
    const value = constraints.get(key);
    if (value !== undefined) out += `<span class="ml-attr-constraint" title="${key}">${key} ${esc(value)}</span>`;
  }
  if (a.siviReference !== null && a.siviReference !== '') {
    out += `<span class="ml-attr-sivi" title="SIVI reference">${esc(a.siviReference)}</span>`;
  }
  if (a.siviCodelist !== null && a.siviCodelist !== '') {
    out += `<span class="ml-attr-cl" title="SIVI codelist">${esc(a.siviCodelist)}</span>`;
  }
  if (a.applicableSubtypes.length > 0) {
    out += '<span class="ml-attr-subs">';
    for (const subtype of a.applicableSubtypes) out += `<span class="ml-subtype-tag">${esc(subtype)}</span>`;
    out += '</span>';
  }
  out += '</div>';

  const description = attributeDescription(entityName, a, rc.lookups.attributeDescriptions, rc.model);
  if (description !== '' || a.example !== '') {
    out += '<div class="ml-attr-body">';
    if (description !== '') out += `<span class="ml-attr-desc">${esc(description)}</span>`;
    if (a.example !== '') {
      if (description !== '') out += ' ';
      out += `<code class="ml-attr-ex" title="example">${esc(a.example)}</code>`;
    }
    out += '</div>';
  }
  return out + '</div>';
}

/** The attribute list of an entity, with a header row per named section. */
export function renderEntityCard(rc: RenderContext, entityName: string): string {
  const entity = rc.model.entities.get(entityName);
  if (entity === undefined) return '';
  const discriminated = subtypesOf(entity) !== null;

  let rows = '';
  for (const section of entity.sections) {
    if (section.name !== null && section.name !== '') rows += `<div class="ml-attr-section">${esc(section.name)}</div>`;
    for (const a of section.attributes) rows += attributeRow(rc, entityName, a, discriminated);
  }
  if (rows === '') return '<div class="ml-entity-card"><p class="ml-empty">No attributes defined.</p></div>';
  return `<div class="ml-entity-card"><div class="ml-attrs">${rows}</div></div>`;
}

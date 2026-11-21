import { codeNote, hasAnyCodeNotes } from '@minerva/core';
import { type RenderContext, esc, slug } from './markup.ts';

/**
 * One named codelist type (the same aliases the specification exporters
 * emit), listing exactly the values bound to that name in emission order.
 * The underlying SIVI codelist, if any, is shown as a tag and supplies the
 * code descriptions and notes.
 */
export function renderCodelist(rc: RenderContext, typeName: string): string {
  const type = rc.namedTypes.get(typeName);
  if (type === undefined) return '';
  const { lookups } = rc;
  const codelist = type.codelist ?? '';
  const codes = type.codelist !== null ? lookups.codelists?.get(type.codelist) : undefined;
  const description = type.codelist !== null ? (lookups.codelistDescriptions?.get(type.codelist) ?? '') : '';
  const count = type.values.length;

  let out = `<details class="ml-codelist" id="cl-${slug(typeName)}"><summary><span class="ml-cl-name">${esc(typeName)}</span>`;
  if (codelist !== '') out += `<span class="ml-subtype-tag">${esc(codelist)}</span>`;
  out +=
    description !== ''
      ? `<span class="ml-cl-desc">${esc(description)} &middot; ${count} codes</span></summary>`
      : `<span class="ml-cl-desc">${count} codes</span></summary>`;

  if (count === 0) return out + '<p class="ml-empty" style="padding:12px 16px;">No codes available.</p></details>';

  const withNotes = codelist !== '' && hasAnyCodeNotes(lookups.codeNotes, codelist, type.values);
  out += '<table class="ml-cl-table"><thead><tr><th>Code</th><th>Description</th>';
  if (withNotes) out += '<th>Note</th>';
  out += '</tr></thead><tbody>';
  for (const value of type.values) {
    out += `<tr><td><span class="ml-cl-code">${esc(value)}</span></td><td>${esc(codes?.get(value) ?? '')}</td>`;
    if (withNotes) out += `<td>${esc(codeNote(lookups.codeNotes, codelist, value))}</td>`;
    out += '</tr>';
  }
  return out + '</tbody></table></details>';
}

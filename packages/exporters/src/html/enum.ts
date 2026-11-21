import type { Model } from '@minerva/core';
import { banners, esc, slug } from './markup.ts';

/** One enum: a collapsible table of its values. */
export function renderEnum(model: Model, enumName: string): string {
  const enumeration = model.enums.get(enumName);
  if (enumeration === undefined) return '';
  let out = `<details class="ml-enum" id="enum-${slug(enumName)}"><summary><span class="ml-enum-name">${esc(enumName)}</span>`;
  if (enumeration.description !== '') out += `<span class="ml-enum-desc">${esc(enumeration.description)}</span>`;
  out += '</summary>';
  out += banners(enumeration.openPoints);
  out += '<table class="ml-enum-table"><thead><tr><th>Name</th><th>Value</th><th>Label</th><th>Description</th></tr></thead><tbody>';
  for (const v of enumeration.values) {
    out += `<tr><td><span class="ml-ev-name">${esc(v.name)}</span></td><td><code>${esc(v.value)}</code></td><td>${esc(v.label)}</td><td>${esc(v.description)}</td></tr>`;
  }
  return out + '</tbody></table></details>';
}

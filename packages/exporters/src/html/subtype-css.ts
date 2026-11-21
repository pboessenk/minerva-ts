import { quote, sortStrings, subtypesOf, type Model } from '@minerva/core';
import { slug } from './markup.ts';

/**
 * The per-entity rules behind the script-free subtype switcher. Selecting a
 * subtype radio highlights its label and hides the attribute rows and child
 * nodes that do not apply to that subtype. One line per rule.
 */
export function subtypeFilterCss(model: Model): string {
  const discriminated: [name: string, subtypes: string[]][] = [];
  for (const name of sortStrings(model.entities.keys())) {
    const subtypes = subtypesOf(model.entities.get(name)!);
    if (subtypes !== null) discriminated.push([name, subtypes]);
  }

  let out = '';
  for (const [name, subtypes] of discriminated) {
    const id = slug(name);
    for (const option of ['__base__', ...subtypes]) {
      const opt = slug(option);
      out += `#sub-${id}-${opt}:checked ~ .ml-subtype-bar label[for="sub-${id}-${opt}"]{background:#0969da;color:#fff;border-color:#0969da}\n`;
    }
    for (const subtype of subtypes) {
      const sub = slug(subtype);
      const value = quote(subtype);
      out += `#sub-${id}-${sub}:checked ~ .ml-entity-card .ml-attr[data-subs]:not([data-subs~=${value}]):not([data-entitytype="1"]){display:none}\n`;
      out += `#sub-${id}-${sub}:checked ~ .ml-children > .ml-tree-node[data-subs]:not([data-subs~=${value}]),#sub-${id}-${sub}:checked ~ .ml-children > .ml-tree-ref[data-subs]:not([data-subs~=${value}]){display:none}\n`;
    }
  }
  return out;
}

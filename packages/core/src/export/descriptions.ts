import type { Attribute, Model } from '../model/types.ts';
import { toLower } from '../text/case.ts';
import { codelistLabel } from './named-types.ts';

/**
 * The attribute's own description: the authored text, else the catalogue's
 * description of the attribute it references, else nothing.
 */
export function attributeBaseDescription(a: Attribute, catalogDescriptions: ReadonlyMap<string, string> | null): string {
  if (a.description !== '') return a.description;
  if (catalogDescriptions !== null && a.siviReference !== null) {
    return catalogDescriptions.get(toLower(a.siviReference)) ?? '';
  }
  return '';
}

/**
 * The description exported to specifications: the base description, led by
 * `Codelist: <name>.` when a codelist or enum is bound to the attribute.
 */
export function attributeDescription(
  entityName: string,
  a: Attribute,
  catalogDescriptions: ReadonlyMap<string, string> | null,
  model: Model,
): string {
  const base = attributeBaseDescription(a, catalogDescriptions);
  const label = codelistLabel(entityName, a, model);
  if (label === '') return base;
  return base === '' ? `Codelist: ${label}.` : `Codelist: ${label}. ${base}`;
}

/** The description of one subtype: workspace text, else the catalogue's, else a generic line. */
export function subtypeDescription(entityName: string, subtype: string, descriptions: ReadonlyMap<string, string>): string {
  return descriptions.get(`${toLower(entityName)}.${toLower(subtype)}`) ?? `${entityName} subtype: ${subtype}`;
}

/** The workspace note on one code of a codelist, or an empty string. */
export function codeNote(notes: ReadonlyMap<string, ReadonlyMap<string, string>>, codelist: string, code: string): string {
  return notes.get(codelist)?.get(code) ?? '';
}

/** True when at least one of `values` has a note. */
export function hasAnyCodeNotes(
  notes: ReadonlyMap<string, ReadonlyMap<string, string>>,
  codelist: string,
  values: readonly string[],
): boolean {
  const forCodelist = notes.get(codelist);
  return forCodelist !== undefined && values.some((v) => forCodelist.has(v));
}

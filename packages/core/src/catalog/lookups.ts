import type { Model } from '../model/types.ts';
import { equalFold, toLower } from '../text/case.ts';
import { byteLength, sliceBytes } from '../text/utf8.ts';
import type { Catalog, CatalogEntity, Codelist, CodelistLookup } from './types.ts';

/** Codelist name -> code -> description, or `null` when no codelists were loaded. */
export function buildCodelistLookup(codelists: readonly Codelist[] | null): CodelistLookup | null {
  if (codelists === null) return null;
  const lookup: CodelistLookup = new Map();
  for (const item of codelists) {
    const codes = new Map<string, string>();
    for (const code of item.codes ?? []) codes.set(code.codeValue, code.description);
    lookup.set(item.name, codes);
  }
  return lookup;
}

/** Codelist name -> its description, for codelists that have one. `null` when the catalogue has no codelists. */
export function codelistDescriptions(codelists: readonly Codelist[] | null): Map<string, string> | null {
  if (codelists === null || codelists.length === 0) return null;
  const lookup = new Map<string, string>();
  for (const item of codelists) {
    if (item.description !== '') lookup.set(item.name, item.description);
  }
  return lookup;
}

/**
 * `entity.attribute` (lower case) -> catalogue description. `null` when the
 * catalogue has no entities.
 *
 * Catalogue descriptions start with `entity.subtype. `; that prefix is
 * removed. When an attribute occurs under several subtypes the first
 * description wins.
 */
export function attributeDescriptions(entities: readonly CatalogEntity[] | null): Map<string, string> | null {
  if (entities === null || entities.length === 0) return null;
  const lookup = new Map<string, string>();
  for (const entity of entities) {
    const entityLower = toLower(entity.name);
    for (const entityType of entity.entityTypes) {
      const prefix = `${entityLower}.${toLower(entityType.name)}. `;
      for (const attribute of entityType.attributes) {
        const key = `${entityLower}.${toLower(attribute.name)}`;
        if (attribute.description === '' || lookup.has(key)) continue;
        let description = attribute.description;
        if (toLower(description).startsWith(prefix)) description = sliceBytes(description, byteLength(prefix));
        lookup.set(key, description);
      }
    }
  }
  return lookup;
}

/** `entity.subtype` (lower case) -> catalogue description. `null` when the catalogue has no entities. */
export function subtypeDescriptions(entities: readonly CatalogEntity[] | null): Map<string, string> | null {
  if (entities === null || entities.length === 0) return null;
  const lookup = new Map<string, string>();
  for (const entity of entities) {
    const entityLower = toLower(entity.name);
    for (const entityType of entity.entityTypes) {
      if (entityType.description !== '') lookup.set(`${entityLower}.${toLower(entityType.name)}`, entityType.description);
    }
  }
  return lookup;
}

/**
 * Model entity name -> catalogue entity name, for entities that were renamed
 * relative to the catalogue (say, a model entity "Asset" whose attributes
 * reference `object.*`).
 *
 * The catalogue entity is read off the first attribute that carries a
 * reference of the form `entity.attribute`.
 */
export function entityAliases(model: Model): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const [entityName, entity] of model.entities) {
    const reference = entity.sections
      .flatMap((section) => section.attributes)
      .map((a) => a.siviReference)
      .find((ref): ref is string => {
        if (ref === null) return false;
        const dot = ref.indexOf('.');
        return dot >= 0 && !ref.slice(0, dot).includes(' ');
      });
    if (reference === undefined) continue;
    const catalogName = reference.slice(0, reference.indexOf('.'));
    if (!equalFold(catalogName, entityName)) aliases.set(entityName, catalogName);
  }
  return aliases;
}

/** The lookups an export needs, resolved for one model. */
export interface CatalogLookups {
  /** `null`: no codelists loaded. */
  codelists: CodelistLookup | null;
  /** `null`: no data catalogue loaded. */
  attributeDescriptions: Map<string, string> | null;
  /** Catalogue descriptions, aliased to the model's entity names, with workspace overrides applied. */
  subtypeDescriptions: Map<string, string>;
  /** `null`: no codelists loaded. */
  codelistDescriptions: Map<string, string> | null;
  codeNotes: Map<string, Map<string, string>>;
}

/**
 * Builds the lookups for exporting `model`.
 *
 * Subtype descriptions are looked up by the model's own entity names, so
 * every catalogue entry is also registered under the model's alias for that
 * entity; an entry the model already has under that key is kept. Workspace
 * descriptions are applied last and always win.
 */
export function buildCatalogLookups(catalog: Catalog, model: Model): CatalogLookups {
  let subtypes = subtypeDescriptions(catalog.entities);
  if (subtypes !== null) {
    const original = [...subtypes];
    for (const [modelName, catalogName] of entityAliases(model)) {
      const modelLower = toLower(modelName);
      const catalogLower = toLower(catalogName);
      if (modelLower === catalogLower) continue;
      for (const [key, description] of original) {
        if (!key.startsWith(catalogLower + '.')) continue;
        const aliasKey = modelLower + '.' + key.slice(catalogLower.length + 1);
        if (!subtypes.has(aliasKey)) subtypes.set(aliasKey, description);
      }
    }
  }
  subtypes ??= new Map();
  for (const [key, description] of catalog.custom.subtypes) {
    if (description !== '') subtypes.set(toLower(key), description);
  }
  return {
    codelists: buildCodelistLookup(catalog.codelists),
    attributeDescriptions: attributeDescriptions(catalog.entities),
    subtypeDescriptions: subtypes,
    codelistDescriptions: codelistDescriptions(catalog.codelists),
    codeNotes: catalog.custom.codeNotes,
  };
}

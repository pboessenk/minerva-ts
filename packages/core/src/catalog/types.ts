/**
 * The SIVI reference catalogue: codelists and the AFD data catalogue.
 *
 * Read-only reference data. It is fetched from SIVI by the catalogue updater
 * and stored in the workspace's data directory as one JSON file per codelist
 * and per entity. Field names on disk are capitalised (`Name`, `Code`,
 * `EntityType`); these types are the decoded form.
 */

export interface CodelistCode {
  codeValue: string;
  description: string;
}

export interface Codelist {
  name: string;
  description: string;
  /** `null` when the file has no `Code` key at all (as opposed to an empty list). */
  codes: CodelistCode[] | null;
}

export interface CatalogAttribute {
  name: string;
  description: string;
  datatype: string;
  codelist: string;
  afd1: string;
}

export interface CatalogEntityType {
  name: string;
  description: string;
  attributes: CatalogAttribute[];
}

export interface CatalogEntity {
  name: string;
  description: string;
  entityTypes: CatalogEntityType[];
}

/** Workspace-authored text layered over the catalogue. */
export interface CustomDescriptions {
  /** `entity.subtype` -> description; replaces the catalogue's. */
  subtypes: Map<string, string>;
  /** codelist name -> code value -> note. */
  codeNotes: Map<string, Map<string, string>>;
}

/**
 * Everything the exporters need from the reference data.
 *
 * `codelists` and `entities` are `null` when the corresponding directory
 * could not be read at all, which is different from being present but empty.
 */
export interface Catalog {
  /** In file-name order. */
  codelists: Codelist[] | null;
  /** In file-name order. */
  entities: CatalogEntity[] | null;
  custom: CustomDescriptions;
}

/** Codelist name -> code value -> description. */
export type CodelistLookup = Map<string, Map<string, string>>;

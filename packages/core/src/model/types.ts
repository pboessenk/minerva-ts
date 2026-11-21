/**
 * The API model as the exporters, validators and comparer see it.
 *
 * This is the *decoded* form: every field is present, with an empty string,
 * `false`, an empty collection or `null` standing in for anything the file
 * left out. The file on disk is the source of truth and may carry additional
 * keys (the editor owns those); see `decodeModel` for the mapping.
 *
 * Collections keyed by name are `Map`s. Their iteration order is the order
 * in the file and carries no meaning: anything that emits entities or enums
 * sorts explicitly (see `text/compare.ts`).
 */

export interface Contact {
  name: string;
  email: string;
  url: string;
}

export interface Security {
  enabled: boolean;
  /** For example "JWT". */
  bearerFormat: string;
  description: string;
}

export interface Server {
  url: string;
  description: string;
}

export interface ChangelogEntry {
  /** added, changed, fixed or removed. */
  category: string;
  text: string;
}

export interface ChangelogRelease {
  version: string;
  /** YYYY-MM-DD */
  date: string;
  entries: ChangelogEntry[];
}

export interface Changelog {
  open: ChangelogEntry[];
  releases: ChangelogRelease[];
}

/** A contract file this model can be compared against. `path` is relative to the workspace root. */
export interface CompareSource {
  id: string;
  label: string;
  path: string;
}

export interface OpenPoint {
  text: string;
  /** info, warning or error. */
  type: string;
}

export interface Attribute {
  name: string;
  /** `string`, `number`, `integer`, `boolean`, `Date`, an entity or enum name, or any of those followed by `[]`. */
  type: string;
  format: string;
  /** ECMA-262 regular expression; applies to plain strings. */
  pattern: string;
  minLength: number | null;
  maxLength: number | null;
  minimum: number | null;
  maximum: number | null;
  exclusiveMinimum: number | null;
  exclusiveMaximum: number | null;
  minItems: number | null;
  maxItems: number | null;
  /** Stored as text; typed on export according to `type`. */
  default: string;
  required: boolean;
  /** Public documentation; exported. */
  description: string;
  /** Example value as text; exported. */
  example: string;
  /** Reference into the SIVI data catalogue, `entity.attribute`. `null` when unset; an empty string counts as set. */
  siviReference: string | null;
  /** Name of a SIVI codelist. `null` when unset; an empty string counts as set. */
  siviCodelist: string | null;
  /** Subset of codelist or enum values this attribute accepts. */
  allowedValues: string[];
  /** Name of the exported type that carries `allowedValues`. */
  allowedName: string;
  /** Subtypes of a discriminated entity this attribute belongs to; empty means all. */
  applicableSubtypes: string[];
  /** Internal notes; never exported to specifications. */
  notes: string;
}

export interface Section {
  name: string | null;
  attributes: Attribute[];
}

export interface Child {
  name: string;
  cardinality: string;
  condition: string;
  propertyName: string;
}

export interface Entity {
  description: string;
  root: boolean;
  /** Shared schema (e.g. an error body): referenced by operations without pulling them into a filtered export. */
  excludeFromInclusion: boolean;
  children: Child[];
  sections: Section[];
  openPoints: OpenPoint[];
}

export interface EnumValue {
  /** Identifier used in generated code. */
  name: string;
  /** Value on the wire. */
  value: string;
  /** Display label. */
  label: string;
  description: string;
}

export interface Enum {
  description: string;
  values: EnumValue[];
  openPoints: OpenPoint[];
}

export interface Parameter {
  name: string;
  /** path, query or header. */
  in: string;
  type: string;
  required: boolean;
  description: string;
}

export interface OperationResponse {
  description: string;
  /** Entity name, or empty for a response without a body. */
  schema: string;
  responseBodyArray: boolean;
}

export interface Operation {
  id: string;
  method: string;
  path: string;
  summary: string;
  description: string;
  tags: string[];
  /** Entity name, or empty for an operation without a body. */
  requestBody: string;
  requestBodyArray: boolean;
  parameters: Parameter[];
  /** Keyed by status code. */
  responses: Map<string, OperationResponse>;
}

export interface Example {
  id: string;
  operationId: string;
  /** Identifier used in exports; falls back to `id`. */
  technicalName: string;
  summary: string;
  parameterValues: Map<string, string>;
  /**
   * The payload exactly as written in the model file (key order, number
   * spelling and white space included), or `null` when the key is absent.
   * A JSON `null` in the file is the text "null".
   */
  request: string | null;
  response: string | null;
  responseCode: string;
}

/**
 * Per-model export identity. These used to be constants in the exporters;
 * they live in the model file under `export` so the code carries no
 * knowledge of any particular API.
 */
export interface ModelExportSettings {
  /** TypeSpec namespace. Empty: derived from the title. */
  namespace: string;
  /** Entity whose tree is emitted first. Empty: entities are emitted in name order. */
  primaryRoot: string;
}

export interface Model {
  version: string;
  color: string;
  title: string;
  subtitle: string;
  lastModified: string;
  servers: Server[];
  security: Security | null;
  contact: Contact | null;
  changelog: Changelog | null;
  compareSources: CompareSource[];
  entities: Map<string, Entity>;
  enums: Map<string, Enum>;
  operations: Operation[];
  examples: Example[];
  /** Codelist name -> exported type name, shared by every attribute bound to the whole codelist. */
  codelistNames: Map<string, string>;
  export: ModelExportSettings;
}

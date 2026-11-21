/**
 * The model file as JSON: the shape on disk, which the editor edits in place
 * and the server saves exactly as received.
 *
 * `decodeModel` turns this into the decoded `Model` (see `types.ts`). The
 * decoder treats an absent key and a JSON `null` alike, so every optional
 * key may also be `null`; the editor writes `null` to clear a value. Keys
 * the editor always writes (names, types, ids) are typed as required: that
 * is what a well-formed model file has, although the decoder accepts their
 * absence. A file may carry keys of its own; they are kept on save and
 * ignored by the decoder.
 *
 * `decode.ts` checks at compile time that every key it reads is declared
 * here, so the two cannot drift apart.
 */

/** Any JSON value. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Cardinality of a parent-to-child link: array types give `*` or `1..*`, others `0..1` or `1`. */
export type Cardinality = '1' | '0..1' | '*' | '1..*';

/** Severity of an open point (the banner shown on an entity or enum). */
export type OpenPointType = 'warning' | 'error' | 'info';

export interface RawOpenPoint {
  text?: string | null;
  type?: OpenPointType | null;
}

/** The validation keywords of an attribute: JSON numbers for the bounds, strings for pattern and default. */
export interface RawConstraints {
  pattern?: string | null;
  minLength?: number | null;
  maxLength?: number | null;
  minimum?: number | null;
  maximum?: number | null;
  exclusiveMinimum?: number | null;
  exclusiveMaximum?: number | null;
  minItems?: number | null;
  maxItems?: number | null;
  default?: string | null;
}

export interface RawAttribute extends RawConstraints {
  name: string;
  /** `string`, `number`, `integer`, `boolean`, `Date`, an entity or enum name, or any of those followed by `[]`. */
  type: string;
  format?: string | null;
  required?: boolean | null;
  description?: string | null;
  example?: string | null;
  /** Reference into the SIVI data catalogue, `entity.attribute`. */
  siviReference?: string | null;
  /** Name of a SIVI codelist. */
  siviCodelist?: string | null;
  allowedValues?: string[] | null;
  allowedName?: string | null;
  applicableSubtypes?: string[] | null;
  /** Internal notes; never exported to specifications. */
  notes?: string | null;
}

export interface RawSection {
  name?: string | null;
  attributes?: RawAttribute[] | null;
}

/** A child link as saved: derived from the attribute types and written back on save. */
export interface RawChild {
  name: string;
  cardinality: Cardinality;
  condition?: string | null;
  propertyName?: string | null;
}

export interface RawEntity {
  description?: string | null;
  root?: boolean | null;
  excludeFromInclusion?: boolean | null;
  /** Read by the editor only. */
  parent?: string | null;
  children?: RawChild[] | null;
  sections?: RawSection[] | null;
  openPoints?: RawOpenPoint[] | null;
}

export interface RawEnumValue {
  /** Identifier used in generated code. */
  name?: string | null;
  /** Value on the wire. */
  value: string;
  /** Display label. */
  label?: string | null;
  description?: string | null;
}

export interface RawEnum {
  description?: string | null;
  values?: RawEnumValue[] | null;
  openPoints?: RawOpenPoint[] | null;
}

export interface RawParameter {
  name: string;
  /** path, query or header. */
  in: string;
  type: string;
  required?: boolean | null;
  description?: string | null;
}

export interface RawOperationResponse {
  description?: string | null;
  /** Name of the entity the response body is made of. */
  schema?: string | null;
  responseBodyArray?: boolean | null;
}

export interface RawOperation {
  id: string;
  method: string;
  path: string;
  summary?: string | null;
  description?: string | null;
  tags?: string[] | null;
  /** Name of the entity the request body is made of. */
  requestBody?: string | null;
  requestBodyArray?: boolean | null;
  parameters?: RawParameter[] | null;
  /** Keyed by status code. */
  responses?: Record<string, RawOperationResponse> | null;
}

export interface RawExample {
  id: string;
  operationId: string;
  technicalName?: string | null;
  summary?: string | null;
  parameterValues?: Record<string, string> | null;
  request?: JsonValue;
  response?: JsonValue;
  responseCode?: string | null;
}

export interface RawServer {
  url?: string | null;
  description?: string | null;
}

export interface RawSecurity {
  enabled?: boolean | null;
  bearerFormat?: string | null;
  description?: string | null;
}

export interface RawContact {
  name?: string | null;
  email?: string | null;
  url?: string | null;
}

export interface RawChangelogEntry {
  category: string;
  text: string;
}

export interface RawChangelogRelease {
  version: string;
  /** YYYY-MM-DD */
  date: string;
  entries: RawChangelogEntry[];
}

/** `releases` is ordered newest first. */
export interface RawChangelog {
  open: RawChangelogEntry[];
  releases: RawChangelogRelease[];
}

export interface RawCompareSource {
  id?: string | null;
  label?: string | null;
  path?: string | null;
}

export interface RawExportSettings {
  namespace?: string | null;
  primaryRoot?: string | null;
}

export interface RawModel {
  version?: string | null;
  color?: string | null;
  title?: string | null;
  subtitle?: string | null;
  lastModified?: string | null;
  servers?: RawServer[] | null;
  security?: RawSecurity | null;
  contact?: RawContact | null;
  changelog?: RawChangelog | null;
  compareSources?: RawCompareSource[] | null;
  entities: Record<string, RawEntity>;
  enums?: Record<string, RawEnum> | null;
  operations?: RawOperation[] | null;
  examples?: RawExample[] | null;
  /** Codelist name -> exported type name. */
  codelistNames?: Record<string, string> | null;
  export?: RawExportSettings | null;
}

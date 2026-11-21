/**
 * Shapes of the model the editor works on.
 *
 * Two graphs exist side by side:
 * - the raw model (`RawModel`): the JSON document as stored on disk and sent
 *   back on save, and
 * - the runtime model (`ApiEntity`, `ApiEnum`, `ApiOperation`, `ApiExample`):
 *   what the views render, rebuilt from the raw model by `state.ts`.
 */

/** Any JSON value. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Severity of an open point (the banner shown on an entity or enum). */
export type OpenPointType = 'warning' | 'error' | 'info';

export interface OpenPoint {
  text: string;
  type: OpenPointType;
}

/** Cardinality of a parent to child link: array types give `*` or `1..*`, others `0..1` or `1`. */
export type Cardinality = '1' | '0..1' | '*' | '1..*';

/** Every constraint key of an attribute, in display order. */
export type ConstraintKey =
  | 'minLength'
  | 'maxLength'
  | 'pattern'
  | 'minimum'
  | 'exclusiveMinimum'
  | 'maximum'
  | 'exclusiveMaximum'
  | 'minItems'
  | 'maxItems'
  | 'default';

/** Bounds are JSON numbers, pattern and default are strings, null when unset. */
export interface AttrConstraints {
  minLength: number | null;
  maxLength: number | null;
  pattern: string | null;
  minimum: number | null;
  exclusiveMinimum: number | null;
  maximum: number | null;
  exclusiveMaximum: number | null;
  minItems: number | null;
  maxItems: number | null;
  default: string | null;
}

/* ── Raw model ── */

export interface RawOpenPointObject {
  text?: string;
  type?: string;
}

/** An open point is stored either as a bare text or as an object. */
export type RawOpenPoint = string | RawOpenPointObject;

export interface RawAttribute extends Partial<AttrConstraints> {
  name: string;
  type: string;
  format?: string;
  required?: boolean;
  siviReference?: string;
  siviCodelist?: string;
  description?: string;
  example?: string;
  notes?: string;
  allowedValues?: string[];
  allowedName?: string;
  applicableSubtypes?: string[];
}

export interface RawSection {
  name?: string;
  attributes?: RawAttribute[];
}

/** Child link as saved: derived from the attribute types and synced back on save. */
export interface RawChild {
  name: string;
  cardinality: Cardinality;
  condition?: string;
}

export interface RawEntity {
  description?: string;
  root?: boolean;
  excludeFromInclusion?: boolean;
  parent?: string;
  sections?: RawSection[];
  openPoints?: RawOpenPoint[];
  children?: RawChild[];
}

export interface RawEnumValue {
  name?: string;
  label?: string;
  value: string;
  description?: string;
}

export interface RawEnum {
  description?: string;
  values?: RawEnumValue[];
  openPoints?: RawOpenPoint[];
}

export interface OperationParameter {
  name: string;
  in: string;
  type: string;
  required?: boolean;
  description?: string;
}

export interface OperationResponse {
  description?: string;
  /** Name of the entity the response body is made of. */
  schema?: string;
  responseBodyArray?: boolean;
}

export interface RawOperation {
  id: string;
  method: string;
  path: string;
  summary?: string;
  description?: string;
  tags?: string[];
  /** Name of the entity the request body is made of. */
  requestBody?: string | null;
  requestBodyArray?: boolean;
  parameters?: OperationParameter[];
  responses?: Record<string, OperationResponse>;
}

export interface RawExample {
  id: string;
  operationId: string;
  technicalName?: string;
  summary?: string;
  parameterValues?: Record<string, string>;
  request?: JsonValue | null;
  response?: JsonValue | null;
  responseCode?: string;
}

export interface RawServer {
  url?: string;
  description?: string;
}

export interface RawSecurity {
  enabled?: boolean;
  bearerFormat?: string;
  description?: string;
}

export interface RawContact {
  name?: string;
  email?: string;
  url?: string;
}

export interface ChangelogEntry {
  category: string;
  text: string;
}

export interface ChangelogRelease {
  version: string;
  date: string;
  entries: ChangelogEntry[];
}

/** `releases` is ordered newest first. */
export interface Changelog {
  open: ChangelogEntry[];
  releases: ChangelogRelease[];
}

export interface RawModel {
  version?: string;
  color?: string;
  title?: string;
  subtitle?: string;
  lastModified?: string;
  servers?: RawServer[];
  security?: RawSecurity;
  contact?: RawContact;
  changelog?: Changelog;
  entities: Record<string, RawEntity>;
  enums?: Record<string, RawEnum>;
  operations?: RawOperation[];
  examples?: RawExample[];
  codelistNames?: Record<string, string>;
}

/* ── Runtime model ── */

export interface ApiChild {
  name: string;
  card: Cardinality;
  condition: string | null;
}

/** A section divider in an attribute list has the type `_section` and the section name as note. */
export interface ApiAttr extends Partial<AttrConstraints> {
  name: string;
  type: string;
  format?: string | null;
  required?: boolean;
  sivi?: string | null;
  codelist?: string | null;
  description?: string | null;
  example?: string | null;
  note?: string | null;
  allowedValues?: string[] | null;
  allowedName?: string | null;
  applicableSubtypes?: string[] | null;
}

export interface ApiEntity {
  desc: string;
  root: boolean;
  excludeFromInclusion: boolean;
  parent: string | null;
  children: ApiChild[];
  attrs: ApiAttr[];
  openPoints: OpenPoint[];
}

export interface ApiEnumValue {
  codeName: string;
  name: string;
  value: string;
  note: string | null;
}

export interface ApiEnum {
  desc: string;
  values: ApiEnumValue[];
  openPoints: OpenPoint[];
}

export interface ApiOperation {
  id: string;
  method: string;
  path: string;
  summary: string;
  description: string;
  tags: string[];
  requestBody: string | null;
  requestBodyArray: boolean;
  parameters: OperationParameter[];
  responses: Record<string, OperationResponse>;
}

export interface ApiExample {
  id: string;
  operationId: string;
  technicalName: string;
  summary: string;
  parameterValues: Record<string, string>;
  request: JsonValue | null;
  response: JsonValue | null;
  responseCode: string;
}

/** The active API: set when its view is activated. */
export interface ApiConfig {
  name: string;
  dataPath: string;
  color?: string;
}

export type ApiModelMap = Record<string, ApiEntity>;
export type ApiEnumMap = Record<string, ApiEnum>;

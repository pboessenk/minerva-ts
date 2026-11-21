/** Shapes of the runtime model data the operation and example editors work on. */

/** A JSON object as stored in an example body. */
export type JsonObject = { [key: string]: unknown };

/** Maps a dot-path inside an example body to the attribute type it was written with. */
export type TypeMap = Record<string, string>;

/** Stored request or response body of an example (an array for array bodies). */
export type ExampleBody = JsonObject | JsonObject[] | null;

export interface ApiAttr {
  name: string;
  type: string;
  format?: string | null;
  required?: boolean;
  sivi?: string | null;
  codelist?: string | null;
  description?: string | null;
  example?: unknown;
  note?: string | null;
  allowedValues?: string[] | null;
  allowedName?: string | null;
  applicableSubtypes?: string[] | null;
  /** Constraint keys (minLength, pattern, ...) are read by name, see constraintsForAttr. */
  [key: string]: unknown;
}

export interface ApiEntity {
  attrs: ApiAttr[];
  [key: string]: unknown;
}

export interface ApiEnumValue {
  codeName?: string;
  name?: string;
  value: string;
  note?: string | null;
}

export interface ApiEnum {
  values?: ApiEnumValue[];
  [key: string]: unknown;
}

export interface ApiParam {
  name: string;
  in: string;
  type: string;
  required?: boolean;
  description?: string;
}

export interface ApiResponse {
  description?: string;
  schema?: string;
  responseBodyArray?: boolean;
}

export interface ApiOp {
  id: string;
  method: string;
  path: string;
  summary: string;
  description: string;
  tags: string[];
  requestBody: string | null;
  requestBodyArray?: boolean;
  parameters?: ApiParam[];
  responses: Record<string, ApiResponse>;
}

export interface ApiExample {
  id: string;
  operationId: string;
  technicalName: string;
  summary: string;
  parameterValues?: Record<string, string>;
  request: ExampleBody;
  response: ExampleBody;
  responseCode: string;
}

export interface CodelistCode {
  CodeValue?: string;
  Description?: string;
}

export interface CodelistEntry {
  Code?: CodelistCode[];
  [key: string]: unknown;
}

export interface EntityTypeSubtype {
  name?: string;
  description?: string;
}

export interface EntityTypeEntry {
  subtypes?: EntityTypeSubtype[];
  [key: string]: unknown;
}

/** Applicable, set constraints of an attribute. */
export interface Constraints {
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  exclusiveMinimum?: number;
  maximum?: number;
  exclusiveMaximum?: number;
  minItems?: number;
  maxItems?: number;
}

/** How an attribute type is rendered, see formTypeInfo. */
export type TypeInfo =
  | { kind: 'skip' }
  | {
      kind: 'primitive' | 'primitive-array' | 'enum' | 'enum-array' | 'entity' | 'entity-array' | 'unresolved';
      base: string;
      isArray: boolean;
    };

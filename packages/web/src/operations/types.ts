/**
 * Shapes the operation and example editors add to the model: example bodies,
 * the catalogue data they read and the form helpers' own types. The model
 * itself is not restated here: the runtime shapes (`ApiAttr`, `ApiEntity`,
 * `ApiOperation`, `ApiExample`, ...) live in `editor/model-types.ts` and the
 * raw file shapes in `@minerva/core` (`model/file.ts`).
 */
/** A JSON object as stored in an example body. Values are loose: the form code reads them by attribute type. */
export type JsonObject = { [key: string]: unknown };

/** Maps a dot-path inside an example body to the attribute type it was written with. */
export type TypeMap = Record<string, string>;

/** Stored request or response body of an example: an object, an array of objects for array bodies, or null; the file allows any JSON. */
export type ExampleBody = JsonObject | JsonObject[] | null;

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

/** The applicable constraints an attribute has set, as stamped on a form control for the violation scanner. */
export interface SetConstraints {
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

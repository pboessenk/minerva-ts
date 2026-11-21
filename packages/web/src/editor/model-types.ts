/**
 * Runtime shapes of the model the editor works on.
 *
 * Two graphs exist side by side:
 * - the raw model (`RawModel` and friends): the JSON document as stored on
 *   disk and sent back on save. Its shapes live in `@minerva/core`
 *   (`model/file.ts`) and are imported from there, and
 * - the runtime model (`ApiEntity`, `ApiEnum`, `ApiOperation`, `ApiExample`):
 *   what the views render, rebuilt from the raw model by `state.ts`. Its
 *   shapes live here; members that are identical to a raw shape use the core
 *   type.
 */
import type { Cardinality, OpenPointType, RawOperationResponse, RawParameter } from '@minerva/core';
import type { ExampleBody } from '../operations/types.ts';

export interface OpenPoint {
  text: string;
  type: OpenPointType;
}

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
  /** Absent on an operation created in the editor until its first parameter is added. */
  parameters?: RawParameter[];
  responses: Record<string, RawOperationResponse>;
}

export interface ApiExample {
  id: string;
  operationId: string;
  technicalName: string;
  summary: string;
  /** Absent on an example created in the editor until its first parameter value is set. */
  parameterValues?: Record<string, string>;
  request: ExampleBody;
  response: ExampleBody;
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

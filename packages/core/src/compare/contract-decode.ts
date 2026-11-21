import { type JsonNode, JsonSyntaxError, parseJson } from '../json/parse.ts';
import { equalFold } from '../text/case.ts';
import { quote } from '../text/escape.ts';
import type { LooseValue } from './value-text.ts';

/**
 * Decoding of an OpenAPI 3.x JSON document into the few structures the
 * comparer reads.
 *
 * The decoding rules show in the result, so they are fixed exactly:
 *
 *  - Member names match exactly, else case-insensitively; unknown members
 *    are ignored.
 *  - A JSON `null` clears a nullable field (object, list, map, loose value)
 *    and leaves any other field as it was.
 *  - A member that occurs twice is decoded into what the first occurrence
 *    left: objects merge, list elements are reused by position (and the
 *    list takes the new length), maps keep their entries. Map entries and
 *    loose values are replaced, not merged.
 *  - A value of the wrong type is skipped and decoding goes on; the first
 *    such problem is reported, in the wording of `typeErrorMessage`.
 *  - A syntax error anywhere wins over type errors.
 */

export interface OaDocument {
  openapi: string;
  info: { title: string; version: string };
  /** `null` when absent; an item is `null` when written as null. */
  paths: Map<string, Map<string, JsonNode> | null> | null;
  components: { schemas: Map<string, OaSchema | null> | null };
}

export interface OaSchema {
  ref: string;
  type: LooseValue;
  format: string;
  pattern: string;
  minLength: number | null;
  maxLength: number | null;
  minimum: number | null;
  maximum: number | null;
  exclusiveMinimum: LooseValue;
  exclusiveMaximum: LooseValue;
  minItems: number | null;
  maxItems: number | null;
  default: LooseValue;
  properties: Map<string, OaSchema | null> | null;
  required: string[] | null;
  items: OaSchema | null;
  enum: LooseValue[] | null;
  const: LooseValue;
  allOf: (OaSchema | null)[] | null;
  anyOf: (OaSchema | null)[] | null;
  oneOf: (OaSchema | null)[] | null;
  /** Present (even as JSON null) or not. */
  additionalProperties: JsonNode | null;
  unevaluatedProperties: JsonNode | null;
  description: string;
  xSiviCode: string;
  discriminator: { propertyName: string } | null;
}

export interface OaParameter {
  name: string;
  in: string;
  required: boolean;
  schema: OaSchema | null;
}

export interface OaMedia {
  schema: OaSchema | null;
}

export interface OaRequestBody {
  required: boolean;
  content: Map<string, OaMedia> | null;
}

export interface OaResponse {
  description: string;
  content: Map<string, OaMedia> | null;
}

export interface OaOperation {
  operationId: string;
  tags: string[] | null;
  parameters: OaParameter[] | null;
  requestBody: OaRequestBody | null;
  responses: Map<string, OaResponse> | null;
}

/** The document could not be decoded; `message` is the text the HTTP answer carries. */
export class ContractDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractDecodeError';
  }
}

// ── Decoding machinery ──

class DecodeState {
  /** Name of the root type, or empty for an unnamed one (a list). */
  readonly root: string;
  readonly path: string[] = [];
  error: string | undefined;

  constructor(root: string) {
    this.root = root;
  }

  /** Records a value that does not fit its target, unless an earlier problem was recorded. */
  fail(value: string, typeName: string): void {
    this.error ??= typeErrorMessage(value, typeName, this.root, this.path);
  }
}

/** A JSON pointer token: `~` and `/` are escaped. */
function pointerToken(token: string): string {
  return token.replaceAll('~', '~0').replaceAll('/', '~1');
}

/**
 * The text of a type error: `json: cannot unmarshal number into Go struct
 * field oaDocument.info.title of type string`. The location is the path of
 * member names and indices from the root, dot-separated; when it ends in an
 * index the words "Go struct field" are left out.
 */
export function typeErrorMessage(value: string, typeName: string, root: string, path: readonly string[]): string {
  if (path.length === 0) return `json: cannot unmarshal ${value} into Go value of type ${typeName}`;
  const field = path.map(pointerToken).join('.');
  const last = field.slice(field.lastIndexOf('.') + 1);
  const intoWhat = last !== '' && /^[0-9]+$/.test(last) ? '' : 'Go struct field ';
  return `json: cannot unmarshal ${value} into ${intoWhat}${root}.${field} of type ${typeName}`;
}

function kindWord(node: JsonNode): string {
  switch (node.kind) {
    case 'boolean':
      return 'bool';
    default:
      return node.kind;
  }
}

/** Decodes `node` into `current` (the field's present value) and returns the new value. */
type Decode<T> = (node: JsonNode, current: T, st: DecodeState) => T;

function withPath<T>(st: DecodeState, token: string, run: () => T): T {
  st.path.push(token);
  try {
    return run();
  } finally {
    st.path.pop();
  }
}

const decodeString: Decode<string> = (node, current, st) => {
  if (node.kind === 'string') return node.value;
  if (node.kind !== 'null') st.fail(kindWord(node), 'string');
  return current;
};

const decodeBool: Decode<boolean> = (node, current, st) => {
  if (node.kind === 'boolean') return node.value;
  if (node.kind !== 'null') st.fail(kindWord(node), 'bool');
  return current;
};

function parseNumber(node: Extract<JsonNode, { kind: 'number' }>, st: DecodeState): number {
  const value = Number(node.text);
  if (!Number.isFinite(value)) st.fail('number ' + node.text, 'float64');
  return value;
}

/** An optional float (`*float64`). */
const decodeFloat: Decode<number | null> = (node, current, st) => {
  if (node.kind === 'null') return null;
  if (node.kind === 'number') return parseNumber(node, st);
  st.fail(kindWord(node), 'float64');
  return current ?? 0;
};

const decodeLoose: Decode<LooseValue> = (node, _current, st) => {
  switch (node.kind) {
    case 'null':
      return null;
    case 'boolean':
    case 'string':
      return node.value;
    case 'number':
      return parseNumber(node, st);
    case 'array':
      return node.items.map((item, i) => withPath(st, String(i), () => decodeLoose(item, null, st)));
    case 'object': {
      const out = new Map<string, LooseValue>();
      for (const entry of node.entries)
        out.set(
          entry.key,
          withPath(st, entry.key, () => decodeLoose(entry.value, null, st)),
        );
      return out;
    }
  }
};

/** Presence of a member, whatever its value (a JSON null included). */
const decodeRaw: Decode<JsonNode | null> = (node) => node;

/** A pointer: `null` clears it, anything else is decoded into the (allocated) target. */
function pointer<T>(elem: Decode<T>, zero: () => T): Decode<T | null> {
  return (node, current, st) => (node.kind === 'null' ? null : elem(node, current ?? zero(), st));
}

function list<T>(elem: Decode<T>, zero: () => T, typeName: string): Decode<T[] | null> {
  return (node, current, st) => {
    if (node.kind === 'null') return null;
    if (node.kind !== 'array') {
      st.fail(kindWord(node), typeName);
      return current;
    }
    return node.items.map((item, i) =>
      withPath(st, String(i), () => elem(item, current !== null && i < current.length ? (current[i] as T) : zero(), st)),
    );
  };
}

function map<T>(elem: Decode<T>, zero: () => T, typeName: string): Decode<Map<string, T> | null> {
  return (node, current, st) => {
    if (node.kind === 'null') return null;
    if (node.kind !== 'object') {
      st.fail(kindWord(node), typeName);
      return current;
    }
    const out = current ?? new Map<string, T>();
    for (const entry of node.entries)
      out.set(
        entry.key,
        withPath(st, entry.key, () => elem(entry.value, zero(), st)),
      );
    return out;
  };
}

type Fields<T> = { readonly [K in keyof T]: readonly [jsonName: string, decode: Decode<T[K]>] };

/** A struct: members are matched to fields by name and decoded into the current value. */
function struct<T extends object>(typeName: string, fields: () => Fields<T>): Decode<T> {
  let entries: [keyof T, string, Decode<unknown>][] | undefined;
  return (node, current, st) => {
    if (node.kind === 'null') return current;
    if (node.kind !== 'object') {
      st.fail(kindWord(node), typeName);
      return current;
    }
    entries ??= (Object.entries(fields()) as [string, readonly [string, Decode<unknown>]][]).map(([key, [jsonName, decode]]) => [
      key as keyof T,
      jsonName,
      decode,
    ]);
    for (const member of node.entries) {
      const field =
        entries.find(([, jsonName]) => jsonName === member.key) ?? entries.find(([, jsonName]) => equalFold(jsonName, member.key));
      if (field === undefined) continue;
      const [key, , decode] = field;
      current[key] = withPath(st, member.key, () => decode(member.value, current[key], st)) as T[keyof T];
    }
    return current;
  };
}

// ── The OpenAPI structures ──

const SCHEMA = 'main.oaSchema';
const SCHEMA_MAP = 'map[string]*main.oaSchema';
const SCHEMA_LIST = '[]*main.oaSchema';

export function emptySchema(): OaSchema {
  return {
    ref: '',
    type: null,
    format: '',
    pattern: '',
    minLength: null,
    maxLength: null,
    minimum: null,
    maximum: null,
    exclusiveMinimum: null,
    exclusiveMaximum: null,
    minItems: null,
    maxItems: null,
    default: null,
    properties: null,
    required: null,
    items: null,
    enum: null,
    const: null,
    allOf: null,
    anyOf: null,
    oneOf: null,
    additionalProperties: null,
    unevaluatedProperties: null,
    description: '',
    xSiviCode: '',
    discriminator: null,
  };
}

const schemaStruct: Decode<OaSchema> = struct<OaSchema>(SCHEMA, () => ({
  ref: ['$ref', decodeString],
  type: ['type', decodeLoose],
  format: ['format', decodeString],
  pattern: ['pattern', decodeString],
  minLength: ['minLength', decodeFloat],
  maxLength: ['maxLength', decodeFloat],
  minimum: ['minimum', decodeFloat],
  maximum: ['maximum', decodeFloat],
  exclusiveMinimum: ['exclusiveMinimum', decodeLoose],
  exclusiveMaximum: ['exclusiveMaximum', decodeLoose],
  minItems: ['minItems', decodeFloat],
  maxItems: ['maxItems', decodeFloat],
  default: ['default', decodeLoose],
  properties: ['properties', schemaMap],
  required: ['required', list(decodeString, () => '', '[]string')],
  items: ['items', schemaPointer],
  enum: ['enum', list(decodeLoose, () => null, '[]interface {}')],
  const: ['const', decodeLoose],
  allOf: ['allOf', schemaList],
  anyOf: ['anyOf', schemaList],
  oneOf: ['oneOf', schemaList],
  additionalProperties: ['additionalProperties', decodeRaw],
  unevaluatedProperties: ['unevaluatedProperties', decodeRaw],
  description: ['description', decodeString],
  xSiviCode: ['x-sivi-code', decodeString],
  discriminator: [
    'discriminator',
    pointer(
      struct<{ propertyName: string }>('main.oaDiscriminator', () => ({ propertyName: ['propertyName', decodeString] })),
      () => ({
        propertyName: '',
      }),
    ),
  ],
}));

const schemaPointer: Decode<OaSchema | null> = pointer(schemaStruct, emptySchema);
const schemaMap = map(schemaPointer, () => null, SCHEMA_MAP);
const schemaList = list(schemaPointer, () => null, SCHEMA_LIST);

const INFO_TYPE = 'struct { Title string "json:\\"title\\""; Version string "json:\\"version\\"" }';
const COMPONENTS_TYPE = 'struct { Schemas map[string]*main.oaSchema "json:\\"schemas\\"" }';

/** A path item: member name -> raw value, decoded per operation later. */
const pathItem: Decode<Map<string, JsonNode> | null> = (node, current, st) => {
  if (node.kind === 'null') return null;
  if (node.kind !== 'object') {
    st.fail(kindWord(node), 'map[string]jsontext.Value');
    return current;
  }
  const out = current ?? new Map<string, JsonNode>();
  for (const entry of node.entries) out.set(entry.key, entry.value);
  return out;
};

const documentStruct = struct<OaDocument>('main.oaDocument', () => ({
  openapi: ['openapi', decodeString],
  info: ['info', struct<OaDocument['info']>(INFO_TYPE, () => ({ title: ['title', decodeString], version: ['version', decodeString] }))],
  paths: ['paths', map(pathItem, () => null, 'map[string]map[string]jsontext.Value')],
  components: ['components', struct<OaDocument['components']>(COMPONENTS_TYPE, () => ({ schemas: ['schemas', schemaMap] }))],
}));

const emptyParameter = (): OaParameter => ({ name: '', in: '', required: false, schema: null });

const parameterStruct = struct<OaParameter>('main.oaParameter', () => ({
  name: ['name', decodeString],
  in: ['in', decodeString],
  required: ['required', decodeBool],
  schema: ['schema', schemaPointer],
}));

const mediaStruct = struct<OaMedia>('main.oaMedia', () => ({ schema: ['schema', schemaPointer] }));
const contentMap = map(mediaStruct, (): OaMedia => ({ schema: null }), 'map[string]main.oaMedia');

const operationStruct = struct<OaOperation>('main.oaOperation', () => ({
  operationId: ['operationId', decodeString],
  tags: ['tags', list(decodeString, () => '', '[]string')],
  parameters: ['parameters', list(parameterStruct, emptyParameter, '[]main.oaParameter')],
  requestBody: [
    'requestBody',
    pointer(
      struct<OaRequestBody>('main.oaRequestBody', () => ({ required: ['required', decodeBool], content: ['content', contentMap] })),
      (): OaRequestBody => ({ required: false, content: null }),
    ),
  ],
  responses: [
    'responses',
    map(
      struct<OaResponse>('main.oaResponse', () => ({ description: ['description', decodeString], content: ['content', contentMap] })),
      (): OaResponse => ({ description: '', content: null }),
      'map[string]main.oaResponse',
    ),
  ],
}));

// ── Entry points ──

/** Go's rendering of a character in a syntax error: `'x'`, `'\''`, `'\t'`. */
function quoteChar(ch: string): string {
  if (ch === "'") return "'\\''";
  if (ch === '"') return `'"'`;
  return "'" + quote(ch).slice(1, -1) + "'";
}

/**
 * Rewords a syntax error of the shared parser into the wording the drift
 * report uses. Position and cause are unchanged.
 */
function syntaxMessage(err: JsonSyntaxError, text: string): string {
  let message = err.message.replace(
    /^invalid character "((?:[^"\\]|\\.)+)"/,
    (_, literal: string) => 'invalid character ' + quoteChar(JSON.parse(`"${literal}"`) as string),
  );
  message = message.replace(
    /\(expecting "((?:[^"\\]|\\.)+)"\)/,
    (_, literal: string) => '(expecting ' + quoteChar(JSON.parse(`"${literal}"`) as string) + ')',
  );
  if (message.endsWith(' in string escape code')) {
    return 'invalid escape sequence `' + text.slice(err.offset - 1, err.offset + 1) + '` in string';
  }
  if (message.endsWith(' in \\u hexadecimal character escape')) {
    return 'invalid escape sequence `' + text.slice(err.offset - 2, err.offset + 4) + '` in string';
  }
  return message
    .replace(/ in string literal$/, ' in string')
    .replace(/ after decimal point in numeric literal$/, ' in numeric literal')
    .replace(/ in exponent of numeric literal$/, ' in numeric literal');
}

function parse(text: string): JsonNode {
  try {
    return parseJson(text);
  } catch (err) {
    if (err instanceof JsonSyntaxError) throw new ContractDecodeError(syntaxMessage(err, text));
    throw err;
  }
}

/**
 * Parses an OpenAPI document. Throws `ContractDecodeError` for invalid JSON,
 * a value of the wrong type, or a document with none of `openapi`, `paths`
 * and `components.schemas`.
 */
export function parseOpenApiDocument(text: string): OaDocument {
  const node = parse(text);
  const st = new DecodeState('oaDocument');
  const doc = documentStruct(node, { openapi: '', info: { title: '', version: '' }, paths: null, components: { schemas: null } }, st);
  if (st.error !== undefined) throw new ContractDecodeError(st.error);
  if (doc.openapi === '' && doc.paths === null && doc.components.schemas === null) {
    throw new ContractDecodeError('document has no openapi/paths/components fields — not an OpenAPI spec');
  }
  return doc;
}

/** Decodes one operation of a path item. Returns the error text instead when a value has the wrong type. */
export function decodeOperation(node: JsonNode): OaOperation | string {
  const st = new DecodeState('oaOperation');
  const op = operationStruct(node, { operationId: '', tags: null, parameters: null, requestBody: null, responses: null }, st);
  return st.error ?? op;
}

/**
 * Decodes the parameters shared by the operations of a path item. Values of
 * the wrong type are skipped; whatever could be decoded is returned.
 */
export function decodeSharedParameters(node: JsonNode): OaParameter[] {
  const st = new DecodeState('');
  return list(parameterStruct, emptyParameter, '[]main.oaParameter')(node, null, st) ?? [];
}

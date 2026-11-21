import { JsonDecoder } from '../json/decoder.ts';
import { reencodeJson } from '../json/format.ts';
import { decodeStringLiteral } from '../json/parse.ts';
import type { Example, Model } from '../model/types.ts';
import { toLower } from '../text/case.ts';
import { jsonString } from '../text/escape.ts';
import { parseFloatText } from '../text/number.ts';
import { trimSpace, trimSuffix } from '../text/strings.ts';

/**
 * Example payloads.
 *
 * The editor stores every leaf of an example as the user typed it, usually a
 * string, plus `_typeMap` bookkeeping objects. For export the bookkeeping is
 * removed and strings are turned into numbers or booleans where the model
 * says so. All of this works on the JSON *text*, token by token, so that key
 * order and the spelling of untouched values survive unchanged.
 */

const INTERNAL_KEYS: ReadonlySet<string> = new Set(['_typeMap']);

/** The examples of one operation, in model order. */
export function examplesForOperation(model: Model, operationId: string): Example[] {
  return model.examples.filter((ex) => ex.operationId === operationId);
}

/** The identifier an example is exported under. */
export function exampleExportName(example: Example): string {
  return example.technicalName !== '' ? example.technicalName : example.id;
}

/**
 * Removes the editor's `_typeMap` members at every depth and re-encodes the
 * payload compactly. A payload that cannot be read is returned as it is.
 */
export function stripInternalKeys(raw: string): string {
  return reencodeJson(raw, INTERNAL_KEYS) ?? raw;
}

/** True when a payload still holds data once internal keys are removed. */
export function hasExampleData(raw: string | null): boolean {
  if (raw === null || raw === '') return false;
  const stripped = trimSpace(stripInternalKeys(raw));
  return stripped !== '' && stripped !== 'null' && stripped !== '{}' && stripped !== '[]';
}

/** The examples that carry a request (or, with `'response'`, a response). */
export function examplesWithData(examples: readonly Example[], part: 'request' | 'response'): Example[] {
  return examples.filter((ex) => hasExampleData(ex[part]));
}

/** Wraps a single object in an array, for operations whose body is declared as an array. */
export function ensureJsonArray(raw: string): string {
  const trimmed = trimSpace(raw);
  return trimmed.startsWith('{') ? `[${trimmed}]` : raw;
}

type AttributeTypes = ReadonlyMap<string, ReadonlyMap<string, string>>;

/** The value of a string literal, or `undefined` when `text` is not exactly one. */
function stringValue(text: string): string | undefined {
  try {
    return decodeStringLiteral(text);
  } catch {
    return undefined;
  }
}

/**
 * Types an example payload according to the model: a string under a
 * `number`/`integer` attribute becomes a bare number when its text parses as
 * one, a string under a `boolean` attribute becomes `true`/`false`. Internal
 * keys are removed first.
 *
 * The number text is copied through as typed. Text that is a number to
 * `parseFloatText` but not to JSON (`+5`, `1_000`, `Inf`) therefore yields
 * output that is not valid JSON. That is long-standing behaviour and is kept
 * for output compatibility.
 */
export function coerceExampleJson(raw: string, entityName: string, model: Model): string {
  const types = new Map<string, Map<string, string>>();
  for (const [name, entity] of model.entities) {
    const attributes = new Map<string, string>();
    for (const section of entity.sections) {
      for (const a of section.attributes) attributes.set(a.name, a.type);
    }
    types.set(name, attributes);
  }
  return coerceValue(stripInternalKeys(raw), entityName, entityName, types);
}

function coerceValue(raw: string, entityName: string, attributeType: string, types: AttributeTypes): string {
  const trimmed = trimSpace(raw);
  if (trimmed === '') return raw;
  switch (trimmed[0]) {
    case '{':
      return coerceObject(trimmed, entityName, types);
    case '[':
      return coerceArray(trimmed, trimSuffix(attributeType, '[]'), types);
    case '"': {
      const base = toLower(trimSuffix(attributeType, '[]'));
      const value = stringValue(trimmed);
      if (value === undefined) return raw;
      if (base === 'number' || base === 'integer' || base === 'int') {
        const text = trimSpace(value);
        if (parseFloatText(text) !== null) return text;
      } else if (base === 'boolean') {
        const text = toLower(trimSpace(value));
        if (text === 'true' || text === 'false') return text;
      }
      return raw;
    }
    default:
      return raw;
  }
}

function coerceObject(raw: string, entityName: string, types: AttributeTypes): string {
  const dec = new JsonDecoder(raw);
  const open = dec.token();
  if (open === undefined || open.kind !== 'delim' || open.value !== '{') return raw;
  const members: string[] = [];
  while (dec.more()) {
    const key = dec.token();
    if (key === undefined || key.kind !== 'string') break;
    const value = dec.raw();
    if (value === undefined) break;
    const childType = types.get(entityName)?.get(key.value) ?? '';
    members.push(jsonString(key.value) + ':' + coerceValue(value, trimSuffix(childType, '[]'), childType, types));
  }
  return '{' + members.join(',') + '}';
}

function coerceArray(raw: string, elementType: string, types: AttributeTypes): string {
  const dec = new JsonDecoder(raw);
  const open = dec.token();
  if (open === undefined || open.kind !== 'delim' || open.value !== '[') return raw;
  const items: string[] = [];
  while (dec.more()) {
    const value = dec.raw();
    if (value === undefined) break;
    items.push(coerceValue(value, elementType, elementType, types));
  }
  return '[' + items.join(',') + ']';
}

import { compareStrings, jsonString } from '@minerva/core';

/**
 * JSON serialisation with a fixed, documented shape, for API responses and
 * files written by the server.
 *
 *  - A plain object is a record: members appear in insertion order and
 *    `undefined` members are left out.
 *  - A `Map` is a dictionary: members appear in key order.
 *  - Strings are escaped with `jsonString` (so `<`, `>` and `&` are written
 *    as escapes).
 *
 * `JSON.stringify` cannot be used for these because it moves integer-like
 * keys to the front and has no notion of sorted dictionaries.
 */
export type JsonValue = string | number | boolean | null | undefined | JsonValue[] | JsonRecord | Map<string, JsonValue>;
export interface JsonRecord {
  [key: string]: JsonValue;
}

export function encodeJson(value: JsonValue, indent = ''): string {
  return encode(value, indent, 0);
}

function encode(value: JsonValue, indent: string, depth: number): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return jsonString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  const pretty = indent !== '';
  const open = pretty ? '\n' + indent.repeat(depth + 1) : '';
  const between = pretty ? ',\n' + indent.repeat(depth + 1) : ',';
  const close = pretty ? '\n' + indent.repeat(depth) : '';
  const colon = pretty ? ': ' : ':';

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return '[' + open + value.map((item) => encode(item, indent, depth + 1)).join(between) + close + ']';
  }

  const members: [string, JsonValue][] =
    value instanceof Map
      ? [...value].sort((a, b) => compareStrings(a[0], b[0]))
      : Object.entries(value).filter(([, member]) => member !== undefined);
  if (members.length === 0) return '{}';
  return (
    '{' + open + members.map(([key, member]) => jsonString(key) + colon + encode(member, indent, depth + 1)).join(between) + close + '}'
  );
}

/** `value` when non-empty, else `undefined` (so the member is omitted). */
export function omitEmpty(value: string): string | undefined {
  return value === '' ? undefined : value;
}

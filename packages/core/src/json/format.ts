import { jsonString } from '../text/escape.ts';
import { compareStrings } from '../text/compare.ts';
import { JsonDecoder, type JsonToken } from './decoder.ts';
import { type JsonNode, tryParseJson } from './parse.ts';

/**
 * Removes insignificant white space. String and number literals keep their
 * source spelling. Returns `undefined` when `text` is not valid JSON.
 */
export function compactJson(text: string): string | undefined {
  const root = tryParseJson(text);
  return root === undefined ? undefined : compactNode(text, root);
}

function compactNode(text: string, node: JsonNode): string {
  switch (node.kind) {
    case 'object':
      return '{' + node.entries.map((e) => text.slice(e.keyStart, e.keyEnd) + ':' + compactNode(text, e.value)).join(',') + '}';
    case 'array':
      return '[' + node.items.map((item) => compactNode(text, item)).join(',') + ']';
    default:
      return text.slice(node.start, node.end);
  }
}

/**
 * Pretty-prints `text`: one element per line, `indent` per nesting level,
 * `prefix` at the start of every line except the first. Empty arrays and
 * objects stay on one line. Literals keep their source spelling. Returns
 * `undefined` when `text` is not valid JSON.
 */
export function indentJson(text: string, prefix: string, indent: string): string | undefined {
  const root = tryParseJson(text);
  return root === undefined ? undefined : indentNode(text, root, prefix, indent, 0);
}

function indentNode(text: string, node: JsonNode, prefix: string, indent: string, depth: number): string {
  const newline = (d: number): string => '\n' + prefix + indent.repeat(d);
  switch (node.kind) {
    case 'object':
      if (node.entries.length === 0) return '{}';
      return (
        '{' +
        newline(depth + 1) +
        node.entries
          .map((e) => text.slice(e.keyStart, e.keyEnd) + ': ' + indentNode(text, e.value, prefix, indent, depth + 1))
          .join(',' + newline(depth + 1)) +
        newline(depth) +
        '}'
      );
    case 'array':
      if (node.items.length === 0) return '[]';
      return (
        '[' +
        newline(depth + 1) +
        node.items.map((item) => indentNode(text, item, prefix, indent, depth + 1)).join(',' + newline(depth + 1)) +
        newline(depth) +
        ']'
      );
    default:
      return text.slice(node.start, node.end);
  }
}

/** The canonical text of a scalar token: strings re-escaped, numbers as written. */
export function encodeToken(token: JsonToken): string {
  switch (token.kind) {
    case 'string':
      return jsonString(token.value);
    case 'number':
      return token.text;
    case 'boolean':
      return token.value ? 'true' : 'false';
    case 'null':
      return 'null';
    case 'delim':
      return token.value;
  }
}

/**
 * Re-encodes a document token by token: compact, keys and strings in
 * canonical escaping, numbers and key order untouched. Object members whose
 * key is in `dropKeys` are removed at every depth.
 *
 * Returns `undefined` when the document is malformed.
 */
export function reencodeJson(text: string, dropKeys: ReadonlySet<string> = new Set()): string | undefined {
  const dec = new JsonDecoder(text);
  const out: string[] = [];
  return writeValue(dec, out, dropKeys) ? out.join('') : undefined;
}

function writeValue(dec: JsonDecoder, out: string[], dropKeys: ReadonlySet<string>): boolean {
  const t = dec.token();
  if (t === undefined) return false;
  if (t.kind !== 'delim') {
    out.push(encodeToken(t));
    return true;
  }
  if (t.value === '{') {
    out.push('{');
    let first = true;
    while (dec.more()) {
      const key = dec.token();
      if (key === undefined || key.kind !== 'string') return false;
      if (dropKeys.has(key.value)) {
        if (!skipValue(dec)) return false;
        continue;
      }
      if (!first) out.push(',');
      first = false;
      out.push(jsonString(key.value), ':');
      if (!writeValue(dec, out, dropKeys)) return false;
    }
    if (dec.token() === undefined) return false;
    out.push('}');
  } else if (t.value === '[') {
    out.push('[');
    let first = true;
    while (dec.more()) {
      if (!first) out.push(',');
      first = false;
      if (!writeValue(dec, out, dropKeys)) return false;
    }
    if (dec.token() === undefined) return false;
    out.push(']');
  }
  return true;
}

function skipValue(dec: JsonDecoder): boolean {
  const t = dec.token();
  if (t === undefined) return false;
  if (t.kind !== 'delim') return true;
  if (t.value === '{') {
    while (dec.more()) {
      if (dec.token() === undefined) return false;
      if (!skipValue(dec)) return false;
    }
    return dec.token() !== undefined;
  }
  if (t.value === '[') {
    while (dec.more()) {
      if (!skipValue(dec)) return false;
    }
    return dec.token() !== undefined;
  }
  return true;
}

/** A plain JavaScript value built from a node; numbers become doubles. */
export function toPlainValue(node: JsonNode): unknown {
  switch (node.kind) {
    case 'object': {
      const out = new Map<string, unknown>();
      for (const e of node.entries) out.set(e.key, toPlainValue(e.value));
      return out;
    }
    case 'array':
      return node.items.map(toPlainValue);
    case 'string':
    case 'boolean':
      return node.value;
    case 'number':
      return Number(node.text);
    case 'null':
      return null;
  }
}

/**
 * Serialises a value built by {@link toPlainValue} with object keys sorted
 * and two-space indentation, i.e. the "decoded, then pretty-printed" form.
 */
export function stringifySorted(value: unknown, prefix: string, indent: string, depth = 0): string {
  const newline = (d: number): string => '\n' + prefix + indent.repeat(d);
  if (value instanceof Map) {
    if (value.size === 0) return '{}';
    const keys = [...value.keys()].sort(compareStrings);
    return (
      '{' +
      newline(depth + 1) +
      keys.map((k) => jsonString(k) + ': ' + stringifySorted(value.get(k), prefix, indent, depth + 1)).join(',' + newline(depth + 1)) +
      newline(depth) +
      '}'
    );
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return (
      '[' +
      newline(depth + 1) +
      value.map((v) => stringifySorted(v, prefix, indent, depth + 1)).join(',' + newline(depth + 1)) +
      newline(depth) +
      ']'
    );
  }
  if (typeof value === 'string') return jsonString(value);
  if (typeof value === 'number') return Object.is(value, -0) ? '-0' : String(value);
  return value === null || value === undefined ? 'null' : String(value);
}

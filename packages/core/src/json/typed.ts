import { equalFold } from '../text/case.ts';
import type { JsonNode } from './parse.ts';

/**
 * Typed decoding of a parsed JSON document.
 *
 * The rules are deliberately lenient about *presence* and strict about
 * *type*, because that is what files in the wild were written against:
 *
 *  - A missing key and a JSON `null` both yield the field's empty value
 *    (`''`, `false`, `[]`, an empty map, `null` for optional fields).
 *  - Unknown keys are ignored.
 *  - A value of the wrong type is an error: a number where a string belongs,
 *    `1.5` or `1e2` where an integer belongs.
 *  - Keys match case-insensitively when there is no exact match; when a key
 *    occurs twice the later one wins.
 *
 * Only the first error is kept. Decoding continues past it so the result is
 * still a complete value.
 */
export class DecodeContext {
  /** The document the nodes were parsed from; needed to recover raw text. */
  readonly source: string;
  #error: string | undefined;

  constructor(source: string) {
    this.source = source;
  }

  fail(path: string, expected: string, node: JsonNode): void {
    this.#error ??= `${path === '' ? 'document' : path}: expected ${expected}, found ${describeNode(node)}`;
  }

  get error(): string | undefined {
    return this.#error;
  }
}

export type Decoder<T> = (node: JsonNode | undefined, path: string, ctx: DecodeContext) => T;

function describeNode(node: JsonNode): string {
  switch (node.kind) {
    case 'number':
      return `number ${node.text}`;
    case 'boolean':
      return 'boolean';
    case 'null':
      return 'null';
    default:
      return node.kind;
  }
}

function absent(node: JsonNode | undefined): node is undefined {
  return node === undefined || node.kind === 'null';
}

export const string: Decoder<string> = (node, path, ctx) => {
  if (absent(node)) return '';
  if (node.kind === 'string') return node.value;
  ctx.fail(path, 'string', node);
  return '';
};

export const boolean: Decoder<boolean> = (node, path, ctx) => {
  if (absent(node)) return false;
  if (node.kind === 'boolean') return node.value;
  ctx.fail(path, 'boolean', node);
  return false;
};

const INTEGER_LITERAL = /^-?(0|[1-9][0-9]*)$/;
const INT64_MIN = -(2n ** 63n);
const INT64_MAX = 2n ** 63n - 1n;

/** A whole number written without fraction or exponent, within 64-bit range. */
export const integer: Decoder<number> = (node, path, ctx) => {
  if (absent(node)) return 0;
  if (node.kind === 'number' && INTEGER_LITERAL.test(node.text)) {
    const value = BigInt(node.text);
    if (value >= INT64_MIN && value <= INT64_MAX) return Number(value);
  }
  ctx.fail(path, 'integer', node);
  return 0;
};

export const float: Decoder<number> = (node, path, ctx) => {
  if (absent(node)) return 0;
  if (node.kind === 'number') {
    const value = Number(node.text);
    if (Number.isFinite(value)) return value;
  }
  ctx.fail(path, 'number', node);
  return 0;
};

/** `null` when the key is missing or JSON `null`; otherwise the inner decoder's result. */
export function optional<T>(inner: Decoder<T>): Decoder<T | null> {
  return (node, path, ctx) => (absent(node) ? null : inner(node, path, ctx));
}

/** The value's source text, or `null` when the key is missing. A JSON `null` is the text "null". */
export const rawText: Decoder<string | null> = (node, _path, ctx) => (node === undefined ? null : ctx.source.slice(node.start, node.end));

export function list<T>(item: Decoder<T>): Decoder<T[]> {
  return (node, path, ctx) => {
    if (absent(node)) return [];
    if (node.kind !== 'array') {
      ctx.fail(path, 'array', node);
      return [];
    }
    return node.items.map((child, i) => item(child, `${path}[${i}]`, ctx));
  };
}

export function mapOf<T>(value: Decoder<T>): Decoder<Map<string, T>> {
  return (node, path, ctx) => {
    const out = new Map<string, T>();
    if (absent(node)) return out;
    if (node.kind !== 'object') {
      ctx.fail(path, 'object', node);
      return out;
    }
    for (const entry of node.entries) {
      out.set(entry.key, value(entry.value, path === '' ? entry.key : `${path}.${entry.key}`, ctx));
    }
    return out;
  };
}

type Shape<T> = { readonly [K in keyof T]: Decoder<T[K]> };

/**
 * An object with a fixed set of fields. The property names of `shape` are
 * the JSON keys.
 */
export function struct<T>(shape: Shape<T>): Decoder<T> {
  const names = Object.keys(shape) as (keyof T & string)[];
  return (node, path, ctx) => {
    const found = new Map<string, JsonNode>();
    if (!absent(node)) {
      if (node.kind === 'object') {
        for (const entry of node.entries) {
          const name = names.includes(entry.key as keyof T & string)
            ? entry.key
            : names.find((candidate) => equalFold(candidate, entry.key));
          if (name !== undefined) found.set(name, entry.value);
        }
      } else {
        ctx.fail(path, 'object', node);
      }
    }
    const out = {} as T;
    for (const name of names) {
      out[name] = shape[name](found.get(name), path === '' ? name : `${path}.${name}`, ctx);
    }
    return out;
  };
}

/**
 * A JSON parser that keeps what `JSON.parse` throws away.
 *
 * Exports must reproduce example payloads exactly as authored: keys in
 * document order (including integer-like and duplicate keys) and numbers with
 * their original spelling (`1.0`, `1e3`, 20-digit integers). `JSON.parse`
 * reorders, deduplicates and re-renders all of those, so the model is read
 * through this parser instead. Every node records its span in the source so
 * the original text of any value can be recovered.
 */

export class JsonSyntaxError extends Error {
  readonly offset: number;
  constructor(message: string, offset: number) {
    super(message);
    this.name = 'JsonSyntaxError';
    this.offset = offset;
  }
}

interface Span {
  /** Offset of the first character of the value. */
  readonly start: number;
  /** Offset just past the last character of the value. */
  readonly end: number;
}

export interface JsonEntry {
  readonly key: string;
  readonly keyStart: number;
  readonly keyEnd: number;
  readonly value: JsonNode;
}

export interface JsonObject extends Span {
  readonly kind: 'object';
  /** In document order. Duplicate keys are kept. */
  readonly entries: readonly JsonEntry[];
}
export interface JsonArray extends Span {
  readonly kind: 'array';
  readonly items: readonly JsonNode[];
}
export interface JsonString extends Span {
  readonly kind: 'string';
  readonly value: string;
}
export interface JsonNumber extends Span {
  readonly kind: 'number';
  /** The literal as written, e.g. "1.0" or "1e3". */
  readonly text: string;
}
export interface JsonBoolean extends Span {
  readonly kind: 'boolean';
  readonly value: boolean;
}
export interface JsonNull extends Span {
  readonly kind: 'null';
}

export type JsonNode = JsonObject | JsonArray | JsonString | JsonNumber | JsonBoolean | JsonNull;

const SPACE = 0x20;
const TAB = 0x09;
const LF = 0x0a;
const CR = 0x0d;

export function skipSpace(text: string, i: number): number {
  for (; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c !== SPACE && c !== TAB && c !== LF && c !== CR) break;
  }
  return i;
}

function isDigit(c: number): boolean {
  return c >= 0x30 && c <= 0x39;
}

/** 1-based line and column of an offset; a column counts UTF-16 units, as editors do. */
function position(text: string, i: number): string {
  const lineStart = text.lastIndexOf('\n', i - 1) + 1;
  let line = 1;
  for (let k = text.indexOf('\n'); k !== -1 && k < i; k = text.indexOf('\n', k + 1)) line++;
  return `line ${line}, column ${i - lineStart + 1}`;
}

/**
 * Throws a syntax error at offset `i`. `problem` says what was wrong or
 * expected; the character found there and the position are appended. At the
 * end of the input the message is always "unexpected end of JSON input".
 */
/** The character at `i` as an error shows it: quoted, or as `U+FEFF` when it would be invisible. */
function shown(text: string, i: number): string {
  const code = text.codePointAt(i) ?? 0;
  const invisible =
    code < 0x20 ||
    (code >= 0x7f && code <= 0xa0) ||
    code === 0xad ||
    (code >= 0x200b && code <= 0x200f) ||
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0xfeff;
  return invisible ? 'U+' + code.toString(16).toUpperCase().padStart(4, '0') : JSON.stringify(String.fromCodePoint(code));
}

function fail(text: string, i: number, problem: string): never {
  const found = i < text.length ? `${problem}, found ${shown(text, i)}` : 'unexpected end of JSON input';
  throw new JsonSyntaxError(`${found} at ${position(text, i)}`, i);
}

/** Decodes a string literal's text. Unpaired surrogate escapes become U+FFFD. */
export function decodeStringLiteral(literal: string): string {
  return (JSON.parse(literal) as string).toWellFormed();
}

function parseString(text: string, start: number): JsonString {
  let i = start + 1;
  for (;;) {
    if (i >= text.length) fail(text, i, 'unterminated string');
    const c = text.charCodeAt(i);
    if (c === 0x22) break;
    if (c < 0x20) fail(text, i, 'unescaped control character in string');
    if (c === 0x5c) {
      const e = text[i + 1];
      if (e === 'u') {
        if (!/^[0-9a-fA-F]{4}$/.test(text.slice(i + 2, i + 6))) fail(text, i + 2, 'bad \\u escape in string');
        i += 6;
        continue;
      }
      if (e === undefined || !'"\\/bfnrt'.includes(e)) fail(text, i + 1, 'bad escape sequence in string');
      i += 2;
      continue;
    }
    i++;
  }
  const end = i + 1;
  return { kind: 'string', value: decodeStringLiteral(text.slice(start, end)), start, end };
}

function parseNumber(text: string, start: number): JsonNumber {
  let i = start;
  if (text[i] === '-') i++;
  if (text[i] === '0') {
    i++;
  } else if (isDigit(text.charCodeAt(i))) {
    while (isDigit(text.charCodeAt(i))) i++;
  } else {
    fail(text, i, 'expected a digit after the minus sign');
  }
  if (text[i] === '.') {
    i++;
    if (!isDigit(text.charCodeAt(i))) fail(text, i, 'expected a digit after the decimal point');
    while (isDigit(text.charCodeAt(i))) i++;
  }
  if (text[i] === 'e' || text[i] === 'E') {
    i++;
    if (text[i] === '+' || text[i] === '-') i++;
    if (!isDigit(text.charCodeAt(i))) fail(text, i, 'expected a digit in the exponent');
    while (isDigit(text.charCodeAt(i))) i++;
  }
  return { kind: 'number', text: text.slice(start, i), start, end: i };
}

function parseLiteral(text: string, start: number, word: string): number {
  for (let k = 1; k < word.length; k++) {
    if (text[start + k] !== word[k]) fail(text, start + k, `expected ${JSON.stringify(word)}`);
  }
  return start + word.length;
}

/**
 * Parses the value that starts at `pos` (leading white space is skipped) and
 * stops right after it.
 *
 * A number or literal at this level ends at the first character that cannot
 * continue it, whatever that character is: `1_000` yields the value `1`,
 * `007` yields `0`. Inside an array or object the element must be followed
 * by `,` or the closing bracket, so the same text there is an error. Callers
 * that stream values out of a document depend on exactly this.
 */
export function parseValueAt(text: string, pos: number): JsonNode {
  const start = skipSpace(text, pos);
  if (start >= text.length) fail(text, start, 'expected a value');
  switch (text[start]) {
    case '{': {
      const entries: JsonEntry[] = [];
      let i = skipSpace(text, start + 1);
      if (text[i] === '}') return { kind: 'object', entries, start, end: i + 1 };
      for (;;) {
        i = skipSpace(text, i);
        if (text[i] !== '"') fail(text, i, 'expected a double-quoted property name');
        const key = parseString(text, i);
        i = skipSpace(text, key.end);
        if (text[i] !== ':') fail(text, i, 'expected ":" after property name');
        const value = parseValueAt(text, i + 1);
        entries.push({ key: key.value, keyStart: key.start, keyEnd: key.end, value });
        i = skipSpace(text, value.end);
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === '}') return { kind: 'object', entries, start, end: i + 1 };
        fail(text, i, 'expected "," or "}" after property value');
      }
    }
    case '[': {
      const items: JsonNode[] = [];
      let i = skipSpace(text, start + 1);
      if (text[i] === ']') return { kind: 'array', items, start, end: i + 1 };
      for (;;) {
        const value = parseValueAt(text, i);
        items.push(value);
        i = skipSpace(text, value.end);
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === ']') return { kind: 'array', items, start, end: i + 1 };
        fail(text, i, 'expected "," or "]" after array element');
      }
    }
    case '"':
      return parseString(text, start);
    case 't':
      return { kind: 'boolean', value: true, start, end: parseLiteral(text, start, 'true') };
    case 'f':
      return { kind: 'boolean', value: false, start, end: parseLiteral(text, start, 'false') };
    case 'n':
      return { kind: 'null', start, end: parseLiteral(text, start, 'null') };
    default: {
      const c = text.charCodeAt(start);
      if (c === 0x2d || isDigit(c)) return parseNumber(text, start);
      return fail(text, start, 'expected a value');
    }
  }
}

/** Parses a complete document. Anything but white space after the value is an error. */
export function parseJson(text: string): JsonNode {
  const node = parseValueAt(text, 0);
  const rest = skipSpace(text, node.end);
  if (rest < text.length) fail(text, rest, 'expected end of input after the JSON value');
  return node;
}

/** `parseJson` that reports failure as `undefined` instead of throwing. */
export function tryParseJson(text: string): JsonNode | undefined {
  try {
    return parseJson(text);
  } catch (err) {
    if (err instanceof JsonSyntaxError) return undefined;
    throw err;
  }
}

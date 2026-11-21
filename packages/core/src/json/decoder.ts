import { JsonSyntaxError, decodeStringLiteral, parseValueAt, skipSpace } from './parse.ts';

export type JsonToken =
  | { readonly kind: 'delim'; readonly value: '{' | '}' | '[' | ']' }
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'number'; readonly text: string }
  | { readonly kind: 'boolean'; readonly value: boolean }
  | { readonly kind: 'null' };

type State =
  | 'topValue'
  | 'arrayStart'
  | 'arrayValue'
  | 'arrayComma'
  | 'objectStart'
  | 'objectKey'
  | 'objectColon'
  | 'objectValue'
  | 'objectComma';

/**
 * Reads a JSON document one token at a time.
 *
 * The exporters walk example payloads with this reader so they can rewrite
 * values in place while keeping key order and number spelling. `token()`
 * returns brackets, keys and scalar values and consumes the commas and
 * colons between them; `raw()` consumes one whole value and returns its
 * source text.
 *
 * Both return `undefined` when the input is exhausted or malformed. After a
 * malformed value every further `raw()` fails too, so a caller that stops at
 * the first `undefined` emits exactly the well-formed prefix of the document.
 * That prefix behaviour is observable in exports and is pinned by the
 * reference vectors (see test/json.test.ts).
 */
export class JsonDecoder {
  readonly #text: string;
  #pos = 0;
  #state: State = 'topValue';
  readonly #stack: State[] = [];
  #failed = false;

  constructor(text: string) {
    this.#text = text;
  }

  /**
   * True while the current array or object has another element.
   *
   * At the end of a truncated document this still reports true inside an
   * unclosed container; the following `token()` then fails.
   */
  more(): boolean {
    const i = skipSpace(this.#text, this.#pos);
    if (i >= this.#text.length) return this.#stack.length > 0;
    const c = this.#text[i];
    return c !== ']' && c !== '}';
  }

  token(): JsonToken | undefined {
    for (;;) {
      const i = skipSpace(this.#text, this.#pos);
      if (i >= this.#text.length) return undefined;
      this.#pos = i;
      const c = this.#text[i] as string;
      switch (c) {
        case '[':
        case '{':
          if (!this.#valueAllowed()) return undefined;
          this.#pos++;
          this.#stack.push(this.#state);
          this.#state = c === '[' ? 'arrayStart' : 'objectStart';
          return { kind: 'delim', value: c };
        case ']':
          if (this.#state !== 'arrayStart' && this.#state !== 'arrayComma') return undefined;
          return this.#close(c);
        case '}':
          if (this.#state !== 'objectStart' && this.#state !== 'objectComma') return undefined;
          return this.#close(c);
        case ':':
          if (this.#state !== 'objectColon') return undefined;
          this.#pos++;
          this.#state = 'objectValue';
          continue;
        case ',':
          if (this.#state === 'arrayComma') {
            this.#pos++;
            this.#state = 'arrayValue';
            continue;
          }
          if (this.#state === 'objectComma') {
            this.#pos++;
            this.#state = 'objectKey';
            continue;
          }
          return undefined;
        default: {
          if (c === '"' && (this.#state === 'objectStart' || this.#state === 'objectKey')) {
            const key = this.#readValue();
            if (key === undefined) return undefined;
            this.#state = 'objectColon';
            return { kind: 'string', value: decodeStringLiteral(key) };
          }
          if (!this.#valueAllowed()) return undefined;
          const raw = this.#readValue();
          if (raw === undefined) return undefined;
          this.#valueEnd();
          return scalarToken(raw);
        }
      }
    }
  }

  /** Consumes the next value, whatever its type, and returns its source text. */
  raw(): string | undefined {
    if (this.#failed) return undefined;
    if (this.#state === 'arrayComma' || this.#state === 'objectColon') {
      const i = skipSpace(this.#text, this.#pos);
      const expected = this.#state === 'arrayComma' ? ',' : ':';
      if (this.#text[i] !== expected) return undefined;
      this.#pos = i + 1;
      this.#state = this.#state === 'arrayComma' ? 'arrayValue' : 'objectValue';
    }
    if (!this.#valueAllowed()) return undefined;
    const raw = this.#readValue();
    if (raw === undefined) return undefined;
    this.#valueEnd();
    return raw;
  }

  #close(c: ']' | '}'): JsonToken {
    this.#pos++;
    this.#state = this.#stack.pop() as State;
    this.#valueEnd();
    return { kind: 'delim', value: c };
  }

  #readValue(): string | undefined {
    if (this.#failed) return undefined;
    try {
      const node = parseValueAt(this.#text, this.#pos);
      this.#pos = node.end;
      return this.#text.slice(node.start, node.end);
    } catch (err) {
      if (!(err instanceof JsonSyntaxError)) throw err;
      this.#failed = true;
      return undefined;
    }
  }

  #valueAllowed(): boolean {
    return this.#state === 'topValue' || this.#state === 'arrayStart' || this.#state === 'arrayValue' || this.#state === 'objectValue';
  }

  #valueEnd(): void {
    if (this.#state === 'arrayStart' || this.#state === 'arrayValue') this.#state = 'arrayComma';
    else if (this.#state === 'objectValue') this.#state = 'objectComma';
  }
}

function scalarToken(raw: string): JsonToken {
  switch (raw[0]) {
    case '"':
      return { kind: 'string', value: decodeStringLiteral(raw) };
    case 't':
      return { kind: 'boolean', value: true };
    case 'f':
      return { kind: 'boolean', value: false };
    case 'n':
      return { kind: 'null' };
    default:
      return { kind: 'number', text: raw };
  }
}

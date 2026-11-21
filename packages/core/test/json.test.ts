import { describe, expect, it } from 'vitest';
import {
  JsonDecoder,
  compactJson,
  indentJson,
  parseJson,
  reencodeJson,
  stringifySorted,
  toPlainValue,
  tryParseJson,
} from '../src/json/index.ts';
import { loadVectors } from './vectors.ts';

const vectors = loadVectors();

function tokenTrace(doc: string): string[] {
  const dec = new JsonDecoder(doc);
  const trace: string[] = [];
  for (let i = 0; i < 200; i++) {
    const t = dec.token();
    if (t === undefined) return trace;
    switch (t.kind) {
      case 'delim':
        trace.push(t.value);
        break;
      case 'string':
        trace.push('s:' + t.value);
        break;
      case 'number':
        trace.push('n:' + t.text);
        break;
      case 'boolean':
        trace.push('b:' + String(t.value));
        break;
      case 'null':
        trace.push('null');
        break;
    }
  }
  return trace;
}

/** Key token, then the whole value as raw text, until the first failure. */
function walkTrace(doc: string): string[] {
  const dec = new JsonDecoder(doc);
  const trace: string[] = [];
  const first = dec.token();
  if (first === undefined) return ['ERR'];
  if (first.kind !== 'delim' || first.value !== '{') return ['not-object'];
  while (dec.more()) {
    const key = dec.token();
    if (key === undefined) return [...trace, 'ERR-key'];
    if (key.kind !== 'string') return [...trace, 'ERR-keytype'];
    const raw = dec.raw();
    if (raw === undefined) return [...trace, 'ERR-value'];
    trace.push(key.value + '=' + raw);
  }
  return [...trace, 'end'];
}

describe('JSON formatting matches the reference vectors', () => {
  it.each(vectors.jsonDocs)('document %#', (v) => {
    expect(compactJson(v.in)).toBe(v.compact);
    expect(indentJson(v.in, '', '  ')).toBe(v.indent);
    expect(indentJson(v.in, '      ', '  ')).toBe(v.indentPrefixed);
    expect(reencodeJson(v.in)).toBe(v.remarshal);
    expect(stringifySorted(toPlainValue(parseJson(v.in)), '', '  ')).toBe(v.sortedKeysIndent);
  });
});

describe('streaming decoder matches the reference vectors', () => {
  it.each(vectors.decoder)('tokens of $in', (v) => {
    // The reference trace ends in a marker ("EOF" or "ERR"); both mean "no
    // further token" here.
    expect(tokenTrace(v.in)).toEqual(v.tokens.slice(0, -1));
  });

  it.each(vectors.decoder)('key/value walk of $in', (v) => {
    expect(walkTrace(v.in)).toEqual(v.walk);
  });
});

describe('parser', () => {
  it('keeps key order, duplicates and number spelling', () => {
    const doc = '{"z":1.0,"10":1e3,"9":12345678901234567890,"z":-0}';
    const root = parseJson(doc);
    expect(root.kind).toBe('object');
    if (root.kind !== 'object') return;
    expect(root.entries.map((e) => e.key)).toEqual(['z', '10', '9', 'z']);
    expect(root.entries.map((e) => (e.value.kind === 'number' ? e.value.text : ''))).toEqual(['1.0', '1e3', '12345678901234567890', '-0']);
  });

  it('records source spans', () => {
    const doc = ' { "a" : [1, {"b": null}] } ';
    const root = parseJson(doc);
    expect(doc.slice(root.start, root.end)).toBe('{ "a" : [1, {"b": null}] }');
  });

  it.each(['', '{', '[1,]', '{"a":1,}', '01', '1.', '+1', '.5', 'tru', '"\\q"', '"\t"', '{"a":1} x', "{'a':1}", 'NaN'])(
    'rejects %j',
    (doc) => {
      expect(tryParseJson(doc)).toBeUndefined();
    },
  );
});

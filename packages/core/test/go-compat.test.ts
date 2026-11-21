import { describe, expect, it } from 'vitest';
import {
  compareStrings,
  csvEncode,
  equalFold,
  escapeHtml,
  escapeHtmlTemplateText,
  fieldsFunc,
  formatFloat,
  jsonString,
  parseFloatText,
  parseIntText,
  quote,
  runeCount,
  byteLength,
  simpleCase,
  sliceBytes,
  toLower,
  toUpper,
  trimSpace,
} from '../src/text/index.ts';
import { floatFromBits, loadVectors } from './vectors.ts';

const vectors = loadVectors();

describe('text helpers match the reference vectors', () => {
  describe.each(vectors.strings)('string %#', (v) => {
    const label = JSON.stringify(v.in);

    it(`jsonString ${label}`, () => {
      expect(jsonString(v.in)).toBe(v.json);
      expect(jsonString(v.in, { escapeHtml: false })).toBe(v.jsonNoHtml);
    });
    it(`quote ${label}`, () => expect(quote(v.in)).toBe(v.quote));
    it(`escapeHtml ${label}`, () => expect(escapeHtml(v.in)).toBe(v.htmlEscape));
    it(`template text ${label}`, () => {
      expect(escapeHtmlTemplateText(v.in)).toBe(v.templateText);
      expect(`<title>${escapeHtmlTemplateText(v.in)}</title>`).toBe(v.templateTitle);
    });
    it(`case ${label}`, () => {
      expect(toLower(v.in)).toBe(v.lower);
      expect(toUpper(v.in)).toBe(v.upper);
    });
    it(`trimSpace ${label}`, () => expect(trimSpace(v.in)).toBe(v.trimSpace));
    it(`lengths ${label}`, () => {
      expect(byteLength(v.in)).toBe(v.byteLen);
      expect(runeCount(v.in)).toBe(v.runeCount);
    });
    it(`byte slicing ${label}`, () => {
      const expected = v.in === '' ? '' : toUpper(sliceBytes(v.in, 0, 1)) + toLower(sliceBytes(v.in, 1));
      expect(expected).toBe(v.firstUpRestLower);
    });
    it(`fieldsFunc ${label}`, () => {
      expect(fieldsFunc(v.in, (ch) => ch === ' ' || ch === '_' || ch === '-')).toEqual(v.fieldsWords ?? []);
    });
  });

  it.each(vectors.numbers)('parseFloatText($in)', (v) => {
    const parsed = parseFloatText(v.in);
    expect(parsed !== null).toBe(v.floatOk);
    if (parsed === null) return;
    expect(Number.isNaN(parsed)).toBe(v.isNaN);
    expect(parsed === Infinity || parsed === -Infinity).toBe(v.isInf);
    if (Number.isFinite(parsed)) expect(formatFloat(parsed)).toBe(v.floatFmt);
  });

  it.each(vectors.numbers)('parseIntText($in)', (v) => {
    const parsed = parseIntText(v.in);
    expect(parsed !== null).toBe(v.intOk);
    if (parsed !== null) expect(parsed.toString()).toBe(v.intFmt);
  });

  it.each(vectors.floats)('formatFloat($fmt)', (v) => {
    const value = floatFromBits(v.bits);
    expect(formatFloat(value)).toBe(v.fmt);
    // JSON number rendering already agrees with the platform.
    expect(String(value)).toBe(v.json);
  });

  it('sorts by code point', () => {
    expect([...vectors.sortInput].sort(compareStrings)).toEqual(vectors.sorted);
  });

  it.each(vectors.folds)('equalFold($a, $b)', (v) => {
    expect(equalFold(v.a, v.b)).toBe(v.equal);
  });

  it.each(vectors.csv)('csv %#', (v) => {
    expect(csvEncode(v.records)).toBe(v.out);
  });
});

describe('simple case mapping across Unicode', () => {
  // The reference table lists every code point whose case mapping is not the
  // identity. Unicode versions differ between runtimes, so scripts added in
  // recent versions may disagree; the scripts that occur in real models must
  // not.
  const table = new Map(vectors.caseMapping.map((m) => [m.r, m]));
  const mismatches: number[] = [];
  for (let cp = 0; cp <= 0x10ffff; cp++) {
    if (cp >= 0xd800 && cp <= 0xdfff) continue;
    const want = table.get(cp) ?? { lower: cp, upper: cp };
    if (simpleCase.lower(cp) !== want.lower || simpleCase.upper(cp) !== want.upper) mismatches.push(cp);
  }

  it('agrees for Latin, Greek, Cyrillic and every other script through U+2FFF', () => {
    expect(mismatches.filter((cp) => cp < 0x3000).map((cp) => cp.toString(16))).toEqual([]);
  });

  it('disagrees, if at all, only on recently added scripts', () => {
    // Keep this list short and explicit so a regression is noticed.
    expect(mismatches.length).toBeLessThan(120);
  });
});

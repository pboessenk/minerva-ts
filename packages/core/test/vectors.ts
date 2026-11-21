import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Reference results for the text helpers, recorded once from the Go standard
 * library, whose string, number and JSON rules the helpers follow.
 */
export interface ReferenceVectors {
  goVersion: string;
  strings: {
    in: string;
    json: string;
    jsonNoHtml: string;
    quote: string;
    htmlEscape: string;
    templateText: string;
    templateTitle: string;
    lower: string;
    upper: string;
    trimSpace: string;
    byteLen: number;
    runeCount: number;
    firstUpRestLower: string;
    fieldsWords: string[] | null;
  }[];
  numbers: { in: string; floatOk: boolean; floatFmt: string; isInf: boolean; isNaN: boolean; intOk: boolean; intFmt: string }[];
  floats: { bits: string; fmt: string; json: string }[];
  sorted: string[];
  sortInput: string[];
  folds: { a: string; b: string; equal: boolean }[];
  jsonDocs: { in: string; compact: string; indent: string; indentPrefixed: string; remarshal: string; sortedKeysIndent: string }[];
  csv: { records: string[][]; out: string }[];
  decoder: { in: string; tokens: string[]; walk: string[] }[];
  caseMapping: { r: number; lower: number; upper: number }[];
}

export function loadVectors(): ReferenceVectors {
  const path = fileURLToPath(new URL('../../../fixtures/vectors/go-compat.json', import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as ReferenceVectors;
}

/** Rebuilds a double from the hexadecimal bit pattern in the vectors. */
export function floatFromBits(bits: string): number {
  const view = new DataView(new ArrayBuffer(8));
  view.setBigUint64(0, BigInt('0x' + bits));
  return view.getFloat64(0);
}

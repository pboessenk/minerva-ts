import { decodeModel } from '../src/model/decode.ts';
import type { Model } from '../src/model/types.ts';
import { type DriftFinding, type DriftReport, buildDriftReport, parseOpenApiDocument } from '../src/compare/index.ts';

/** A model from its JSON form; omitted members take their empty values. */
export function model(json: unknown): Model {
  return decodeModel(JSON.stringify(json));
}

/** Parses a contract and compares it with a model, without codelists. */
export function runCompare(m: Model, contractJson: string, includeDescriptions = false): DriftReport {
  return buildDriftReport(m, parseOpenApiDocument(contractJson), null, { includeDescriptions });
}

/** The first finding of `category` (and, when given, entity and property). */
export function findFinding(findings: readonly DriftFinding[], category: string, entity = '', property = ''): DriftFinding | undefined {
  return findings.find(
    (f) => f.category === category && (entity === '' || f.entity === entity) && (property === '' || f.property === property),
  );
}

export function countCategory(findings: readonly DriftFinding[], category: string): number {
  return findings.filter((f) => f.category === category).length;
}

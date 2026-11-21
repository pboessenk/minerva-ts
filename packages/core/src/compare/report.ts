import type { CodelistLookup } from '../catalog/types.ts';
import type { Model } from '../model/types.ts';
import { compareStrings } from '../text/compare.ts';
import type { OaDocument } from './contract-decode.ts';
import { normalizeContract } from './contract.ts';
import { diffOperationPair } from './diff-operations.ts';
import { diffSchemaPair } from './diff-schemas.ts';
import type { CompareOptions, DriftFinding, DriftReport, DriftStats, IrDoc } from './ir.ts';
import { Matcher, matchAll } from './matcher.ts';
import { normalizeModel } from './model.ts';
import { reportUnmatched } from './unmatched.ts';

/** Pairs and diffs two normalized documents. Severity counts are left at zero. */
export function compareIr(model: IrDoc, contract: IrDoc, opts: CompareOptions): { findings: DriftFinding[]; stats: DriftStats } {
  const mt = new Matcher(model, contract, opts);
  matchAll(mt);

  for (const modelKey of model.opOrder) {
    const contractKey = mt.opPairs.get(modelKey);
    if (contractKey !== undefined) diffOperationPair(mt, model.operations.get(modelKey)!, contract.operations.get(contractKey)!);
  }
  for (const modelName of model.schemaOrder) {
    const contractName = mt.pairs.get(modelName);
    if (contractName !== undefined) diffSchemaPair(mt, modelName, contractName);
  }

  reportUnmatched(mt);

  return {
    findings: mt.findings,
    stats: {
      errors: 0,
      warnings: 0,
      infos: 0,
      modelSchemas: model.schemaOrder.length,
      contractSchemas: contract.schemaOrder.length,
      matchedSchemas: mt.pairs.size,
      modelOperations: model.opOrder.length,
      contractOperations: contract.opOrder.length,
      matchedOperations: mt.opPairs.size,
    },
  };
}

function severityRank(severity: string): number {
  return severity === 'error' ? 0 : severity === 'warn' ? 1 : 2;
}

/**
 * Orders findings severity first, then by category, operation, entity,
 * property, code and text. The sort is stable, so findings that tie keep the
 * order they were found in.
 */
export function sortFindings(findings: DriftFinding[]): void {
  findings.sort(
    (a, b) =>
      severityRank(a.severity) - severityRank(b.severity) ||
      compareStrings(a.category, b.category) ||
      compareStrings(a.operation, b.operation) ||
      compareStrings(a.entity, b.entity) ||
      compareStrings(a.property, b.property) ||
      compareStrings(a.code, b.code) ||
      compareStrings(a.changeNeeded, b.changeNeeded),
  );
}

/** Compares a model with a parsed contract. */
export function buildDriftReport(model: Model, doc: OaDocument, codelists: CodelistLookup | null, opts: CompareOptions): DriftReport {
  const contract = normalizeContract(doc);
  const modelIr = normalizeModel(model, codelists);

  const { findings, stats } = compareIr(modelIr, contract.ir, opts);
  findings.push(...contract.findings);
  sortFindings(findings);
  for (const f of findings) {
    if (f.severity === 'error') stats.errors++;
    else if (f.severity === 'warn') stats.warnings++;
    else stats.infos++;
  }

  return {
    modelTitle: modelIr.title,
    modelVersion: modelIr.version,
    contractTitle: contract.ir.title,
    contractVersion: contract.ir.version,
    stats,
    findings,
  };
}

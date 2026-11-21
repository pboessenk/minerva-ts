/**
 * Contract comparison: the drift between a model and an OpenAPI 3.x JSON
 * contract, as a sorted list of findings.
 *
 * ```ts
 * const doc = parseOpenApiDocument(text); // throws ContractDecodeError
 * const report = buildDriftReport(model, doc, codelists, { includeDescriptions: false });
 * ```
 */
export { ContractDecodeError, parseOpenApiDocument, type OaDocument } from './contract-decode.ts';
export { NilSchemaError, normalizeContract } from './contract.ts';
export { normalizeModel } from './model.ts';
export { normalizePath, canonicalSchemaName } from './names.ts';
export { buildDriftReport, compareIr, sortFindings } from './report.ts';
export { formatShortFloat, valueText } from './value-text.ts';
export type {
  CompareOptions,
  DriftFinding,
  DriftReport,
  DriftStats,
  IrBody,
  IrDoc,
  IrOperation,
  IrParam,
  IrProp,
  IrSchema,
  Severity,
} from './ir.ts';

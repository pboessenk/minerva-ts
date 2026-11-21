import { equalFold, toLower } from '../text/case.ts';
import { quote } from '../text/escape.ts';
import { type CompareOptions, type DriftFinding, type FindingInit, type IrBody, type IrDoc, type IrSchema, finding } from './ir.ts';

/**
 * Pairs the operations and schemas of the model with those of the contract.
 *
 * Phases, in this order:
 *  1. operations by method and normalized path;
 *  2. schemas by canonical name, ignoring case;
 *  3. schemas anchored by the request and response bodies of paired operations;
 *  4. schemas referenced by same-named properties of paired schemas (breadth first);
 *  5. enums that carry the same SIVI codelist code.
 *
 * The diff passes then compare each pair and report what stayed unpaired.
 */
export class Matcher {
  readonly model: IrDoc;
  readonly contract: IrDoc;
  readonly opts: CompareOptions;
  /** Model schema name -> contract schema name. */
  readonly pairs = new Map<string, string>();
  readonly contractPaired = new Set<string>();
  /** Model operation key -> contract operation key. */
  readonly opPairs = new Map<string, string>();
  readonly findings: DriftFinding[] = [];

  constructor(model: IrDoc, contract: IrDoc, opts: CompareOptions) {
    this.model = model;
    this.contract = contract;
    this.opts = opts;
  }

  add(init: FindingInit): void {
    this.findings.push(finding(init));
  }

  modelSchema(name: string): IrSchema | undefined {
    return this.model.schemas.get(name);
  }

  contractSchema(name: string): IrSchema | undefined {
    return this.contract.schemas.get(name);
  }

  /** Whether a model reference and a contract reference point at corresponding schemas. */
  refsCorrespond(modelRef: string, contractRef: string): boolean {
    return this.pairs.get(modelRef) === contractRef || equalFold(modelRef, contractRef);
  }

  contractRawName(name: string): string {
    const s = this.contract.schemas.get(name);
    return s !== undefined && s.rawName !== '' ? s.rawName : name;
  }

  /** Records a pair; when the names differ, the correspondence itself is reported. */
  pair(modelName: string, contractName: string, via: string): void {
    this.pairs.set(modelName, contractName);
    this.contractPaired.add(contractName);
    if (!equalFold(modelName, contractName) && via !== 'sivi') {
      const raw = this.contractRawName(contractName);
      this.add({
        category: 'schema-name-mismatch',
        severity: 'info',
        entity: modelName,
        model: modelName,
        contract: raw,
        changeNeeded: `Model entity ${quote(modelName)} corresponds to contract schema ${quote(raw)} (matched via ${via}); consider aligning the names.`,
      });
    }
  }
}

function matchOperations(mt: Matcher): void {
  for (const key of mt.model.opOrder) {
    if (mt.contract.operations.has(key)) mt.opPairs.set(key, key);
  }
}

function matchSchemasByName(mt: Matcher): void {
  const index = new Map<string, string>(); // lower-cased canonical name -> contract name
  for (const name of mt.contract.schemaOrder) {
    const lower = toLower(name);
    if (!index.has(lower)) index.set(lower, name);
  }
  for (const modelName of mt.model.schemaOrder) {
    const contractName = index.get(toLower(modelName));
    if (contractName !== undefined && !mt.contractPaired.has(contractName)) mt.pair(modelName, contractName, 'name');
  }
}

/** Pairs the body schemas of paired operations that are still unpaired on both sides. */
function matchSchemasByAnchor(mt: Matcher): void {
  const tryPair = (modelBody: IrBody | null | undefined, contractBody: IrBody | null | undefined): void => {
    if (!modelBody || !contractBody || modelBody.ref === '' || contractBody.ref === '' || contractBody.unconstrained) return;
    if (mt.pairs.has(modelBody.ref) || mt.contractPaired.has(contractBody.ref)) return;
    if (!mt.model.schemas.has(modelBody.ref) || !mt.contract.schemas.has(contractBody.ref)) return;
    mt.pair(modelBody.ref, contractBody.ref, 'operation');
  };
  for (const modelKey of mt.model.opOrder) {
    const contractKey = mt.opPairs.get(modelKey);
    if (contractKey === undefined) continue;
    const modelOp = mt.model.operations.get(modelKey)!;
    const contractOp = mt.contract.operations.get(contractKey)!;
    tryPair(modelOp.requestBody, contractOp.requestBody);
    for (const code of modelOp.respOrder) tryPair(modelOp.responses.get(code), contractOp.responses.get(code));
  }
}

/** Walks paired objects and pairs the schemas their same-named properties reference. */
function propagateSchemaPairs(mt: Matcher): void {
  const queue = mt.model.schemaOrder.filter((name) => mt.pairs.has(name));
  while (queue.length > 0) {
    const modelName = queue.shift() as string;
    const ms = mt.modelSchema(modelName);
    const cs = mt.contractSchema(mt.pairs.get(modelName) ?? '');
    if (ms === undefined || cs === undefined || ms.kind !== 'object' || cs.kind !== 'object') continue;
    for (const propName of ms.propOrder) {
      const mp = ms.properties.get(propName)!;
      const cp = cs.properties.get(propName);
      if (cp === undefined || mp.ref === '' || cp.ref === '') continue;
      if (mt.pairs.has(mp.ref) || mt.contractPaired.has(cp.ref)) continue;
      if (!mt.model.schemas.has(mp.ref) || !mt.contract.schemas.has(cp.ref)) continue;
      mt.pair(mp.ref, cp.ref, `property ${modelName}.${propName}`);
      queue.push(mp.ref);
    }
  }
}

/** Pairs leftover enums that carry the same SIVI codelist code. */
function matchEnumsBySiviCode(mt: Matcher): void {
  for (const modelName of mt.model.schemaOrder) {
    const ms = mt.modelSchema(modelName)!;
    if (ms.kind !== 'enum' || ms.siviCode === '' || mt.pairs.has(modelName)) continue;
    for (const contractName of mt.contract.schemaOrder) {
      const cs = mt.contractSchema(contractName)!;
      if (cs.kind !== 'enum' || cs.siviCode !== ms.siviCode || mt.contractPaired.has(contractName)) continue;
      mt.pair(modelName, contractName, 'sivi');
      mt.add({
        category: 'enum-name-mismatch',
        severity: 'warn',
        entity: modelName,
        model: modelName,
        contract: cs.rawName,
        changeNeeded: `Enums ${quote(modelName)} (model) and ${quote(cs.rawName)} (contract) both carry SIVI code ${ms.siviCode} but are named differently; align the names.`,
      });
      break;
    }
  }
}

/** Runs the matching phases in order. */
export function matchAll(mt: Matcher): void {
  matchOperations(mt);
  matchSchemasByName(mt);
  matchSchemasByAnchor(mt);
  propagateSchemaPairs(mt);
  matchEnumsBySiviCode(mt);
}

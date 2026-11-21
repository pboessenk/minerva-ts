import { equalFold } from '../text/case.ts';
import { quote } from '../text/escape.ts';
import type { IrBody, IrOperation } from './ir.ts';
import type { Matcher } from './matcher.ts';

/** Contract operations that serve API metadata (documentation endpoints) rather than business functions. */
function isMetaOperation(op: IrOperation): boolean {
  return op.rawPath.includes('api-docs') || op.tags.some((tag) => equalFold(tag, 'Docs'));
}

/** Model schemas used where the contract counterpart is an unconstrained body. */
function unconstrainedRoots(mt: Matcher): string[] {
  const roots: string[] = [];
  const collect = (modelBody: IrBody | null | undefined, contractBody: IrBody | null | undefined): void => {
    if (modelBody && modelBody.ref !== '' && contractBody && contractBody.unconstrained) roots.push(modelBody.ref);
  };
  for (const modelKey of mt.model.opOrder) {
    const contractKey = mt.opPairs.get(modelKey);
    if (contractKey === undefined) continue;
    const modelOp = mt.model.operations.get(modelKey)!;
    const contractOp = mt.contract.operations.get(contractKey)!;
    collect(modelOp.requestBody, contractOp.requestBody);
    for (const code of modelOp.respOrder) collect(modelOp.responses.get(code), contractOp.responses.get(code));
  }
  return roots;
}

/** Model schemas referenced from operations the contract does not have. */
function unmatchedOpRoots(mt: Matcher): string[] {
  const roots: string[] = [];
  for (const modelKey of mt.model.opOrder) {
    if (mt.opPairs.has(modelKey)) continue;
    const op = mt.model.operations.get(modelKey)!;
    if (op.requestBody !== null && op.requestBody.ref !== '') roots.push(op.requestBody.ref);
    for (const code of op.respOrder) {
      const body = op.responses.get(code);
      if (body && body.ref !== '') roots.push(body.ref);
    }
  }
  return roots;
}

/** The model schemas reachable from `roots` through properties and union variants. */
function modelClosure(mt: Matcher, roots: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const queue = [...roots];
  while (queue.length > 0) {
    const name = queue.shift() as string;
    if (seen.has(name)) continue;
    const s = mt.modelSchema(name);
    if (s === undefined) continue;
    seen.add(name);
    queue.push(...s.oneOf);
    for (const propName of s.propOrder) {
      const ref = s.properties.get(propName)!.ref;
      if (ref !== '') queue.push(ref);
    }
  }
  return seen;
}

/** Unpaired model schemas referenced by a property of a paired schema: their drift is reported at that property. */
function refsFromPairedModelSchemas(mt: Matcher): Set<string> {
  const out = new Set<string>();
  for (const modelName of mt.pairs.keys()) {
    const s = mt.modelSchema(modelName);
    if (s === undefined) continue;
    for (const propName of s.propOrder) {
      const ref = s.properties.get(propName)!.ref;
      if (ref !== '' && !mt.pairs.has(ref)) out.add(ref);
    }
  }
  return out;
}

/**
 * Reports the operations and schemas that stayed unpaired. Severity depends
 * on reachability: a model schema the contract only accepts as an open body
 * is info, one used only by operations the contract lacks is covered by the
 * operation finding.
 */
export function reportUnmatched(mt: Matcher): void {
  for (const key of mt.model.opOrder) {
    if (mt.opPairs.has(key)) continue;
    const op = mt.model.operations.get(key)!;
    mt.add({
      category: 'operation-missing-in-contract',
      severity: 'warn',
      operation: `${op.method} ${op.rawPath}`,
      model: op.operationId,
      changeNeeded: `Model documents ${op.method} ${op.rawPath} but the contract does not; add the operation to the contract or remove it from the model.`,
    });
  }
  const matchedContractOps = new Set(mt.opPairs.values());
  for (const key of mt.contract.opOrder) {
    if (matchedContractOps.has(key)) continue;
    const op = mt.contract.operations.get(key)!;
    mt.add({
      category: 'operation-missing-in-model',
      severity: isMetaOperation(op) ? 'info' : 'warn',
      operation: `${op.method} ${op.rawPath}`,
      contract: op.operationId,
      changeNeeded: `Contract documents ${op.method} ${op.rawPath} but the model does not; add the operation to the model.`,
    });
  }

  const infoSet = modelClosure(mt, unconstrainedRoots(mt));
  const skipSet = modelClosure(mt, unmatchedOpRoots(mt));
  const referenced = refsFromPairedModelSchemas(mt);

  for (const modelName of mt.model.schemaOrder) {
    if (mt.pairs.has(modelName)) continue;
    const ms = mt.modelSchema(modelName)!;
    // Subtype schemas go with their union; reporting each one is noise.
    if (ms.isSubtype) continue;
    if (referenced.has(modelName)) continue; // reported at the referencing property
    if (infoSet.has(modelName)) {
      mt.add({
        category: 'schema-missing-in-contract',
        severity: 'info',
        entity: modelName,
        model: ms.kind,
        changeNeeded: `Model entity ${quote(modelName)} is accepted but not validated by the contract (open request body); no contract schema exists for it.`,
      });
      continue;
    }
    if (skipSet.has(modelName)) continue; // covered by operation-missing-in-contract
    mt.add({
      category: 'schema-missing-in-contract',
      severity: 'warn',
      entity: modelName,
      model: ms.kind,
      changeNeeded: `Model defines ${quote(modelName)} but the contract has no corresponding schema; add it to the contract or remove it from the model.`,
    });
  }

  for (const contractName of mt.contract.schemaOrder) {
    if (mt.contractPaired.has(contractName)) continue;
    const cs = mt.contractSchema(contractName)!;
    // allOf bases and inlined primitives are structural; the flat model
    // never defines them (the mirror of skipping subtype schemas above).
    if (cs.isAllOfBase || cs.isScalarRef) continue;
    if (cs.kind === 'open') {
      mt.add({
        category: 'schema-missing-in-model',
        severity: 'info',
        entity: contractName,
        contract: cs.rawName,
        changeNeeded: `Contract schema ${quote(cs.rawName)} is an unconstrained object; there is nothing to compare against the model.`,
      });
      continue;
    }
    mt.add({
      category: 'schema-missing-in-model',
      severity: 'warn',
      entity: contractName,
      contract: cs.rawName,
      changeNeeded: `Contract defines ${quote(cs.rawName)} but the model has no corresponding entity; add it to the model.`,
    });
  }
}

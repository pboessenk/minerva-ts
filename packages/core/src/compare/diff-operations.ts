import { quote } from '../text/escape.ts';
import { diffRequestBodies, diffResponses } from './diff-bodies.ts';
import { diffParams } from './diff-parameters.ts';
import type { IrOperation } from './ir.ts';
import type { Matcher } from './matcher.ts';

/** Compares a model operation with the contract operation it was paired with. */
export function diffOperationPair(mt: Matcher, modelOp: IrOperation, contractOp: IrOperation): void {
  const opLabel = `${modelOp.method} ${modelOp.rawPath}`;

  if (modelOp.operationId !== '' && contractOp.operationId !== '' && modelOp.operationId !== contractOp.operationId) {
    mt.add({
      category: 'operation-id-mismatch',
      severity: 'info',
      operation: opLabel,
      model: modelOp.operationId,
      contract: contractOp.operationId,
      changeNeeded: `Operation IDs differ (${quote(modelOp.operationId)} vs ${quote(contractOp.operationId)}); align them for traceability.`,
    });
  }

  diffParams(mt, opLabel, modelOp.params, contractOp.params);
  diffRequestBodies(mt, opLabel, modelOp, contractOp);
  diffResponses(mt, opLabel, modelOp, contractOp);
}

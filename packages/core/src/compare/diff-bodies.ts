import { compareStrings } from '../text/compare.ts';
import { quote } from '../text/escape.ts';
import { describeBody } from './describe.ts';
import type { IrBody, IrOperation } from './ir.ts';
import type { Matcher } from './matcher.ts';

/** Checks that two body references point at paired schemas with the same cardinality. */
function compareBodyRefs(mt: Matcher, opLabel: string, code: string, where: string, modelBody: IrBody, contractBody: IrBody): void {
  const category = code !== '' ? 'response-schema-mismatch' : 'request-body-mismatch';
  if (modelBody.array !== contractBody.array) {
    mt.add({
      category,
      severity: 'error',
      operation: opLabel,
      code,
      model: describeBody(modelBody),
      contract: describeBody(contractBody),
      changeNeeded: `The ${where} of ${opLabel} is ${describeBody(modelBody)} in the model but ${describeBody(contractBody)} in the contract; align the cardinality.`,
    });
    return;
  }
  if (modelBody.ref === '') {
    if (contractBody.ref !== '') {
      mt.add({
        category,
        severity: 'error',
        operation: opLabel,
        code,
        model: describeBody(modelBody),
        contract: describeBody(contractBody),
        changeNeeded: `The ${where} of ${opLabel} has no schema in the model but ${describeBody(contractBody)} in the contract; align both sides.`,
      });
    }
    return;
  }
  if (!mt.refsCorrespond(modelBody.ref, contractBody.ref)) {
    mt.add({
      category,
      severity: 'error',
      operation: opLabel,
      code,
      model: modelBody.ref,
      contract: contractBody.ref,
      changeNeeded: `The ${where} of ${opLabel} is ${quote(modelBody.ref)} in the model but ${quote(contractBody.ref)} in the contract; point both at the same schema.`,
    });
  }
}

export function diffRequestBodies(mt: Matcher, opLabel: string, modelOp: IrOperation, contractOp: IrOperation): void {
  const modelBody = modelOp.requestBody;
  const contractBody = contractOp.requestBody;

  if (contractBody !== null && contractBody.unconstrained) {
    const detail =
      modelBody !== null && modelBody.ref !== ''
        ? `The model's ${quote(modelBody.ref)} structure (and everything below it) is not validated by the contract.`
        : "The model's request structure is not validated by the contract.";
    mt.add({
      category: 'request-body-unconstrained',
      severity: 'info',
      operation: opLabel,
      contract: 'any JSON object',
      changeNeeded: `Contract accepts any JSON object for ${opLabel}. ${detail} Consider constraining the contract schema.`,
    });
    return;
  }
  if (modelBody === null && contractBody === null) return;
  if (modelBody === null) {
    mt.add({
      category: 'request-body-mismatch',
      severity: 'error',
      operation: opLabel,
      contract: describeBody(contractBody),
      changeNeeded: `Contract expects a request body (${describeBody(contractBody)}) for ${opLabel} but the model documents none; add it to the model.`,
    });
    return;
  }
  if (contractBody === null) {
    mt.add({
      category: 'request-body-mismatch',
      severity: 'error',
      operation: opLabel,
      model: describeBody(modelBody),
      changeNeeded: `Model documents a request body (${describeBody(modelBody)}) for ${opLabel} but the contract has none; add it to the contract.`,
    });
    return;
  }
  if (contractBody.ref === '') return; // inline or unsupported: already reported by the normalizer
  compareBodyRefs(mt, opLabel, '', 'request body', modelBody, contractBody);
}

function diffResponseBodies(mt: Matcher, opLabel: string, code: string, modelBody: IrBody | null, contractBody: IrBody | null): void {
  if (contractBody !== null && contractBody.unconstrained) return; // the contract declines to constrain this response
  if (modelBody === null && contractBody === null) return;
  if (modelBody === null) {
    if ((contractBody as IrBody).ref === '') return; // inline or unsupported: already reported by the normalizer
    mt.add({
      category: 'response-schema-mismatch',
      severity: 'error',
      operation: opLabel,
      code,
      contract: describeBody(contractBody),
      changeNeeded: `Contract returns ${describeBody(contractBody)} for the ${code} response of ${opLabel} but the model documents no body; add the schema to the model.`,
    });
    return;
  }
  if (contractBody === null) {
    mt.add({
      category: 'response-schema-mismatch',
      severity: 'error',
      operation: opLabel,
      code,
      model: describeBody(modelBody),
      changeNeeded: `Model documents ${describeBody(modelBody)} for the ${code} response of ${opLabel} but the contract has no body; align both sides.`,
    });
    return;
  }
  if (contractBody.ref === '') return;
  compareBodyRefs(mt, opLabel, code, 'response ' + code, modelBody, contractBody);
}

export function diffResponses(mt: Matcher, opLabel: string, modelOp: IrOperation, contractOp: IrOperation): void {
  const codes = [...new Set([...modelOp.responses.keys(), ...contractOp.responses.keys()])].sort(compareStrings);
  for (const code of codes) {
    const inModel = modelOp.responses.has(code);
    const inContract = contractOp.responses.has(code);
    const modelBody = modelOp.responses.get(code) ?? null;
    const contractBody = contractOp.responses.get(code) ?? null;
    if (inModel && !inContract) {
      mt.add({
        category: 'response-code-missing-in-contract',
        severity: 'warn',
        operation: opLabel,
        code,
        model: describeBody(modelBody),
        changeNeeded: `Model documents a ${code} response for ${opLabel} but the contract does not; add it to the contract or remove it from the model.`,
      });
    } else if (!inModel && inContract) {
      mt.add({
        category: 'response-code-missing-in-model',
        // Gateway and server errors are usually platform-level.
        severity: code.startsWith('5') ? 'info' : 'warn',
        operation: opLabel,
        code,
        contract: describeBody(contractBody),
        changeNeeded: `Contract returns ${code} for ${opLabel} but the model does not document it; add a ${code} response to the model.`,
      });
    } else {
      diffResponseBodies(mt, opLabel, code, modelBody, contractBody);
    }
  }
}

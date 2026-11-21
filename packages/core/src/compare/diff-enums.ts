import { quote } from '../text/escape.ts';
import { diffStringSets } from './describe.ts';
import type { IrSchema } from './ir.ts';
import type { Matcher } from './matcher.ts';

/**
 * Reports values allowed on one side only. `property` is empty for a pair
 * of enum schemas and set for an enum compared with an inline enum.
 */
export function diffEnumValues(
  mt: Matcher,
  entity: string,
  property: string,
  contractName: string,
  modelValues: readonly string[],
  contractValues: readonly string[],
): void {
  const onlyInModel = diffStringSets(modelValues, contractValues);
  const onlyInContract = diffStringSets(contractValues, modelValues);
  if (onlyInModel.length === 0 && onlyInContract.length === 0) return;
  const loc = property !== '' ? `${entity}.${property}` : entity;
  const parts: string[] = [];
  if (onlyInModel.length > 0) {
    parts.push(`the model allows ${onlyInModel.length} value(s) the contract rejects (${onlyInModel.join(', ')})`);
  }
  if (onlyInContract.length > 0) {
    parts.push(`the contract allows ${onlyInContract.length} value(s) the model lacks (${onlyInContract.join(', ')})`);
  }
  mt.add({
    category: 'enum-values-drift',
    severity: 'error',
    entity,
    property,
    contract: contractName,
    onlyInModel,
    onlyInContract,
    changeNeeded: `${loc}: ${parts.join('; ')}. Align the allowed values on both sides.`,
  });
}

export function diffEnumPair(mt: Matcher, modelName: string, ms: IrSchema, cs: IrSchema): void {
  diffEnumValues(mt, modelName, '', cs.rawName, ms.enumValues, cs.enumValues);
  if (ms.siviCode !== '' && cs.siviCode !== '' && ms.siviCode !== cs.siviCode) {
    mt.add({
      category: 'sivi-code-mismatch',
      severity: 'warn',
      entity: modelName,
      model: ms.siviCode,
      contract: cs.siviCode,
      changeNeeded: `Enum ${quote(modelName)} carries SIVI code ${ms.siviCode} in the model but ${cs.siviCode} in the contract; align the codelist binding.`,
    });
  }
}

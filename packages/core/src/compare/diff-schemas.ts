import { quote } from '../text/escape.ts';
import { trimSpace } from '../text/strings.ts';
import { describeProp, diffStringSets } from './describe.ts';
import { diffEnumPair } from './diff-enums.ts';
import { diffProp } from './diff-properties.ts';
import { DISCRIMINATOR } from '../export/entities.ts';
import type { IrSchema } from './ir.ts';
import type { Matcher } from './matcher.ts';

function diffObjectPair(mt: Matcher, modelName: string, ms: IrSchema, cs: IrSchema): void {
  for (const propName of ms.propOrder) {
    const mp = ms.properties.get(propName)!;
    const cp = cs.properties.get(propName);
    if (cp === undefined) {
      // The discriminator of a subtype schema has no contract counterpart by design.
      if (ms.isSubtype && propName === DISCRIMINATOR) continue;
      mt.add({
        category: 'property-missing-in-contract',
        severity: 'warn',
        entity: modelName,
        property: propName,
        model: describeProp(mp),
        changeNeeded: `Model documents ${modelName}.${propName} (${describeProp(mp)}) but the contract does not; add it to the contract or remove it from the model.`,
      });
      continue;
    }
    diffProp(mt, modelName, propName, mp, cp);
  }
  for (const propName of cs.propOrder) {
    if (ms.properties.has(propName)) continue;
    const cp = cs.properties.get(propName)!;
    mt.add({
      category: 'property-missing-in-model',
      severity: 'error',
      entity: modelName,
      property: propName,
      contract: describeProp(cp),
      changeNeeded: `Contract documents ${modelName}.${propName} (${describeProp(cp)}) but the model does not; add the attribute to the model.`,
    });
  }
}

function diffUnionPair(mt: Matcher, modelName: string, ms: IrSchema, cs: IrSchema): void {
  const onlyInModel = diffStringSets(ms.oneOf, cs.oneOf);
  const onlyInContract = diffStringSets(cs.oneOf, ms.oneOf);
  if (onlyInModel.length === 0 && onlyInContract.length === 0) return;
  mt.add({
    category: 'schema-kind-mismatch',
    severity: 'error',
    entity: modelName,
    onlyInModel,
    onlyInContract,
    model: ms.oneOf.join(', '),
    contract: cs.oneOf.join(', '),
    changeNeeded: `Union ${quote(modelName)} has different variants in model and contract; align the subtype lists.`,
  });
}

/** Compares a model schema with the contract schema it was paired with. */
export function diffSchemaPair(mt: Matcher, modelName: string, contractName: string): void {
  const ms = mt.modelSchema(modelName)!;
  const cs = mt.contractSchema(contractName)!;

  if (cs.kind === 'open') {
    mt.add({
      category: 'unsupported-shape',
      severity: 'info',
      entity: modelName,
      contract: cs.rawName,
      changeNeeded: `Contract schema ${quote(cs.rawName)} is an unconstrained object; its structure cannot be compared with model entity ${quote(modelName)}.`,
    });
    return;
  }

  if (ms.kind !== cs.kind) {
    mt.add({
      category: 'schema-kind-mismatch',
      severity: 'error',
      entity: modelName,
      model: ms.kind,
      contract: cs.kind,
      changeNeeded: `${quote(modelName)} is a ${ms.kind} in the model but a ${cs.kind} in the contract; restructure one side to match the other.`,
    });
    return;
  }

  switch (ms.kind) {
    case 'object':
      diffObjectPair(mt, modelName, ms, cs);
      break;
    case 'enum':
      diffEnumPair(mt, modelName, ms, cs);
      break;
    case 'union':
      diffUnionPair(mt, modelName, ms, cs);
      break;
  }

  if (mt.opts.includeDescriptions) {
    const modelDescription = trimSpace(ms.description);
    const contractDescription = trimSpace(cs.description);
    if (modelDescription !== contractDescription) {
      mt.add({
        category: 'description-drift',
        severity: 'info',
        entity: modelName,
        model: modelDescription,
        contract: contractDescription,
        changeNeeded: `Descriptions of ${quote(modelName)} differ between model and contract.`,
      });
    }
  }
}

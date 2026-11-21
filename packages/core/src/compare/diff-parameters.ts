import { quote } from '../text/escape.ts';
import { requiredLabel } from './describe.ts';
import type { IrParam } from './ir.ts';
import type { Matcher } from './matcher.ts';

const LOCATIONS = ['path', 'query', 'header'];

function compareParamPair(mt: Matcher, opLabel: string, mp: IrParam, cp: IrParam, renamed: boolean): void {
  const name = renamed ? `${mp.name}/${cp.name}` : mp.name;
  if (mp.type !== cp.type) {
    mt.add({
      category: 'param-mismatch',
      severity: 'warn',
      operation: opLabel,
      property: name,
      model: mp.type,
      contract: cp.type,
      changeNeeded: `Parameter ${quote(name)} is ${mp.type} in the model but ${cp.type} in the contract; align the types.`,
    });
  }
  if (mp.required !== cp.required) {
    mt.add({
      category: 'param-mismatch',
      severity: 'warn',
      operation: opLabel,
      property: name,
      model: requiredLabel(mp.required),
      contract: requiredLabel(cp.required),
      changeNeeded: `Parameter ${quote(name)} is ${requiredLabel(mp.required)} in the model but ${requiredLabel(cp.required)} in the contract; align the required flag.`,
    });
  }
}

/**
 * Pairs parameters by location and name. A single leftover on each side in
 * the same location is taken to be a rename.
 */
export function diffParams(mt: Matcher, opLabel: string, modelParams: readonly IrParam[], contractParams: readonly IrParam[]): void {
  const key = (p: IrParam): string => `${p.in}:${p.name}`;
  const contractIndex = new Map<string, IrParam>();
  for (const p of contractParams) contractIndex.set(key(p), p);

  const modelMatched = new Set<string>();
  const modelLeft: IrParam[] = [];
  for (const mp of modelParams) {
    const cp = contractIndex.get(key(mp));
    if (cp === undefined) {
      modelLeft.push(mp);
      continue;
    }
    modelMatched.add(key(mp));
    compareParamPair(mt, opLabel, mp, cp, false);
  }
  const contractLeft = contractParams.filter((p) => !modelMatched.has(key(p)));

  for (const location of LOCATIONS) {
    const modelIn = modelLeft.filter((p) => p.in === location);
    const contractIn = contractLeft.filter((p) => p.in === location);
    if (modelIn.length === 1 && contractIn.length === 1) {
      const [mp, cp] = [modelIn[0] as IrParam, contractIn[0] as IrParam];
      mt.add({
        category: 'param-mismatch',
        severity: 'info',
        operation: opLabel,
        model: mp.name,
        contract: cp.name,
        changeNeeded: `The ${location} parameter is named ${quote(mp.name)} in the model and ${quote(cp.name)} in the contract; align the names.`,
      });
      compareParamPair(mt, opLabel, mp, cp, true);
      continue;
    }
    for (const p of modelIn) {
      mt.add({
        category: 'param-missing',
        severity: 'warn',
        operation: opLabel,
        property: p.name,
        model: `${p.in} ${p.type}`,
        changeNeeded: `Model documents ${p.in} parameter ${quote(p.name)} but the contract does not; add it to the contract or remove it from the model.`,
      });
    }
    for (const p of contractIn) {
      mt.add({
        category: 'param-missing',
        severity: 'warn',
        operation: opLabel,
        property: p.name,
        contract: `${p.in} ${p.type}`,
        changeNeeded: `Contract documents ${p.in} parameter ${quote(p.name)} but the model does not; add it to the model.`,
      });
    }
  }
}

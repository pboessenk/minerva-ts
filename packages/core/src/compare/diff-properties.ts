import { quote } from '../text/escape.ts';
import { trimSpace } from '../text/strings.ts';
import { describeProp, orDash, requiredLabel } from './describe.ts';
import { diffEnumValues } from './diff-enums.ts';
import type { IrProp } from './ir.ts';
import type { Matcher } from './matcher.ts';

/** Keywords of a scalar property or of the elements of a primitive array; item bounds are compared separately. */
const ELEMENT_CONSTRAINT_KEYS = ['minLength', 'maxLength', 'minimum', 'exclusiveMinimum', 'maximum', 'exclusiveMaximum', 'default'];
const ITEM_CONSTRAINT_KEYS = ['minItems', 'maxItems'];

/**
 * Reports validation keywords that differ. Set on both sides but different:
 * warn; set on one side only: info (as for format and pattern).
 */
function diffConstraints(mt: Matcher, entity: string, propName: string, mp: IrProp, cp: IrProp, keys: readonly string[]): void {
  const loc = `${entity}.${propName}`;
  for (const key of keys) {
    const mv = mp.constraints?.get(key) ?? '';
    const cv = cp.constraints?.get(key) ?? '';
    if (mv === cv) continue;
    mt.add({
      category: 'constraint-mismatch',
      severity: mv === '' || cv === '' ? 'info' : 'warn',
      entity,
      property: propName,
      model: `${key}=${orDash(mv)}`,
      contract: `${key}=${orDash(cv)}`,
      changeNeeded: `${loc} has ${key} ${orDash(mv)} in the model and ${orDash(cv)} in the contract; align the constraint.`,
    });
  }
}

/** Compares the types of a property present on both sides. */
function diffPropType(mt: Matcher, entity: string, propName: string, mp: IrProp, cp: IrProp): void {
  const loc = `${entity}.${propName}`;
  const typeMismatch = (changeNeeded: string): void =>
    mt.add({
      category: 'type-mismatch',
      severity: 'error',
      entity,
      property: propName,
      model: describeProp(mp),
      contract: describeProp(cp),
      changeNeeded,
    });
  const alignTypes = `${loc} is ${describeProp(mp)} in the model but ${describeProp(cp)} in the contract; align the types.`;

  if (mp.ref !== '' && cp.ref !== '') {
    if (!mt.refsCorrespond(mp.ref, cp.ref)) {
      mt.add({
        category: 'type-mismatch',
        severity: 'error',
        entity,
        property: propName,
        model: mp.ref,
        contract: cp.ref,
        changeNeeded: `${loc} references ${quote(mp.ref)} in the model but ${quote(cp.ref)} in the contract; point both at the same schema.`,
      });
    }
    return;
  }

  if (mp.ref !== '') {
    const refSchema = mt.modelSchema(mp.ref);
    if (refSchema !== undefined && refSchema.kind === 'enum' && cp.type === 'string') {
      if (cp.enumValues.length > 0) {
        diffEnumValues(mt, entity, propName, mp.ref, refSchema.enumValues, cp.enumValues);
      } else {
        mt.add({
          category: 'enum-constraint-drift',
          severity: 'warn',
          entity,
          property: propName,
          model: mp.ref,
          contract: 'string',
          changeNeeded: `${loc} is constrained to enum ${quote(mp.ref)} in the model but is a plain string in the contract; add the enum to the contract or drop it from the model.`,
        });
      }
    } else {
      typeMismatch(alignTypes);
    }
    return;
  }

  if (cp.ref !== '') {
    const refSchema = mt.contractSchema(cp.ref);
    if (refSchema !== undefined && refSchema.kind === 'enum' && mp.type === 'string') {
      mt.add({
        category: 'enum-constraint-drift',
        severity: 'warn',
        entity,
        property: propName,
        model: 'string',
        contract: cp.ref,
        changeNeeded: `${loc} is constrained to enum ${quote(cp.ref)} in the contract but is a plain string in the model; bind the attribute to a codelist/enum in the model.`,
      });
    } else {
      typeMismatch(alignTypes);
    }
    return;
  }

  if (mp.type !== cp.type) {
    typeMismatch(`Change ${loc} from ${describeProp(mp)} (model) or ${describeProp(cp)} (contract) so both sides agree.`);
    return;
  }
  if (mp.format !== cp.format) {
    mt.add({
      category: 'format-mismatch',
      // Info when one side simply does not specify a format.
      severity: mp.format === '' || cp.format === '' ? 'info' : 'warn',
      entity,
      property: propName,
      model: orDash(mp.format),
      contract: orDash(cp.format),
      changeNeeded: `${loc} has format ${orDash(mp.format)} in the model and ${orDash(cp.format)} in the contract; align the formats.`,
    });
  }
  if (mp.pattern !== cp.pattern) {
    mt.add({
      category: 'pattern-mismatch',
      severity: mp.pattern === '' || cp.pattern === '' ? 'info' : 'warn',
      entity,
      property: propName,
      model: orDash(mp.pattern),
      contract: orDash(cp.pattern),
      changeNeeded: `${loc} has pattern ${orDash(mp.pattern)} in the model and ${orDash(cp.pattern)} in the contract; align the patterns.`,
    });
  }
  diffConstraints(mt, entity, propName, mp, cp, ELEMENT_CONSTRAINT_KEYS);
}

/** Compares a property present on both sides. */
export function diffProp(mt: Matcher, entity: string, propName: string, mp: IrProp, cp: IrProp): void {
  const loc = `${entity}.${propName}`;

  if (mp.array !== cp.array) {
    mt.add({
      category: 'type-mismatch',
      severity: 'error',
      entity,
      property: propName,
      model: describeProp(mp),
      contract: describeProp(cp),
      changeNeeded: `${loc} is ${describeProp(mp)} in the model but ${describeProp(cp)} in the contract; align the cardinality.`,
    });
    return;
  }
  // Item bounds sit on the array itself, so they compare even when the items
  // are references.
  if (mp.array) diffConstraints(mt, entity, propName, mp, cp, ITEM_CONSTRAINT_KEYS);

  diffPropType(mt, entity, propName, mp, cp);

  if (mp.required !== cp.required) {
    mt.add({
      category: 'required-mismatch',
      severity: 'warn',
      entity,
      property: propName,
      model: requiredLabel(mp.required),
      contract: requiredLabel(cp.required),
      changeNeeded: `${loc} is ${requiredLabel(mp.required)} in the model but ${requiredLabel(cp.required)} in the contract; align the required flag.`,
    });
  }

  if (mp.siviCode !== '' && cp.siviCode !== '' && mp.siviCode !== cp.siviCode) {
    mt.add({
      category: 'sivi-code-mismatch',
      severity: 'warn',
      entity,
      property: propName,
      model: mp.siviCode,
      contract: cp.siviCode,
      changeNeeded: `${loc} is bound to SIVI codelist ${mp.siviCode} in the model but ${cp.siviCode} in the contract; align the codelist binding.`,
    });
  }

  if (mt.opts.includeDescriptions) {
    const modelDescription = trimSpace(mp.description);
    const contractDescription = trimSpace(cp.description);
    if (modelDescription !== contractDescription) {
      mt.add({
        category: 'description-drift',
        severity: 'info',
        entity,
        property: propName,
        model: modelDescription,
        contract: contractDescription,
        changeNeeded: `Descriptions of ${loc} differ between model and contract.`,
      });
    }
  }
}

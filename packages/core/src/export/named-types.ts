import type { CodelistLookup } from '../catalog/types.ts';
import { hasNamedType } from '../model/constraints.ts';
import type { Attribute, Entity, Model } from '../model/types.ts';
import { sortStrings } from '../text/compare.ts';
import { trimSuffix } from '../text/strings.ts';
import { DISCRIMINATOR, subtypesOf, unscopedAttributes } from './entities.ts';
import { baseSchemaName, subtypeSchemaName, toPascalCase } from './naming.ts';

/**
 * A named type emitted for an attribute that is restricted to a set of
 * values: either an explicit subset, or every value of a codelist.
 */
export interface AllowedType {
  name: string;
  values: string[];
  /** The codelist the values come from, if any. */
  codelist: string | null;
  /** The entity whose attribute introduced the type. */
  sourceEntity: string;
}

/**
 * The exported type name for an attribute with a named type.
 *
 * An attribute bound to a whole codelist shares one name with every other
 * such attribute: the model's `codelistNames` entry, else the codelist name
 * itself. An attribute with its own subset uses `allowedName`, else a name
 * built from entity, attribute and codelist.
 */
export function allowedTypeName(entityName: string, a: Attribute, model: Model): string {
  if (a.allowedValues.length === 0 && a.siviCodelist !== null) {
    const shared = model.codelistNames.get(a.siviCodelist);
    return shared !== undefined && shared !== '' ? shared : a.siviCodelist;
  }
  if (a.allowedName !== '') return a.allowedName;
  return entityName + toPascalCase(a.name) + (a.siviCodelist ?? '');
}

/**
 * The display name of the codelist or enum bound to an attribute, or an
 * empty string when there is none. The discriminator never has one.
 */
export function codelistLabel(entityName: string, a: Attribute, model: Model): string {
  if (a.name === DISCRIMINATOR) return '';
  if (hasNamedType(a)) return allowedTypeName(entityName, a, model);
  const baseType = trimSuffix(a.type, '[]');
  return model.enums.has(baseType) ? baseType : '';
}

/**
 * Every named type in the model, in first-use order and without duplicates.
 * An attribute bound to a whole codelist gets all of its values, sorted.
 */
export function collectAllowedTypes(model: Model, entityOrder: readonly string[], codelists: CodelistLookup | null): AllowedType[] {
  const seen = new Set<string>();
  const result: AllowedType[] = [];
  for (const entityName of entityOrder) {
    const entity = model.entities.get(entityName) as Entity;
    const discriminated = subtypesOf(entity) !== null;
    for (const section of entity.sections) {
      for (const a of section.attributes) {
        if (!hasNamedType(a)) continue;
        if (discriminated && a.name === DISCRIMINATOR) continue;
        const name = allowedTypeName(entityName, a, model);
        if (seen.has(name)) continue;
        seen.add(name);
        let values = a.allowedValues;
        if (values.length === 0 && a.siviCodelist !== null) {
          const codes = codelists?.get(a.siviCodelist);
          if (codes !== undefined) values = sortStrings(codes.keys());
        }
        result.push({ name, values, codelist: a.siviCodelist, sourceEntity: entityName });
      }
    }
  }
  return result;
}

/**
 * The enums that emitted schemas actually reference, in name order.
 *
 * An attribute references its enum only when it has no named type of its
 * own (otherwise a dedicated type is emitted). Operation parameters count as
 * references because their types are emitted as written.
 */
export function emittedEnumNames(model: Model): string[] {
  const used = new Set<string>();
  const mark = (type: string): void => {
    const base = trimSuffix(type, '[]');
    if (model.enums.has(base)) used.add(base);
  };
  for (const entity of model.entities.values()) {
    for (const section of entity.sections) {
      for (const a of section.attributes) {
        if (!hasNamedType(a)) mark(a.type);
      }
    }
  }
  for (const operation of model.operations) {
    for (const parameter of operation.parameters) mark(parameter.type);
  }
  return sortStrings(used);
}

/**
 * Every schema or type name the exporters emit: entities, subtype schemas,
 * referenced enums and named types. Used to detect a clash with the
 * `<Entity>Base` name.
 */
export function takenExportNames(model: Model, entityOrder: readonly string[], codelists: CodelistLookup | null): Set<string> {
  const taken = new Set<string>();
  for (const entityName of entityOrder) {
    taken.add(entityName);
    const subtypes = subtypesOf(model.entities.get(entityName) as Entity);
    for (const subtype of subtypes ?? []) taken.add(subtypeSchemaName(entityName, subtype));
  }
  for (const name of emittedEnumNames(model)) taken.add(name);
  for (const type of collectAllowedTypes(model, entityOrder, codelists)) taken.add(type.name);
  return taken;
}

/**
 * Whether a discriminated entity is emitted as a shared base plus one delta
 * per subtype. Entities whose subtypes share nothing beyond the
 * discriminator, or whose base name is already taken, are emitted flat.
 */
export function useBaseExtraction(entityName: string, entity: Entity, taken: ReadonlySet<string>): boolean {
  return unscopedAttributes(entity).length > 0 && !taken.has(baseSchemaName(entityName));
}

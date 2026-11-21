import type { Attribute, Entity, Model, Operation } from '../model/types.ts';
import { sortStrings } from '../text/compare.ts';

/** Name of the attribute that discriminates the subtypes of an entity. */
export const DISCRIMINATOR = 'entityType';

/**
 * The order in which entities are emitted by every exporter.
 *
 * The tree under `primaryRoot` comes first (depth first, following
 * `children`); the remaining entities follow in name order, each again
 * followed by its not-yet-emitted children. With no primary root the whole
 * model is emitted that second way.
 */
export function buildEntityOrder(model: Model, primaryRoot: string): string[] {
  const visited = new Set<string>();
  const order: string[] = [];
  const walk = (name: string): void => {
    if (visited.has(name)) return;
    const entity = model.entities.get(name);
    if (entity === undefined) return;
    visited.add(name);
    order.push(name);
    for (const child of entity.children) walk(child.name);
  };
  if (primaryRoot !== '') walk(primaryRoot);
  for (const name of sortStrings(model.entities.keys())) walk(name);
  return order;
}

function* attributesOf(entity: Entity): Iterable<Attribute> {
  for (const section of entity.sections) yield* section.attributes;
}

/** Every attribute of an entity, in section order. */
export function allAttributes(entity: Entity): Attribute[] {
  return [...attributesOf(entity)];
}

/**
 * The subtypes of a discriminated entity, or `null` for a plain entity.
 *
 * An entity is discriminated when it has an `entityType` attribute with
 * allowed values; those values are the subtypes, and the entity is exported
 * as a union of one schema per subtype.
 */
export function subtypesOf(entity: Entity): string[] | null {
  for (const a of attributesOf(entity)) {
    if (a.name === DISCRIMINATOR && a.allowedValues.length > 0) return a.allowedValues;
  }
  return null;
}

/**
 * The attributes of one subtype: the discriminator, the attributes shared by
 * all subtypes, and the ones scoped to this subtype, in section order.
 */
export function attributesForSubtype(entity: Entity, subtype: string): Attribute[] {
  return allAttributes(entity).filter(
    (a) => a.name === DISCRIMINATOR || a.applicableSubtypes.length === 0 || a.applicableSubtypes.includes(subtype),
  );
}

/** The attributes shared by every subtype, without the discriminator. */
export function unscopedAttributes(entity: Entity): Attribute[] {
  return allAttributes(entity).filter((a) => a.name !== DISCRIMINATOR && a.applicableSubtypes.length === 0);
}

/** The attributes that belong to `subtype` only (or to a set of subtypes including it). */
export function scopedAttributesForSubtype(entity: Entity, subtype: string): Attribute[] {
  return allAttributes(entity).filter(
    (a) => a.name !== DISCRIMINATOR && a.applicableSubtypes.length > 0 && a.applicableSubtypes.includes(subtype),
  );
}

/** Response status codes of an operation in ascending text order. */
export function sortedResponseCodes(operation: Operation): string[] {
  return sortStrings(operation.responses.keys());
}

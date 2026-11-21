import {
  CONSTRAINT_KEYS,
  DISCRIMINATOR,
  allowedTypeName,
  attributeDescription,
  attributesForSubtype,
  baseSchemaDescription,
  baseSchemaName,
  constraintMap,
  hasNamedType,
  scopedAttributesForSubtype,
  subtypeDescription,
  subtypeSchemaName,
  subtypesOf,
  takenExportNames,
  toLower,
  trimSuffix,
  unscopedAttributes,
  useBaseExtraction,
  type Attribute,
  type Entity,
} from '@minerva/core';
import type { ExportContext } from '../context.ts';

/** The TypeScript type of a model type: primitives mapped, entity and enum names kept. */
export function tsType(type: string): string {
  if (type.endsWith('[]')) return tsType(trimSuffix(type, '[]')) + '[]';
  switch (toLower(type)) {
    case 'string':
    case 'date':
      return 'string';
    case 'boolean':
      return 'boolean';
    case 'number':
    case 'integer':
    case 'int':
      return 'number';
  }
  return type;
}

/**
 * The JSDoc of a field: description, example, pattern and the validation
 * constraints, which have no TypeScript syntax and are documented as tags
 * named after their OpenAPI keywords. Nothing when there is nothing to say.
 */
function fieldDoc(ctx: ExportContext, entityName: string, a: Attribute): string {
  const description = attributeDescription(entityName, a, ctx.lookups.attributeDescriptions, ctx.model);
  const constraints = constraintMap(a);
  let doc = '';
  if (description !== '') doc += ` ${description}`;
  if (a.example !== '') doc += ` @example ${a.example}`;
  if (a.pattern !== '') doc += ` @pattern ${a.pattern}`;
  for (const key of CONSTRAINT_KEYS) {
    const value = constraints.get(key);
    if (value !== undefined) doc += ` @${key} ${value}`;
  }
  return doc === '' ? '' : `  /**${doc} */\n`;
}

/** One interface field, with its JSDoc and a trailing SIVI reference comment. */
function field(ctx: ExportContext, entityName: string, a: Attribute): string {
  let type = tsType(a.type);
  if (hasNamedType(a)) {
    const named = allowedTypeName(entityName, a, ctx.model);
    type = a.type.endsWith('[]') ? named + '[]' : named;
  }
  const optional = a.required ? '' : '?';
  const comment = a.siviReference !== null ? ` // SIVI: ${a.siviReference}` : '';
  return fieldDoc(ctx, entityName, a) + `  ${a.name}${optional}: ${type};${comment}\n`;
}

/** The discriminator field of one subtype, pinned to the subtype's value. */
function discriminatorField(ctx: ExportContext, entityName: string, a: Attribute, subtype: string): string {
  const description = attributeDescription(entityName, a, ctx.lookups.attributeDescriptions, ctx.model);
  const doc = description !== '' ? `  /** ${description} */\n` : '';
  return doc + `  ${DISCRIMINATOR}: '${subtype}';\n`;
}

function plainInterface(ctx: ExportContext, entityName: string, entity: Entity): string {
  let out = entity.description !== '' ? `/** ${entity.description} */\n` : '';
  out += `export interface ${entityName} {\n`;
  for (const section of entity.sections) {
    if (section.name !== null) out += `  // — ${section.name} —\n`;
    for (const a of section.attributes) out += field(ctx, entityName, a);
  }
  return out + '}\n\n';
}

/**
 * A base interface with the attributes shared by all subtypes, and one
 * interface per subtype that extends it with the discriminator pin and the
 * subtype's own attributes.
 */
function extendedSubtypes(ctx: ExportContext, entityName: string, entity: Entity, subtypes: readonly string[]): string {
  const baseName = baseSchemaName(entityName);
  let out = `/** ${baseSchemaDescription(entityName)} */\nexport interface ${baseName} {\n`;
  for (const a of unscopedAttributes(entity)) out += field(ctx, entityName, a);
  out += '}\n\n';

  for (const subtype of subtypes) {
    out += `/** ${subtypeDescription(entityName, subtype, ctx.lookups.subtypeDescriptions)} */\n`;
    out += `export interface ${subtypeSchemaName(entityName, subtype)} extends ${baseName} {\n`;
    const discriminator = attributesForSubtype(entity, subtype).find((a) => a.name === DISCRIMINATOR);
    if (discriminator !== undefined) out += discriminatorField(ctx, entityName, discriminator, subtype);
    for (const a of scopedAttributesForSubtype(entity, subtype)) out += field(ctx, entityName, a);
    out += '}\n\n';
  }
  return out;
}

/** One self-contained interface per subtype, carrying all of its attributes. */
function flatSubtypes(ctx: ExportContext, entityName: string, entity: Entity, subtypes: readonly string[]): string {
  let out = '';
  for (const subtype of subtypes) {
    out += `/** ${subtypeDescription(entityName, subtype, ctx.lookups.subtypeDescriptions)} */\n`;
    out += `export interface ${subtypeSchemaName(entityName, subtype)} {\n`;
    for (const a of attributesForSubtype(entity, subtype)) {
      out += a.name === DISCRIMINATOR ? discriminatorField(ctx, entityName, a, subtype) : field(ctx, entityName, a);
    }
    out += '}\n\n';
  }
  return out;
}

/**
 * A discriminated entity: a union type of its subtype interfaces, followed by
 * the interfaces. Shared attributes go into a base interface unless there are
 * none or its name is already taken.
 */
function discriminatedUnion(
  ctx: ExportContext,
  entityName: string,
  entity: Entity,
  subtypes: readonly string[],
  taken: ReadonlySet<string>,
): string {
  let out = entity.description !== '' ? `/** ${entity.description} */\n` : '';
  const variants = subtypes.map((subtype) => subtypeSchemaName(entityName, subtype));
  out += `export type ${entityName} = ${variants.join(' | ')};\n\n`;
  return (
    out +
    (useBaseExtraction(entityName, entity, taken)
      ? extendedSubtypes(ctx, entityName, entity, subtypes)
      : flatSubtypes(ctx, entityName, entity, subtypes))
  );
}

/** An interface (or a union of subtype interfaces) per entity, in `entityOrder`. */
export function entityDeclarations(ctx: ExportContext, entityOrder: readonly string[]): string {
  const { model } = ctx;
  const taken = takenExportNames(model, entityOrder, ctx.lookups.codelists);
  let out = '';
  for (const entityName of entityOrder) {
    const entity = model.entities.get(entityName) as Entity;
    const subtypes = subtypesOf(entity);
    out += subtypes === null ? plainInterface(ctx, entityName, entity) : discriminatedUnion(ctx, entityName, entity, subtypes, taken);
  }
  return out;
}

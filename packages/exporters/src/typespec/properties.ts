import {
  DISCRIMINATOR,
  allowedTypeName,
  attributeDescription,
  constraintScope,
  enumIdent,
  equalFold,
  hasNamedType,
  toLower,
  trimSpace,
  trimSuffix,
  type Attribute,
  type Model,
} from '@minerva/core';
import type { ExportContext } from '../context.ts';
import { attributeType, defaultLiteral, elementKey, valueDecorators } from './scalars.ts';
import { escapeText } from './text.ts';

/**
 * The `@example` decorator of an attribute with an example value, typed by
 * the attribute: enum members as `Enum.Member` (a bare string does not
 * type-check against an enum), dates through `plainDate.fromISO`, numbers
 * and booleans bare, arrays as a one-element tuple. An enum value that is not
 * a member of the enum yields no decorator.
 */
function exampleDecorator(model: Model, a: Attribute): string {
  const lower = toLower(a.type);
  const baseType = trimSuffix(a.type, '[]');
  const isArray = a.type.endsWith('[]');
  const enumeration = model.enums.get(baseType);
  if (enumeration !== undefined && !hasNamedType(a)) {
    const member = enumeration.values.find((v) => v.value === a.example);
    if (member === undefined) return '';
    const ref = `${baseType}.${enumIdent(member)}`;
    return isArray ? `  @example(#[${ref}])\n` : `  @example(${ref})\n`;
  }
  if (equalFold(a.type, 'date')) return `  @example(plainDate.fromISO("${escapeText(a.example)}"))\n`;
  if (lower === 'boolean') return `  @example(${toLower(trimSpace(a.example))})\n`;
  if (lower === 'number' || lower === 'integer' || lower === 'int') return `  @example(${trimSpace(a.example)})\n`;
  if (isArray) return `  @example(#["${escapeText(a.example)}"])\n`;
  return `  @example("${escapeText(a.example)}")\n`;
}

/**
 * One attribute as a model property, with its decorators.
 *
 * @param elementScalars Element-scalar names by {@link elementKey}; a
 * constrained primitive array is typed as an array of its scalar.
 */
export function property(ctx: ExportContext, entityName: string, a: Attribute, elementScalars: ReadonlyMap<string, string>): string {
  const { model, lookups } = ctx;
  const { type: scalarType, format } = attributeType(a);
  let out = '';

  const description = attributeDescription(entityName, a, lookups.attributeDescriptions, model);
  if (description !== '') out += `  @doc("${escapeText(description)}")\n`;
  if (a.example !== '') out += exampleDecorator(model, a);
  if (a.siviCodelist !== null) out += `  @extension("x-sivi-code", "${a.siviCodelist}")\n`;
  if (format !== '') out += `  @format("${format}")\n`;
  for (const decorator of valueDecorators(a, scalarType)) out += `  ${decorator}\n`;
  if (constraintScope(a).array) {
    if (a.minItems !== null) out += `  @minItems(${a.minItems})\n`;
    if (a.maxItems !== null) out += `  @maxItems(${a.maxItems})\n`;
  }

  let type = scalarType;
  if (hasNamedType(a)) {
    const named = allowedTypeName(entityName, a, model);
    type = a.type.endsWith('[]') ? named + '[]' : named;
  } else {
    const elementScalar = elementScalars.get(elementKey(entityName, a));
    if (elementScalar !== undefined) type = elementScalar + '[]';
  }

  const optional = a.required ? '' : '?';
  const literal = defaultLiteral(a, type);
  return out + `  ${a.name}${optional}: ${type}${literal !== '' ? ` = ${literal}` : ''};\n`;
}

/**
 * The discriminator property of one subtype model, pinned to the subtype's
 * literal value. Every variant must declare it: the union is emitted without
 * an envelope, so the discriminator is read off the variants themselves.
 */
export function discriminatorProperty(ctx: ExportContext, entityName: string, a: Attribute, subtype: string): string {
  const description = attributeDescription(entityName, a, ctx.lookups.attributeDescriptions, ctx.model);
  const doc = description !== '' ? `  @doc("${escapeText(description)}")\n` : '';
  return `${doc}  ${DISCRIMINATOR}: "${subtype}";\n`;
}

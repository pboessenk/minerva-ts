import {
  DISCRIMINATOR,
  attributesForSubtype,
  baseSchemaDescription,
  baseSchemaName,
  codeNote,
  collectAllowedTypes,
  emittedEnumNames,
  enumIdent,
  hasAnyCodeNotes,
  normalizeMarkdownBreaks,
  scopedAttributesForSubtype,
  subtypeDescription,
  subtypeSchemaName,
  subtypesOf,
  trimSuffix,
  unscopedAttributes,
  useBaseExtraction,
  type AllowedType,
  type CatalogLookups,
  type Entity,
  type Enum,
  type Model,
} from '@minerva/core';
import type { ExportContext } from '../context.ts';
import { discriminatorProperty, property } from './properties.ts';
import type { ElementScalar } from './scalars.ts';
import { docBlock, docDecorator, escapeText } from './text.ts';

const CODELIST_GROUP = '@extension("x-schema-group", "codelist")\n';

/** One `"a",\n  "b"` style member list: one member per line, comma-separated. */
function members(lines: readonly string[]): string {
  return lines.map((line, i) => `  ${line}${i === lines.length - 1 ? '' : ','}\n`).join('');
}

/** The enums referenced by emitted schemas, in name order. */
export function enumDeclarations(model: Model): string {
  let out = '';
  for (const enumName of emittedEnumNames(model)) {
    const enumeration = model.enums.get(enumName) as Enum;
    if (enumeration.description !== '') out += `@doc("${escapeText(enumeration.description)}")\n`;
    out += CODELIST_GROUP + `enum ${enumName} {\n`;
    enumeration.values.forEach((v, i) => {
      if (v.description !== '') out += `  @doc("${escapeText(v.description)}")\n`;
      out += `  ${enumIdent(v)}: "${v.value}"${i === enumeration.values.length - 1 ? '' : ','}\n`;
    });
    out += '}\n\n';
  }
  return out;
}

/**
 * The legend of a codelist-backed type: the codelist's description and a
 * Markdown table of its codes, as a `@doc` decorator (see `docDecorator` for
 * why unions get no doc comment). Empty when the codelist is not loaded.
 */
function codelistLegend(lookups: CatalogLookups, type: AllowedType): string {
  if (type.codelist === null) return '';
  const codes = lookups.codelists?.get(type.codelist);
  if (codes === undefined) return '';
  let doc = '';
  const description = lookups.codelistDescriptions?.get(type.codelist);
  if (description !== undefined) doc += `${description}\n\n`;
  const withNotes = hasAnyCodeNotes(lookups.codeNotes, type.codelist, type.values);
  doc += withNotes
    ? '| Code | Description | Notes |\n|------|-------------|-------|\n'
    : '| Code | Description |\n|------|-------------|\n';
  for (const v of type.values) {
    const text = codes.get(v) ?? '';
    doc += withNotes ? `| ${v} | ${text} | ${codeNote(lookups.codeNotes, type.codelist, v)} |\n` : `| ${v} | ${text} |\n`;
  }
  return docDecorator(trimSuffix(doc, '\n'));
}

/** Named value types (codelists and subsets of them) as unions of string literals. */
export function allowedTypeDeclarations(ctx: ExportContext, entityOrder: readonly string[]): string {
  const { model, lookups } = ctx;
  let out = '';
  for (const type of collectAllowedTypes(model, entityOrder, lookups.codelists)) {
    out += codelistLegend(lookups, type) + CODELIST_GROUP;
    if (type.codelist !== null) out += `@extension("x-sivi-code", "${type.codelist}")\n`;
    out += `union ${type.name} {\n` + members(type.values.map((v) => `"${v}"`)) + '}\n\n';
  }
  return out;
}

export function scalarDeclarations(scalars: readonly ElementScalar[]): string {
  return scalars.map((s) => s.decorators.map((d) => `${d}\n`).join('') + `scalar ${s.name} extends ${s.base};\n\n`).join('');
}

/** A plain entity: one model, with section headings as comments. */
function plainModel(ctx: ExportContext, entityName: string, entity: Entity, elementScalars: ReadonlyMap<string, string>): string {
  let out = entity.description !== '' ? docBlock(entity.description) : '';
  out += `model ${entityName} {\n`;
  for (const section of entity.sections) {
    if (section.name !== null) out += `  // — ${section.name} —\n`;
    for (const a of section.attributes) out += property(ctx, entityName, a, elementScalars);
  }
  return out + '}\n\n';
}

/**
 * A discriminated entity: a union of one model per subtype, marked
 * `@discriminated` without an envelope. That encoding (rather than
 * `@discriminator` on a base model the subtypes extend) is what lets
 * `@opExample` values carry subtype attributes: union values are checked
 * against each variant, while a base-typed value would be checked against
 * the base only. It relies on two invariants kept here: every variant
 * declares the literal discriminator property, and the variant names equal
 * the discriminator values (they become the keys of the OpenAPI mapping).
 *
 * When the subtypes share attributes beyond the discriminator, those go into
 * an `<Entity>Base` model that each variant `extends`. The union stays the
 * declared type, so examples are still checked per variant, and the OpenAPI
 * emitter turns `extends` into `allOf` plus the variant's own properties.
 */
function discriminatedUnion(
  ctx: ExportContext,
  entityName: string,
  entity: Entity,
  subtypes: readonly string[],
  taken: ReadonlySet<string>,
  elementScalars: ReadonlyMap<string, string>,
): string {
  const suffix = `Discriminated by the ${DISCRIMINATOR} property.`;
  const description = entity.description;
  let doc: string;
  if (description === '') doc = suffix;
  else if (description.includes('\n'))
    doc = `${description}\n\n${suffix}`; // a paragraph of its own
  else doc = `${description} ${suffix}`;

  let out = docDecorator(normalizeMarkdownBreaks(doc));
  out += `@discriminated(#{ envelope: "none", discriminatorPropertyName: "${DISCRIMINATOR}" })\n`;
  out += `union ${entityName} {\n` + members(subtypes.map((st) => `${st}: ${subtypeSchemaName(entityName, st)}`)) + '}\n\n';

  // Variant docs lead with the discriminator value: oneOf renderers list
  // variants anonymously ("#0, #1, ...").
  const variantDoc = (subtype: string): string =>
    `@doc("${escapeText(`EntityType: ${subtype}. ${subtypeDescription(entityName, subtype, ctx.lookups.subtypeDescriptions)}`)}")\n`;

  if (useBaseExtraction(entityName, entity, taken)) {
    const baseName = baseSchemaName(entityName);
    out += `@doc("${escapeText(baseSchemaDescription(entityName))}")\nmodel ${baseName} {\n`;
    for (const a of unscopedAttributes(entity)) out += property(ctx, entityName, a, elementScalars);
    out += '}\n\n';

    // Each variant declares the discriminator and its own attributes; the
    // shared ones are inherited.
    for (const subtype of subtypes) {
      out += variantDoc(subtype) + `model ${subtypeSchemaName(entityName, subtype)} extends ${baseName} {\n`;
      const discriminator = attributesForSubtype(entity, subtype).find((a) => a.name === DISCRIMINATOR);
      if (discriminator !== undefined) out += discriminatorProperty(ctx, entityName, discriminator, subtype);
      for (const a of scopedAttributesForSubtype(entity, subtype)) out += property(ctx, entityName, a, elementScalars);
      out += '}\n\n';
    }
    return out;
  }

  // Nothing shared beyond the discriminator, or the base name is taken:
  // each variant carries all of its attributes.
  for (const subtype of subtypes) {
    out += variantDoc(subtype) + `model ${subtypeSchemaName(entityName, subtype)} {\n`;
    for (const a of attributesForSubtype(entity, subtype)) {
      out += a.name === DISCRIMINATOR ? discriminatorProperty(ctx, entityName, a, subtype) : property(ctx, entityName, a, elementScalars);
    }
    out += '}\n\n';
  }
  return out;
}

/** Every entity, in entity order. */
export function entityDeclarations(
  ctx: ExportContext,
  entityOrder: readonly string[],
  taken: ReadonlySet<string>,
  elementScalars: ReadonlyMap<string, string>,
): string {
  let out = '';
  for (const entityName of entityOrder) {
    const entity = ctx.model.entities.get(entityName) as Entity;
    const subtypes = subtypesOf(entity);
    out +=
      subtypes === null
        ? plainModel(ctx, entityName, entity, elementScalars)
        : discriminatedUnion(ctx, entityName, entity, subtypes, taken, elementScalars);
  }
  return out;
}

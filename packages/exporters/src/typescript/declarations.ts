import {
  codeNote,
  collectAllowedTypes,
  emittedEnumNames,
  enumIdent,
  hasAnyCodeNotes,
  type AllowedType,
  type Enum,
  type Model,
} from '@minerva/core';
import type { ExportContext } from '../context.ts';

/** The enums that emitted types reference, in name order. */
export function enumDeclarations(model: Model): string {
  let out = '';
  for (const name of emittedEnumNames(model)) {
    const enumeration = model.enums.get(name) as Enum;
    if (enumeration.description !== '') out += `/** ${enumeration.description} */\n`;
    out += `export enum ${name} {\n`;
    for (const v of enumeration.values) {
      if (v.description !== '') out += `  /** ${v.description} */\n`;
      out += `  ${enumIdent(v)} = '${v.value}',\n`;
    }
    out += '}\n\n';
  }
  return out;
}

/** A string-literal union: `'a' | 'b' | 'c'`. */
function literalUnion(values: readonly string[]): string {
  return values.map((v) => `'${v}'`).join(' | ');
}

/**
 * A JSDoc block with a Markdown table of the codes and their descriptions
 * (and notes, when any code has one), led by the codelist's description.
 * Nothing when the codelist is unknown to the catalogue.
 */
function codelistLegend(ctx: ExportContext, type: AllowedType): string {
  const { lookups } = ctx;
  if (type.codelist === null) return '';
  const codes = lookups.codelists?.get(type.codelist);
  if (codes === undefined) return '';
  const codelist = type.codelist;

  let out = '/**\n';
  const description = lookups.codelistDescriptions?.get(codelist);
  if (description !== undefined) out += ` * ${description}\n *\n`;
  const withNotes = hasAnyCodeNotes(lookups.codeNotes, codelist, type.values);
  out += withNotes
    ? ' * | Code | Description | Notes |\n * |------|-------------|-------|\n'
    : ' * | Code | Description |\n * |------|-------------|\n';
  for (const v of type.values) {
    const text = codes.get(v) ?? '';
    out += withNotes ? ` * | ${v} | ${text} | ${codeNote(lookups.codeNotes, codelist, v)} |\n` : ` * | ${v} | ${text} |\n`;
  }
  return out + ' */\n';
}

/** Named value types (codelists and subsets of them) as string-literal unions. */
export function namedTypeDeclarations(ctx: ExportContext, entityOrder: readonly string[]): string {
  let out = '';
  for (const type of collectAllowedTypes(ctx.model, entityOrder, ctx.lookups.codelists)) {
    out += codelistLegend(ctx, type);
    out += `export type ${type.name} = ${literalUnion(type.values)};\n\n`;
  }
  return out;
}

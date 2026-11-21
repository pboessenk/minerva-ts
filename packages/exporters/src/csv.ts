import {
  CSV_COLUMNS,
  DISCRIMINATOR,
  attributeBaseDescription,
  buildEntityOrder,
  codeNote,
  collectAllowedTypes,
  constraintSummary,
  csvRecord,
  enumIdent,
  sortedKeys,
  subtypeDescription,
  subtypesOf,
  type Entity,
  type Enum,
} from '@minerva/core';
import type { ExportContext, ExportResult } from './context.ts';

export interface CsvOptions {
  /** Put an empty row between entities (and between enums). */
  entityGap: boolean;
  /** Append the model's enums. */
  includeEnums: boolean;
  /** Append named value types (codelist subsets) and discriminator value lists. */
  includeTechEnums: boolean;
}

/** A full-width row holding `cells` at the given column indexes. */
function row(cells: Readonly<Record<number, string>>): string[] {
  const out = new Array<string>(CSV_COLUMNS).fill('');
  for (const [index, value] of Object.entries(cells)) out[Number(index)] = value;
  return out;
}

const BLANK = row({});

/**
 * CSV export: one row per attribute, mirroring the editor's columns, for
 * review in a spreadsheet. Starts with a byte order mark so Excel reads it
 * as UTF-8.
 */
export function exportCsv(ctx: ExportContext, options: CsvOptions): ExportResult {
  const { model, lookups, settings } = ctx;
  const rows: string[][] = [[...settings.csvHeaders]];
  const entityOrder = buildEntityOrder(model, settings.primaryRoot);

  entityOrder.forEach((entityName, i) => {
    const entity = model.entities.get(entityName) as Entity;
    if (options.entityGap && i > 0) rows.push(BLANK);
    const discriminated = subtypesOf(entity) !== null;

    for (const section of entity.sections) {
      if (section.name !== null) rows.push(row({ 0: entityName, 1: `[${section.name}]` }));
      for (const a of section.attributes) {
        let subtypes = '';
        if (a.applicableSubtypes.length > 0) subtypes = a.applicableSubtypes.join(', ');
        else if (discriminated) subtypes = 'all';
        rows.push([
          entityName,
          a.name,
          a.type,
          a.format,
          constraintSummary(a),
          a.required ? 'Yes' : '',
          a.siviReference ?? '',
          a.siviCodelist ?? '',
          a.allowedName,
          subtypes,
          // Without the "Codelist:" lead; the codelist has its own columns here.
          attributeBaseDescription(a, lookups.attributeDescriptions),
          a.example,
          a.notes,
        ]);
      }
    }
  });

  if (options.includeEnums && model.enums.size > 0) {
    rows.push(BLANK, row({ 0: '== ENUMS ==================' }));
    sortedKeys(model.enums).forEach((enumName, i) => {
      const enumeration = model.enums.get(enumName) as Enum;
      if (options.entityGap && i > 0) rows.push(BLANK);
      rows.push(row({ 0: enumName, 9: 'Enum', 10: enumeration.description }));
      for (const value of enumeration.values) {
        const ident = enumIdent(value);
        rows.push(
          row({
            0: enumName,
            1: ident,
            2: value.value,
            9: 'Enum Value',
            10: value.description,
            11: value.label !== '' ? value.label : ident,
          }),
        );
      }
    });
  }

  if (options.includeTechEnums) {
    const allowedTypes = collectAllowedTypes(model, entityOrder, lookups.codelists);
    if (allowedTypes.length > 0) {
      rows.push(BLANK, row({ 0: '== TECHNICAL ENUMS ========' }));
      allowedTypes.forEach((type, i) => {
        if (options.entityGap && i > 0) rows.push(BLANK);
        let source: string;
        if (type.codelist !== null) {
          source = `codelist ${type.codelist}`;
          const description = lookups.codelistDescriptions?.get(type.codelist);
          if (description !== undefined) source += ` — ${description}`;
        } else {
          source = `EntityType ${type.sourceEntity}`;
        }
        rows.push(row({ 0: type.name, 9: source }));

        const descriptions = type.codelist !== null ? lookups.codelists?.get(type.codelist) : undefined;
        for (const value of type.values) {
          rows.push(
            row({
              0: type.name,
              1: value,
              2: descriptions?.get(value) ?? '',
              3: type.codelist !== null ? codeNote(lookups.codeNotes, type.codelist, value) : '',
            }),
          );
        }
      });
    }

    // Discriminator values per discriminated entity.
    const selections: { name: string; typeName: string; values: string[] }[] = [];
    for (const entityName of entityOrder) {
      const entity = model.entities.get(entityName) as Entity;
      const subtypes = subtypesOf(entity);
      if (subtypes === null) continue;
      let typeName = '';
      for (const section of entity.sections) {
        const discriminator = section.attributes.find((a) => a.name === DISCRIMINATOR);
        if (discriminator !== undefined) typeName = discriminator.allowedName;
      }
      selections.push({ name: entityName, typeName, values: subtypes });
    }
    if (selections.length > 0) {
      rows.push(BLANK, row({ 0: '== ENTITY TYPE SELECTION ==' }));
      selections.forEach((selection, i) => {
        if (options.entityGap && i > 0) rows.push(BLANK);
        const source = 'entityType discriminator' + (selection.typeName !== '' ? ` — ${selection.typeName}` : '');
        rows.push(row({ 0: selection.name, 9: source }));
        for (const value of selection.values) {
          rows.push(row({ 0: selection.name, 1: value, 2: subtypeDescription(selection.name, value, lookups.subtypeDescriptions) }));
        }
      });
    }
  }

  return {
    body: '\u{feff}' + rows.map(csvRecord).join(''),
    contentType: 'text/csv; charset=utf-8',
    filename: settings.filenames.csv,
  };
}

import type { Model } from '../model/types.ts';
import type { Manifest } from '../workspace/manifest.ts';
import { toPascalCase } from './naming.ts';

/** Number of columns in the CSV export. */
export const CSV_COLUMNS = 13;

export const DEFAULT_CSV_HEADERS: readonly string[] = [
  'Entity',
  'Name',
  'Type',
  'Format',
  'Constraints',
  'Required',
  'SIVI',
  'Codelist',
  'Technical name',
  'Subtypes',
  'Description',
  'Example',
  'Notes',
];

/** Title used in exports of a model that has none. */
export const UNTITLED = 'API Model';

/**
 * Everything about an export that is not in the entities themselves,
 * resolved from the model, the workspace manifest and built-in defaults (in
 * that order of precedence, per value).
 */
export interface ExportSettings {
  /** TypeSpec namespace. */
  namespace: string;
  /** Entity whose tree is emitted first; empty for name order throughout. */
  primaryRoot: string;
  csvHeaders: readonly string[];
  filenames: {
    csv: string;
    typescript: string;
    openapi: string;
    typespec: string;
  };
}

/** A TypeSpec identifier derived from a title: `Orders API` -> `OrdersApi`. */
function namespaceFromTitle(title: string): string {
  const identifier = toPascalCase(title.replace(/[^A-Za-z0-9 _-]/g, ''));
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier) ? identifier : 'Api';
}

/**
 * @param modelFile File name of the model, e.g. `orders_model.json`; download
 * names default to it with the extension replaced.
 */
export function resolveExportSettings(model: Model, manifest: Manifest, modelFile: string): ExportSettings {
  const stem = modelFile.replace(/\.json$/i, '');
  const headers = manifest.exports.csv.headers;
  const names = manifest.exports.filenames;
  return {
    namespace: model.export.namespace !== '' ? model.export.namespace : namespaceFromTitle(model.title),
    primaryRoot: model.export.primaryRoot,
    csvHeaders: headers.length === CSV_COLUMNS ? headers : DEFAULT_CSV_HEADERS,
    filenames: {
      csv: names.csv !== '' ? names.csv : `${stem}.csv`,
      typescript: names.typescript !== '' ? names.typescript : `${stem}.ts`,
      openapi: names.openapi !== '' ? names.openapi : `${stem}.openapi.yaml`,
      typespec: names.typespec !== '' ? names.typespec : `${stem}.tsp`,
    },
  };
}

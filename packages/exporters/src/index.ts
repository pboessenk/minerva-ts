/**
 * @minerva/exporters: one module per export format.
 *
 * Each exporter is a pure function from an {@link ExportContext} to a
 * document. Adding a format means adding a module here and an entry to
 * {@link EXPORTERS}; nothing else needs to know about it.
 */
import type { ExportContext, ExportResult } from './context.ts';
import { exportCsv } from './csv.ts';
import { exportHtml } from './html.ts';
import { exportOpenApi } from './openapi.ts';
import { exportTypeScript } from './typescript.ts';
import { exportTypeSpec } from './typespec.ts';

export { NotImplementedError, type ExportContext, type ExportResult } from './context.ts';
export { exportCsv, type CsvOptions } from './csv.ts';
export { exportHtml, type HtmlOptions } from './html.ts';
export { exportOpenApi } from './openapi.ts';
export { exportTypeScript } from './typescript.ts';
export { exportTypeSpec } from './typespec.ts';

/** Reads a named option of an export request (a query parameter), or `null`. */
export type FlagReader = (name: string) => string | null;

export interface Exporter {
  /** Runs the export. `flag` gives access to format-specific request options. */
  run(ctx: ExportContext, flag: FlagReader): ExportResult;
}

/** Formats in the order they are listed to users. */
export const FORMATS = ['csv', 'typescript', 'openapi', 'typespec', 'html'] as const;
export type Format = (typeof FORMATS)[number];

export const EXPORTERS: Record<Format, Exporter> = {
  csv: {
    run: (ctx, flag) =>
      exportCsv(ctx, {
        entityGap: flag('entityGap') === '1',
        includeEnums: flag('includeEnums') === '1',
        includeTechEnums: flag('includeTechEnums') === '1',
      }),
  },
  typescript: { run: (ctx) => exportTypeScript(ctx) },
  openapi: { run: (ctx) => exportOpenApi(ctx) },
  typespec: { run: (ctx) => exportTypeSpec(ctx) },
  // Internal documentation is included unless explicitly switched off.
  html: { run: (ctx, flag) => exportHtml(ctx, { includeInternalDocs: flag('includeInternalDocs') !== '0' }) },
};

export function isFormat(value: string): value is Format {
  return (FORMATS as readonly string[]).includes(value);
}

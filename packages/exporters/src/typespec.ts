import { buildEntityOrder, takenExportNames } from '@minerva/core';
import type { ExportContext, ExportResult } from './context.ts';
import { allowedTypeDeclarations, entityDeclarations, enumDeclarations, scalarDeclarations } from './typespec/declarations.ts';
import { operations, service } from './typespec/operations.ts';
import { collectElementScalars } from './typespec/scalars.ts';
import { escapeText } from './typespec/text.ts';
import { ExampleFormatter } from './typespec/values.ts';

const IMPORTS = 'import "@typespec/http";\nimport "@typespec/openapi";\nusing TypeSpec.Http;\nusing TypeSpec.OpenAPI;\n\n';

/**
 * TypeSpec export (for `@typespec/compiler` 1.13 or later).
 *
 * The document holds, in this order: servers and authentication, the
 * service with its operations (each preceded by wrapper models for its
 * responses), then the enums, named value types, element scalars and
 * entity models. A model without operations has no service and no
 * namespace.
 */
export function exportTypeSpec(ctx: ExportContext): ExportResult {
  const { model, lookups, settings } = ctx;

  let out = IMPORTS;
  for (const server of model.servers) {
    const description = server.description !== '' ? server.description : server.url;
    out += `@server("${escapeText(server.url)}", "${escapeText(description)}")\n`;
  }
  if (model.security !== null && model.security.enabled) out += '@useAuth(BearerAuth)\n';
  if (model.operations.length > 0) {
    out += service(model, settings.namespace) + operations(model, new ExampleFormatter(model));
  }

  const entityOrder = buildEntityOrder(model, settings.primaryRoot);
  const taken = takenExportNames(model, entityOrder, lookups.codelists);
  const scalars = collectElementScalars(model, entityOrder, taken);
  out += enumDeclarations(model);
  out += allowedTypeDeclarations(ctx, entityOrder);
  out += scalarDeclarations(scalars.declarations);
  out += entityDeclarations(ctx, entityOrder, taken, scalars.byAttribute);

  return { body: out, contentType: 'text/plain; charset=utf-8', filename: settings.filenames.typespec };
}

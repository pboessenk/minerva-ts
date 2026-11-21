import { buildEntityOrder } from '@minerva/core';
import type { ExportContext, ExportResult } from './context.ts';
import { enumDeclarations, namedTypeDeclarations } from './typescript/declarations.ts';
import { exampleDeclarations } from './typescript/examples.ts';
import { entityDeclarations } from './typescript/interfaces.ts';
import { header, operationSignatures, servers } from './typescript/operations.ts';

/**
 * TypeScript export: interfaces, unions and operation signatures.
 *
 * Sections in order: header, servers, operation signatures, enums, named
 * value types, entity interfaces, typed example constants.
 */
export function exportTypeScript(ctx: ExportContext): ExportResult {
  const { model, settings } = ctx;
  const entityOrder = buildEntityOrder(model, settings.primaryRoot);
  const body =
    header(model) +
    servers(model) +
    operationSignatures(model) +
    enumDeclarations(model) +
    namedTypeDeclarations(ctx, entityOrder) +
    entityDeclarations(ctx, entityOrder) +
    exampleDeclarations(model);
  return { body, contentType: 'text/plain; charset=utf-8', filename: settings.filenames.typescript };
}

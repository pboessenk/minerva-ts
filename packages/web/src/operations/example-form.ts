/**
 * Structured example form: a domain-model-driven form for operation-level
 * examples. Walks the entity tree of a request or response schema and renders
 * type-aware controls for every attribute.
 */
import { exposeFunctions } from '../globals.ts';
import { exportExampleJson } from './form/json-io.ts';
import { installValidation } from './form/validation.ts';

export { buildEntityForm } from './form/build.ts';
export { collectFormValues } from './form/collect.ts';
export { reconcileExampleData } from './form/reconcile.ts';
export { formTypeInfo } from './form/type-info.ts';
export { initFormValidation } from './form/validation.ts';
export { exportExampleJson, prepareExampleImport, prepareResponseImport, stripTypeMap } from './form/json-io.ts';
export type { ImportResult } from './form/json-io.ts';

export function install(): void {
  installValidation();
  // These serve inline handlers in the markup (onclick="name(...)" and the like).
  exposeFunctions({
    exportExampleJson,
  });
}

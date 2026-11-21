/**
 * Typed access to the shared runtime model. The editor state and the
 * codelist loader keep it with their own (wider) types; the operation and
 * example modules read it through these accessors with the narrower shapes of ./types.ts.
 */
import { codelistMap, entityTypeData } from '../base/model-loader.ts';
import type { ApiEntity, ApiEnum, ApiExample, ApiOp, CodelistEntry, EntityTypeEntry } from './types.ts';
import { state } from '../editor/state.ts';

export function getEntities(): Record<string, ApiEntity> | null {
  return state.apiModel as unknown as Record<string, ApiEntity> | null;
}

export function getEnums(): Record<string, ApiEnum> | null {
  return state.apiEnums as unknown as Record<string, ApiEnum> | null;
}

export function getOps(): ApiOp[] | null {
  return state.apiOps as unknown as ApiOp[] | null;
}

export function setOps(ops: ApiOp[] | null): void {
  state.apiOps = ops as unknown as typeof state.apiOps;
}

export function getExamples(): ApiExample[] | null {
  return state.apiExamples as unknown as ApiExample[] | null;
}

export function setExamples(examples: ApiExample[] | null): void {
  state.apiExamples = examples as unknown as typeof state.apiExamples;
}

export function getCodelistMap(): Record<string, CodelistEntry> {
  return codelistMap as unknown as Record<string, CodelistEntry>;
}

export function getEntityTypeData(): Record<string, EntityTypeEntry> | null {
  return entityTypeData as unknown as Record<string, EntityTypeEntry> | null;
}

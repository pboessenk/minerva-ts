/**
 * Typed access to the shared runtime model (`editor/model-types.ts`) and to
 * the catalogue data the codelist loader keeps, with the shapes of ./types.ts.
 */
import { codelistMap, entityTypeData } from '../base/model-loader.ts';
import type { CodelistEntry, EntityTypeEntry } from './types.ts';
import type { ApiEntity, ApiEnum, ApiExample, ApiOperation } from '../editor/model-types.ts';
import { state } from '../editor/state.ts';

export function getEntities(): Record<string, ApiEntity> | null {
  return state.apiModel;
}

export function getEnums(): Record<string, ApiEnum> | null {
  return state.apiEnums;
}

export function getOps(): ApiOperation[] | null {
  return state.apiOps;
}

export function setOps(ops: ApiOperation[] | null): void {
  state.apiOps = ops;
}

export function getExamples(): ApiExample[] | null {
  return state.apiExamples;
}

export function setExamples(examples: ApiExample[] | null): void {
  state.apiExamples = examples;
}

export function getCodelistMap(): Record<string, CodelistEntry> {
  return codelistMap as unknown as Record<string, CodelistEntry>;
}

export function getEntityTypeData(): Record<string, EntityTypeEntry> | null {
  return entityTypeData as unknown as Record<string, EntityTypeEntry> | null;
}

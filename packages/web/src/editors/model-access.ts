/**
 * Typed access to the shared runtime model and reference data, in the
 * narrower shapes the editors need.
 */
import type { RawModel } from '@minerva/core';
import { datacatEntities } from '../base/datacat.ts';
import { codelistData, codelistMap, entityTypeData } from '../base/model-loader.ts';
import { getModel } from '../base/model-state.ts';

interface DatacatAttr {
  name: string;
  desc?: string;
  datatype?: string;
  codelist?: string;
}

interface DatacatEntityType {
  name: string;
  desc?: string;
  attrs?: DatacatAttr[];
}

export interface DatacatEntity {
  desc?: string;
  entityTypes?: DatacatEntityType[];
}

export interface CodelistCode {
  CodeValue?: string;
  Value?: string;
  Description?: string;
}

export interface Codelist {
  Name: string;
  Description?: string;
  Code?: CodelistCode[];
}

export interface EntityTypeEntry {
  subtypes?: { name?: string; description?: string }[];
}

/** The raw JSON model that is saved. */
export function getRawModel(): RawModel | null {
  return getModel() as unknown as RawModel | null;
}

export function datacat(): Record<string, DatacatEntity> | null {
  return datacatEntities as Record<string, DatacatEntity> | null;
}

export function codelistList(): Codelist[] | null {
  return codelistData as Codelist[] | null;
}

export function codelistByName(): Record<string, Codelist> {
  return codelistMap as Record<string, Codelist>;
}

export function entityTypes(): Record<string, EntityTypeEntry> | null {
  return entityTypeData as Record<string, EntityTypeEntry> | null;
}

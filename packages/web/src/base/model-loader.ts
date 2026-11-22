/**
 * SIVI reference data loaders: shared state and loaders for the codelists and
 * entity types. Used by the codelist viewer and by any API module that needs
 * codelist tooltips or entity type navigation.
 */
import { exposeState } from '../globals.ts';

export interface CodelistCode {
  CodeValue: string;
  Description: string;
}

export interface Codelist {
  Name: string;
  Description: string;
  Code?: CodelistCode[];
}

export interface EntityTypeAttr {
  name: string;
  codelist: string;
  datatype: string;
}

export interface EntitySubtype {
  name: string;
  description: string;
  attrCount: number;
  codelistAttrs?: EntityTypeAttr[];
}

export interface EntityTypeEntry {
  description: string;
  subtypes?: EntitySubtype[];
}

export type SidebarMode = 'codes' | 'entitytypes';

/** Loaded from /api/codelists. */
export let codelistData: Codelist[] | null;
/** Codelist name to codelist. */
export let codelistMap: Record<string, Codelist>;
export let clActiveCodelist: string | null;
/** Loaded from /api/entitytypes. */
export let entityTypeData: Record<string, EntityTypeEntry> | null;
export let clSidebarMode: SidebarMode;
/** Active entity type, for example 'coverage.accident'. */
export let clActiveEntityType: string | null;

export function setActiveCodelist(name: string | null): void {
  clActiveCodelist = name;
}

export function setActiveEntityType(key: string | null): void {
  clActiveEntityType = key;
}

export function setSidebarMode(mode: SidebarMode): void {
  clSidebarMode = mode;
}

export async function loadCodelistData(): Promise<void> {
  if (codelistData) return;
  try {
    const resp = await fetch('/api/codelists');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    // The server leaves out an empty description; the views expect a string.
    const json = (await resp.json()) as { Items?: (Omit<Codelist, 'Description'> & { Description?: string | null })[] };
    const items: Codelist[] = (json.Items || []).map((cl) => ({
      ...cl,
      Description: cl.Description ?? '',
      Code: cl.Code?.map((c) => ({ ...c, Description: c.Description ?? '' })),
    }));
    codelistData = items;
    codelistMap = {};
    items.forEach((cl) => {
      codelistMap[cl.Name] = cl;
    });
    console.log(`Minerva: loaded ${items.length} codelists`);
  } catch (err) {
    console.error('Failed to load codelist data:', err);
    codelistData = [];
  }
}

export async function loadEntityTypeData(): Promise<void> {
  if (entityTypeData) return;
  try {
    const resp = await fetch('/api/entitytypes');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = (await resp.json()) as Record<string, EntityTypeEntry>;
    entityTypeData = data;
    console.log(`Minerva: loaded ${Object.keys(data).length} entity types`);
  } catch (err) {
    console.error('Failed to load entity type data:', err);
    entityTypeData = {};
  }
}

export function installModelLoader(): void {
  codelistData = null;
  codelistMap = {};
  clActiveCodelist = null;
  entityTypeData = null;
  clSidebarMode = 'codes';
  clActiveEntityType = null;

  // Kept as globals: inline handlers in the markup assign them
  // (onclick="clActiveCodelist=null;loadAndShowCodelists();...").
  exposeState(
    'clActiveCodelist',
    () => clActiveCodelist,
    (v) => {
      clActiveCodelist = v;
    },
  );
  exposeState(
    'clActiveEntityType',
    () => clActiveEntityType,
    (v) => {
      clActiveEntityType = v;
    },
  );
}

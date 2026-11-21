/** The SIVI attribute catalogue (datacat), loaded once from /api/datacat. */

export interface DatacatAttr {
  name: string;
  desc: string;
  datatype: string;
  codelist: string | null;
}

export interface DatacatEntityType {
  name: string;
  desc: string;
  attrs: DatacatAttr[];
}

export interface DatacatEntity {
  desc: string;
  entityTypes: DatacatEntityType[];
}

/** What /api/datacat returns. */
interface DatacatResponse {
  Entity: {
    Name: string;
    Description: string;
    EntityType?: {
      Name: string;
      Description: string;
      Attribute?: { Name: string; Description: string; Datatype: string; Codelist?: string }[];
    }[];
  }[];
}

/** Entity name to entity. */
export let datacatEntities: Record<string, DatacatEntity> | null;

export async function loadDatacat(): Promise<void> {
  if (datacatEntities) return;
  try {
    const resp = await fetch('/api/datacat');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = (await resp.json()) as DatacatResponse;
    const entities: Record<string, DatacatEntity> = {};
    datacatEntities = entities;
    for (const e of json.Entity) {
      entities[e.Name] = {
        desc: e.Description,
        entityTypes: (e.EntityType || []).map((et) => ({
          name: et.Name,
          desc: et.Description,
          attrs: (et.Attribute || []).map((a) => ({
            name: a.Name,
            desc: a.Description,
            datatype: a.Datatype,
            codelist: a.Codelist || null,
          })),
        })),
      };
    }
    console.log(`Minerva: loaded datacat — ${Object.keys(entities).length} entities`);
  } catch (err) {
    console.error('Failed to load datacat:', err);
    datacatEntities = {};
  }
}

export function installDatacat(): void {
  datacatEntities = null;
}

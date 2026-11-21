/** Custom subtype descriptions and code notes, shared across APIs (/api/custom-descriptions). */

export interface CustomDescriptions {
  /** "entity.subtype" to description. */
  subtypes: Record<string, string>;
  /** Codelist name to code value to note. */
  codeNotes?: Record<string, Record<string, string>>;
}

export let customDescriptions: CustomDescriptions | null;

export async function ensureCustomDescriptions(): Promise<CustomDescriptions> {
  if (customDescriptions) return customDescriptions;
  const resp = await fetch('/api/custom-descriptions');
  let loaded: CustomDescriptions;
  if (resp.ok) loaded = (await resp.json()) as CustomDescriptions;
  else loaded = { subtypes: {} };
  customDescriptions = loaded;
  return loaded;
}

/** Sends the current custom descriptions to the server. */
export async function persistCustomDescriptions(): Promise<void> {
  await fetch('/api/custom-descriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(customDescriptions),
  });
}

export async function saveCustomSubtypeDesc(entityName: string, subtypeName: string, desc: string): Promise<void> {
  const current = await ensureCustomDescriptions();
  const key = entityName.toLowerCase() + '.' + subtypeName.toLowerCase();
  if (desc) current.subtypes[key] = desc;
  else delete current.subtypes[key];
  await persistCustomDescriptions();
}

export function installCustomDescriptions(): void {
  customDescriptions = null;
}

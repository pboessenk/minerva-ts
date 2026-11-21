/** The entity selected in the SIVI list and graph views. */

/** Selected entity name, or null for the overview. */
export let activeEntity: string | null;

export function setActiveEntity(name: string | null): void {
  activeEntity = name;
}

export function installSiviState(): void {
  activeEntity = null;
}

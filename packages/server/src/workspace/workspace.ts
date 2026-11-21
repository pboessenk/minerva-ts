import { type Dirent, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import {
  type Catalog,
  type CatalogEntity,
  type Codelist,
  type CustomDescriptions,
  type Manifest,
  type ManifestModel,
  compareStrings,
  decodeCatalogEntity,
  decodeCodelist,
  decodeCustomDescriptions,
  decodeManifest,
  discoverModel,
  emptyCustomDescriptions,
  emptyManifest,
} from '@minerva/core';

export const MANIFEST_FILE = 'minerva.json';
const CUSTOM_DESCRIPTIONS_FILE = 'custom_descriptions.json';

/**
 * A data directory and what was loaded from it.
 *
 * The data directory is the only place the application reads designs from.
 * Its layout:
 *
 * ```
 * <data>/
 *   minerva.json               workspace manifest (optional)
 *   <name>_model.json          one file per API model
 *   custom_descriptions.json   workspace text layered over the catalogue (optional)
 *   codelists/<NAME>.json      SIVI codelists, one per file      } fetched by the
 *   datacat/<entity>.json      SIVI data catalogue, one per file } catalogue updater
 *   version/.sivi-version      catalogue version label           }
 * ```
 *
 * The reference catalogue is read once, at start. Models are read from disk
 * on every use, so a save by another process is picked up immediately.
 */
export class Workspace {
  /** Absolute path of the data directory. */
  readonly dataDir: string;
  /** Parent of the data directory; contract paths in a model are relative to it. */
  readonly rootDir: string;
  readonly manifest: Manifest;
  readonly models: readonly ManifestModel[];
  readonly catalog: Catalog;

  constructor(dataDir: string) {
    this.dataDir = resolve(dataDir);
    this.rootDir = dirname(this.dataDir);
    this.manifest = this.#readManifest();
    this.models = this.manifest.models.length > 0 ? this.manifest.models : this.#discoverModels();
    this.catalog = {
      codelists: readJsonDirectory(join(this.dataDir, 'codelists'), decodeCodelist),
      entities: readJsonDirectory(join(this.dataDir, 'datacat'), decodeCatalogEntity),
      custom: this.#readCustomDescriptions(),
    };
  }

  /** File name of the model used when a request names none; empty when the workspace has no models. */
  get defaultModelFile(): string {
    return this.manifest.defaultModel !== '' ? this.manifest.defaultModel : (this.models[0]?.file ?? '');
  }

  modelPath(file: string): string {
    return join(this.dataDir, file);
  }

  /**
   * Turns a workspace-relative path from a model (a contract to compare
   * against) into an absolute one. Absolute paths and paths that climb out
   * of the workspace are refused: the model file is data, not code.
   */
  resolveContractPath(relative: string): string | undefined {
    if (relative === '') return undefined;
    if (isAbsolute(relative) || /^[A-Za-z]:[\\/]/.test(relative) || relative.includes('..')) return undefined;
    return join(this.rootDir, ...relative.split('/'));
  }

  saveCustomDescriptions(custom: CustomDescriptions, fileContent: string): void {
    writeFileSync(join(this.dataDir, CUSTOM_DESCRIPTIONS_FILE), fileContent);
    this.catalog.custom = custom;
  }

  #readManifest(): Manifest {
    const path = join(this.dataDir, MANIFEST_FILE);
    return existsSync(path) ? decodeManifest(readFileSync(path, 'utf8')) : emptyManifest();
  }

  #discoverModels(): ManifestModel[] {
    let names: string[];
    try {
      names = readdirSync(this.dataDir);
    } catch {
      return [];
    }
    return names
      .sort(compareStrings)
      .map(discoverModel)
      .filter((entry): entry is ManifestModel => entry !== undefined);
  }

  #readCustomDescriptions(): CustomDescriptions {
    try {
      const text = readFileSync(join(this.dataDir, CUSTOM_DESCRIPTIONS_FILE), 'utf8');
      return decodeCustomDescriptions(text) ?? emptyCustomDescriptions();
    } catch {
      return emptyCustomDescriptions();
    }
  }
}

/**
 * Decodes every `*.json` file of a directory (except `_index.json`), in
 * file-name order. Files that cannot be read or decoded are skipped.
 * Returns `null` when the directory itself cannot be read.
 */
function readJsonDirectory<T extends Codelist | CatalogEntity>(dir: string, decode: (text: string) => T | undefined): T[] | null {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const items: T[] = [];
  for (const entry of entries.sort((a, b) => compareStrings(a.name, b.name))) {
    if (entry.isDirectory() || !entry.name.endsWith('.json') || entry.name === '_index.json') continue;
    let text: string;
    try {
      text = readFileSync(join(dir, entry.name), 'utf8');
    } catch {
      continue;
    }
    const item = decode(text);
    if (item !== undefined) items.push(item);
  }
  return items;
}

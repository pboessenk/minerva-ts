import { tryParseJson } from '../json/parse.ts';
import { DecodeContext, list, string, struct } from '../json/typed.ts';

/**
 * The workspace manifest, `minerva.json` in the data directory.
 *
 * It names the models of a workspace and holds the export settings that are
 * a matter of house style rather than of any one model. Everything in it is
 * optional: without a manifest the models are discovered from the directory
 * and the built-in defaults apply.
 *
 * ```json
 * {
 *   "defaultModel": "orders_model.json",
 *   "models": [
 *     { "id": "orders", "file": "orders_model.json", "label": "Orders", "group": "Shop", "color": "#1f6feb" }
 *   ],
 *   "exports": {
 *     "csv": { "headers": ["Entity", "Name", "..."] },
 *     "filenames": { "csv": "orders.csv" }
 *   }
 * }
 * ```
 */
export interface ManifestModel {
  /** Short identifier; used in view ids and URLs. */
  id: string;
  /** File name inside the data directory. */
  file: string;
  /** Name shown in the sidebar. Empty: derived from `id`. */
  label: string;
  /** Heading the model is listed under in the sidebar. Empty: ungrouped. */
  group: string;
  /** Accent colour used until the model itself is loaded. Empty: neutral. */
  color: string;
}

export interface ManifestExports {
  csv: {
    /** Column headers of the CSV export, 13 of them. Empty: the built-in English headers. */
    headers: string[];
  };
  /** Download file names per format. Empty: derived from the model's file name. */
  filenames: {
    csv: string;
    typescript: string;
    openapi: string;
    typespec: string;
  };
}

export interface Manifest {
  /** Model used when a request names none. Empty: the first model. */
  defaultModel: string;
  /** A line of text shown in the corner of the editor. Empty: none. */
  footer: string;
  /** Empty: every `*_model.json` / `*.model.json` file in the data directory. */
  models: ManifestModel[];
  exports: ManifestExports;
}

const manifestModel = struct<ManifestModel>({ id: string, file: string, label: string, group: string, color: string });

const manifest = struct<Manifest>({
  defaultModel: string,
  footer: string,
  models: list(manifestModel),
  exports: struct<ManifestExports>({
    csv: struct<ManifestExports['csv']>({ headers: list(string) }),
    filenames: struct<ManifestExports['filenames']>({ csv: string, typescript: string, openapi: string, typespec: string }),
  }),
});

export function emptyManifest(): Manifest {
  return manifest(undefined, '', new DecodeContext(''));
}

/** The manifest could not be read. `message` says where and why. */
export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestError';
  }
}

export function decodeManifest(text: string): Manifest {
  const root = tryParseJson(text);
  if (root === undefined) throw new ManifestError('minerva.json is not valid JSON');
  const ctx = new DecodeContext(text);
  const decoded = manifest(root, '', ctx);
  if (ctx.error !== undefined) throw new ManifestError(`minerva.json: ${ctx.error}`);
  return decoded;
}

const MODEL_FILE = /^(.+?)(?:_api)?(?:_model|\.model)\.json$/;

/**
 * The manifest entry for a model file found in the data directory, or
 * `undefined` when the name does not look like a model (`*_model.json` or
 * `*.model.json`).
 */
export function discoverModel(fileName: string): ManifestModel | undefined {
  const match = MODEL_FILE.exec(fileName);
  if (match === null) return undefined;
  const id = match[1] as string;
  return { id, file: fileName, label: '', group: '', color: '' };
}

/** The sidebar label of a model: as configured, else its id with a capital. */
export function modelLabel(entry: ManifestModel): string {
  if (entry.label !== '') return entry.label;
  return entry.id.charAt(0).toUpperCase() + entry.id.slice(1);
}

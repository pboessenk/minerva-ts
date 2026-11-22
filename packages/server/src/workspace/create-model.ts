import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type JsonArray, type JsonNode, decodeManifest, discoverModel, modelLabel, quote, tryParseJson } from '@minerva/core';
import { MANIFEST_FILE } from './workspace.ts';

/** The model could not be created. `message` says why, for the user. */
export class CreateModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CreateModelError';
  }
}

export interface CreatedModel {
  /** File name inside the data directory. */
  file: string;
  /** Whether an entry was added to the workspace manifest. */
  manifestUpdated: boolean;
}

const NAME = /^[A-Za-z][A-Za-z0-9_-]*$/;

/**
 * Creates an empty model `<name>_model.json` in the data directory, creating
 * the directory when it does not exist yet. The file is written the way the
 * editor saves it, so the first save in the editor changes only what was
 * edited.
 *
 * When the workspace has a manifest that lists its models, the new model is
 * added to that list; otherwise the server finds it by its file name. The
 * entry is inserted as text, so the rest of the manifest keeps its layout.
 */
export function createModel(dataDir: string, name: string, title?: string): CreatedModel {
  if (!NAME.test(name)) {
    throw new CreateModelError(`"${name}" cannot be a model name: use letters, digits, - and _, starting with a letter`);
  }
  const file = `${name}_model.json`;
  // The server derives the model id from the file name; it must come back as the name given.
  if (discoverModel(file)?.id !== name) {
    throw new CreateModelError(`"${name}" cannot be a model name: a name ending in _api loses that suffix`);
  }
  const path = join(dataDir, file);
  if (existsSync(path)) throw new CreateModelError(`${path} already exists`);

  const manifestPath = join(dataDir, MANIFEST_FILE);
  const manifestText = existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8') : undefined;
  let updatedManifest: string | undefined;
  if (manifestText !== undefined) {
    const manifest = decodeManifest(manifestText);
    if (manifest.models.some((m) => m.id === name)) {
      throw new CreateModelError(`${MANIFEST_FILE} already lists a model with id "${name}"`);
    }
    if (manifest.models.length > 0) updatedManifest = addManifestEntry(manifestText, name, file);
  }

  const model = {
    title: title ?? modelLabel({ id: name, file, label: '', group: '', color: '' }),
    version: '0.1.0',
    lastModified: '',
    entities: {},
  };
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(path, JSON.stringify(model, null, 2), { flag: 'wx' });
  if (updatedManifest !== undefined) writeFileSync(manifestPath, updatedManifest);
  return { file, manifestUpdated: updatedManifest !== undefined };
}

/** The manifest text with `{ "id": ..., "file": ... }` appended to its (non-empty) `models` list. */
function addManifestEntry(text: string, id: string, file: string): string {
  const root = tryParseJson(text) as JsonNode;
  // decodeManifest accepted the text, so the root is an object; with duplicate keys the last one counts.
  const entries = root.kind === 'object' ? root.entries.filter((e) => e.key === 'models') : [];
  const models = entries.at(-1)?.value as JsonArray;
  const last = models.items.at(-1) as JsonNode;
  const lineStart = text.lastIndexOf('\n', last.start - 1) + 1;
  const before = text.slice(lineStart, last.start);
  // Same indentation as the last entry when it starts its own line; else on the same line.
  const separator = /^[ \t]*$/.test(before) ? `,\n${before}` : ', ';
  const entry = `{ "id": ${quote(id)}, "file": ${quote(file)} }`;
  return text.slice(0, last.end) + separator + entry + text.slice(last.end);
}

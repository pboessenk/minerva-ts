import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalogLookups, decodeModel, filterModel, resolveExportSettings } from '@minerva/core';
import { EXPORTERS, type Format } from '@minerva/exporters';
import { Workspace } from '../src/workspace/workspace.ts';

/**
 * Snapshot exports of the fixture workspace.
 *
 * `fixtures/golden/` holds every export of `fixtures/workspace/`, produced
 * with the workspace's own settings, so that no export changes unnoticed.
 * Regenerate with `pnpm golden:update` after an intended change.
 */

export const FIXTURE_DATA = fileURLToPath(new URL('../../../fixtures/workspace', import.meta.url));
export const GOLDEN_DIR = fileURLToPath(new URL('../../../fixtures/golden', import.meta.url));

/** The clock the snapshots are rendered with. */
const NOW = new Date('2030-01-02T03:04:05.000Z');

const VARIANTS: readonly { name: string; format: Format; flags: Record<string, string>; extension: string }[] = [
  { name: 'openapi', format: 'openapi', flags: {}, extension: 'yaml' },
  { name: 'typespec', format: 'typespec', flags: {}, extension: 'tsp' },
  { name: 'typescript', format: 'typescript', flags: {}, extension: 'ts' },
  { name: 'html', format: 'html', flags: {}, extension: 'html' },
  { name: 'html-public', format: 'html', flags: { includeInternalDocs: '0' }, extension: 'html' },
  { name: 'csv', format: 'csv', flags: {}, extension: 'csv' },
  { name: 'csv-all', format: 'csv', flags: { entityGap: '1', includeEnums: '1', includeTechEnums: '1' }, extension: 'csv' },
];

/** Every snapshot, keyed by its path below `fixtures/golden/`. */
export function renderGoldens(dataDir = FIXTURE_DATA): Map<string, string> {
  const workspace = new Workspace(dataDir);
  const out = new Map<string, string>();
  for (const entry of workspace.models) {
    const loaded = decodeModel(readFileSync(workspace.modelPath(entry.file), 'utf8'));
    const roots = [...loaded.entities].filter(([, entity]) => entity.root).map(([name]) => name);
    const scopes: [label: string, roots: string[]][] = [['', []], ...roots.map((root): [string, string[]] => [`@${root}`, [root]])];
    for (const [label, scope] of scopes) {
      const model = filterModel(loaded, scope);
      const ctx = {
        model,
        lookups: buildCatalogLookups(workspace.catalog, model),
        settings: resolveExportSettings(model, workspace.manifest, entry.file),
        now: NOW,
      };
      for (const variant of VARIANTS) {
        // Scoped exports only for the spec formats; the rest add nothing.
        if (label !== '' && !['openapi', 'typespec', 'typescript'].includes(variant.name)) continue;
        const result = EXPORTERS[variant.format].run(ctx, (flag) => variant.flags[flag] ?? null);
        out.set(`${entry.id}/${variant.name}${label}.${variant.extension}`, result.body);
      }
    }
  }
  return out;
}

/** The snapshots currently on disk. */
export function readGoldens(dir = GOLDEN_DIR): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const path = join(current, name);
      if (statSync(path).isDirectory()) walk(path);
      else out.set(relative(dir, path).split('\\').join('/'), readFileSync(path, 'utf8'));
    }
  };
  try {
    walk(dir);
  } catch {
    // no snapshots yet
  }
  return out;
}

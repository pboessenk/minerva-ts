import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { codelists, datacat } from '../src/routes/catalog.ts';
import { Workspace } from '../src/workspace/workspace.ts';

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'minerva-catalog-'));
});
afterEach(() => {
  // The unreadable-folder test takes away permissions rmSync needs.
  try {
    chmodSync(join(dataDir, 'codelists'), 0o755);
  } catch {}
  rmSync(dataDir, { recursive: true, force: true });
});

const get = (route: typeof codelists): { status: number; body: string } => {
  const response = route(new Workspace(dataDir), 'GET');
  return { status: response.status, body: response.body.toString('utf8') };
};

describe('the catalogue routes', () => {
  it('serve an empty catalogue when it was never fetched', () => {
    expect(get(codelists)).toEqual({ status: 200, body: '{"Items":[]}\n' });
    expect(get(datacat)).toEqual({ status: 200, body: '{"Entity":[]}\n' });
  });

  it('serve what the catalogue folders hold', () => {
    mkdirSync(join(dataDir, 'codelists'));
    writeFileSync(join(dataDir, 'codelists', 'ABC001.json'), '{"Name":"ABC001","Code":[{"CodeValue":"1","Description":"One"}]}');
    mkdirSync(join(dataDir, 'datacat'));
    expect(JSON.parse(get(codelists).body).Items.map((c: { Name: string }) => c.Name)).toEqual(['ABC001']);
    expect(get(datacat)).toEqual({ status: 200, body: '{"Entity":[]}\n' });
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('still report a catalogue folder that cannot be read', () => {
    mkdirSync(join(dataDir, 'codelists'), { mode: 0o000 });
    expect(get(codelists).status).toBe(500);
  });
});

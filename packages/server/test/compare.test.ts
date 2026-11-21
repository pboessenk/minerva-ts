import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compare } from '../src/routes/compare.ts';
import { Workspace } from '../src/workspace/workspace.ts';

const FILE = 'thing_model.json';
const NOW = new Date('2026-01-02T03:04:05.678Z');

let root: string;
let workspace: Workspace;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'minerva-compare-'));
  mkdirSync(join(root, 'data'));
  mkdirSync(join(root, 'contracts'));
  writeFileSync(join(root, 'contracts', 'thing.json'), '{"openapi":"3.1.0","info":{"title":"<c>","version":"2"},"paths":{}}');
  writeFileSync(
    join(root, 'data', FILE),
    JSON.stringify({
      title: 'm',
      version: '1',
      compareSources: [
        { id: 'ok', label: 'OK', path: 'contracts/thing.json' },
        { id: 'missing', label: '', path: 'contracts/none.json' },
        { id: 'directory', label: '', path: 'contracts' },
        { id: 'no-path', label: '', path: '' },
        { id: 'climbing', label: '', path: '../outside/swagger.json' },
        { id: 'climbing-inside', label: '', path: 'a/../../b' },
        { id: 'drive', label: '', path: 'C:\\Windows\\foo.json' },
      ],
      entities: { Thing: { sections: [{ attributes: [{ name: 'id', type: 'string' }] }] } },
    }),
  );
  workspace = new Workspace(join(root, 'data'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

async function call(query: string, body = '', method = 'POST'): Promise<{ status: number; body: string }> {
  const req = Readable.from([Buffer.from(body)]) as unknown as IncomingMessage;
  const response = await compare(workspace, method, new URLSearchParams(query), req, NOW);
  return { status: response.status, body: response.body.toString('utf8') };
}

describe('contract sources', () => {
  it('resolves a workspace-relative path', () => {
    expect(workspace.resolveContractPath('references/x/swagger.json')).toBe(join(root, 'references', 'x', 'swagger.json'));
  });

  it('refuses empty, climbing and absolute paths', () => {
    for (const bad of ['', '../outside/swagger.json', 'a/../../b', 'C:\\Windows\\foo.json', '/etc/passwd']) {
      expect(workspace.resolveContractPath(bad), bad).toBeUndefined();
    }
  });

  it('answers each refusal with its reason', async () => {
    expect(await call(`model=${FILE}&source=nope`)).toEqual({ status: 404, body: 'Unknown contract source for this model\n' });
    expect(await call(`model=${FILE}&source=no-path`)).toEqual({ status: 400, body: 'contract source has no path\n' });
    for (const id of ['climbing', 'climbing-inside', 'drive']) {
      expect(await call(`model=${FILE}&source=${id}`), id).toEqual({
        status: 400,
        body: "contract path must be relative to the project root, without '..'\n",
      });
    }
    expect(await call(`model=${FILE}&source=missing`)).toEqual({
      status: 404,
      body: `Contract file not available: open ${join(root, 'contracts', 'none.json')}: no such file or directory\n`,
    });
    expect(await call(`model=${FILE}&source=directory`)).toEqual({
      status: 404,
      body: `Contract file not available: read ${join(root, 'contracts')}: is a directory\n`,
    });
  });

  it('compares with the source file and ignores the body', async () => {
    const response = await call(`model=${FILE}&source=ok`, '{nope');
    expect(response.status).toBe(200);
    expect(response.body).toBe(
      '{"modelFile":"thing_model.json","modelTitle":"m","modelVersion":"1","contractTitle":"\\u003cc\\u003e","contractVersion":"2",' +
        '"generatedAt":"2026-01-02T03:04:05Z","stats":{"errors":0,"warnings":1,"infos":0,"modelSchemas":1,"contractSchemas":0,' +
        '"matchedSchemas":0,"modelOperations":0,"contractOperations":0,"matchedOperations":0},"findings":[{"category":"schema-missing-in-contract",' +
        '"severity":"warn","entity":"Thing","model":"object","changeNeeded":"Model defines \\"Thing\\" but the contract has no corresponding schema; ' +
        'add it to the contract or remove it from the model."}]}\n',
    );
  });
});

describe('uploaded contracts', () => {
  it('checks the method, the body and its parse errors', async () => {
    expect((await call(`model=${FILE}`, '{}', 'GET')).status).toBe(405);
    expect(await call(`model=${FILE}`)).toEqual({ status: 400, body: 'Empty OpenAPI document\n' });
    expect(await call(`model=${FILE}`, '{"openapi": 5}')).toEqual({
      status: 400,
      body: 'Invalid OpenAPI JSON: #/openapi: expected string, found number 5\n',
    });
    expect(await call(`model=${FILE}`, '{}')).toEqual({
      status: 400,
      body: 'Invalid OpenAPI JSON: document has no openapi/paths/components fields — not an OpenAPI spec\n',
    });
  });

  it('writes null for a report without findings', async () => {
    writeFileSync(join(root, 'data', 'empty_model.json'), '{}');
    const response = await call('model=empty_model.json', '{"paths":{}}');
    expect(response.body.endsWith('"findings":null}\n')).toBe(true);
  });

  it('refuses a body over 20 MiB', async () => {
    expect(await call(`model=${FILE}`, '{}'.padEnd((20 << 20) + 1))).toEqual({
      status: 400,
      body: 'Failed to read body: http: request body too large\n',
    });
  });

  it('compares descriptions only when asked', async () => {
    const contract = '{"components":{"schemas":{"Thing":{"description":"x","type":"object","properties":{"id":{"type":"string"}}}}}}';
    expect((await call(`model=${FILE}`, contract)).body).not.toContain('description-drift');
    expect((await call(`model=${FILE}&includeDescriptions=1`, contract)).body).toContain('description-drift');
  });
});

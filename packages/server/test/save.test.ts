import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { save } from '../src/routes/save.ts';
import { Workspace } from '../src/workspace/workspace.ts';

const FILE = 'thing_model.json';

let dataDir: string;
let workspace: Workspace;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'minerva-save-'));
  workspace = new Workspace(dataDir);
});
afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

function post(body: string, base = '', query = `model=${FILE}`): { status: number; body: string } {
  const response = save(workspace, 'POST', new URLSearchParams(query), base, Buffer.from(body));
  return { status: response.status, body: response.body.toString('utf8') };
}

const onDisk = (file = FILE): string => readFileSync(join(dataDir, file), 'utf8');

describe('optimistic locking', () => {
  beforeEach(() => writeFileSync(join(dataDir, FILE), '{"lastModified":"T1"}'));

  it('accepts a save based on the version on disk and writes the body as is', () => {
    expect(post('{"lastModified":"T2"}', 'T1').status).toBe(200);
    expect(onDisk()).toBe('{"lastModified":"T2"}');
  });

  it('refuses a save based on an older version and leaves the file alone', () => {
    post('{"lastModified":"T2"}', 'T1');
    const refused = post('{"lastModified":"T3"}', 'T1');
    expect(refused.status).toBe(409);
    expect(refused.body).toContain('"diskLastModified":"T2"');
    expect(onDisk()).toBe('{"lastModified":"T2"}');
  });

  it('refuses a save that names no base version when the file has one', () => {
    expect(post('{"lastModified":"T3"}').status).toBe(409);
  });

  it('accepts any save with force=1', () => {
    expect(post('{"lastModified":"T3"}', 'stale', `model=${FILE}&force=1`).status).toBe(200);
  });

  it('accepts a new file regardless of the base version', () => {
    expect(post('{"lastModified":"T1"}', 'whatever', 'model=new_model.json').status).toBe(200);
    expect(onDisk('new_model.json')).toBe('{"lastModified":"T1"}');
  });

  it('accepts any save over a file without a version', () => {
    writeFileSync(join(dataDir, FILE), '{"title":"x"}');
    expect(post('{"lastModified":"T9"}').status).toBe(200);
  });

  it('refuses file names that are paths', () => {
    for (const name of ['a/b.json', 'a\\b.json', '..x.json']) {
      expect(post('{}', '', `model=${encodeURIComponent(name)}`).status).toBe(400);
    }
  });
});

describe('constraint validation', () => {
  const model = (attributes: string): string => `{"lastModified":"T1","entities":{"Thing":{"sections":[{"attributes":[${attributes}]}]}}}`;

  const valid = model(`{"name":"code","type":"string","required":true,"minLength":4,"maxLength":7,"pattern":"^(?=.*A).+$"},
    {"name":"count","type":"integer","minimum":0,"exclusiveMaximum":100,"default":"5"},
    {"name":"ratio","type":"number","exclusiveMinimum":0,"maximum":1},
    {"name":"flag","type":"boolean","default":"TRUE"},
    {"name":"tags","type":"string[]","minLength":1,"minItems":1,"maxItems":5},
    {"name":"parts","type":"Part[]","minItems":1}`);

  it('accepts consistent constraints, including patterns only ECMAScript understands', () => {
    expect(post(valid).status).toBe(200);
    expect(onDisk()).toBe(valid);
  });

  it.each([
    ['negative length', '{"name":"x","type":"string","minLength":-1}', 'minLength must be >= 0'],
    ['min above max', '{"name":"x","type":"integer","minimum":5,"maximum":3}', 'exceeds upper bound'],
    ['both minimum forms', '{"name":"x","type":"integer","minimum":1,"exclusiveMinimum":2}', 'mutually exclusive'],
    ['empty exclusive range', '{"name":"x","type":"number","exclusiveMinimum":1,"maximum":1}', 'must be below upper bound'],
    ['length on integer', '{"name":"x","type":"integer","minLength":1}', 'only apply to plain string'],
    ['items on scalar', '{"name":"x","type":"string","minItems":1}', 'only apply to array'],
    ['length on named type', '{"name":"x","type":"string","siviCodelist":"ABC001","minLength":1}', 'only apply to plain string'],
    ['non-integer bound', '{"name":"x","type":"integer","minimum":0.5}', 'must be an integer'],
    ['default not an integer', '{"name":"x","type":"integer","default":"abc"}', 'is not an integer'],
    ['default out of range', '{"name":"x","type":"integer","maximum":3,"default":"4"}', 'is above maximum'],
    ['default on required', '{"name":"x","type":"string","required":true,"default":"a"}', 'only applies to optional'],
    ['default too short', '{"name":"x","type":"string","minLength":3,"default":"ab"}', 'shorter than minLength'],
    ['bad boolean default', '{"name":"x","type":"boolean","default":"yes"}', 'must be true or false'],
    ['string where number', '{"name":"x","type":"integer","minimum":"5"}', 'invalid model JSON'],
  ])('refuses %s', (name, attribute, message) => {
    post(valid);
    const refused = post(model(attribute), 'T1');
    expect(refused.status).toBe(400);
    expect(refused.body).toContain('"status":"invalid"');
    expect(refused.body).toContain(message);
    if (name !== 'string where number') expect(refused.body).toContain('Thing.x: ');
    expect(onDisk()).toBe(valid);
  });

  it('still applies the lock once validation passes', () => {
    post(valid);
    expect(post(valid, 'stale').status).toBe(409);
  });
});

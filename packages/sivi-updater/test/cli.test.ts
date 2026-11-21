import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { run } from '../src/cli.ts';
import type { Io } from '../src/io.ts';

let tmp: string;
let source: string;
let data: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'sivi-updater-'));
  source = join(tmp, 'source');
  data = join(tmp, 'data');
  mkdirSync(source);
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

function capture(stdin = ''): Io & { stdout: string; stderr: string } {
  let rest = stdin;
  const io = {
    stdout: '',
    stderr: '',
    out(t: string) {
      io.stdout += t;
    },
    err(t: string) {
      io.stderr += t;
    },
    async readLine() {
      const nl = rest.indexOf('\n');
      const line = nl < 0 ? rest : rest.slice(0, nl + 1);
      rest = rest.slice(line.length);
      return line;
    },
  };
  return io;
}

function writeSource(codelists: unknown[], entities: unknown[]): void {
  writeFileSync(join(source, 'codelist.json'), JSON.stringify({ Items: codelists }));
  writeFileSync(join(source, 'datacat.json'), JSON.stringify({ Entity: entities }));
}

function writeLocal(dir: string, name: string, value: unknown): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name + '.json'), JSON.stringify(value));
}

const read = (...p: string[]): string => readFileSync(join(data, ...p), 'utf8');

const remoteCodelists = [
  {
    Name: 'LIST_A',
    Description: 'Alpha <list> & more',
    Code: [
      { CodeValue: '1', Description: 'one' },
      { CodeValue: '3', Description: 'three' },
    ],
  },
  { Name: 'LIST_B', Code: [] },
  { Name: 'LIST_C' },
];
const remoteEntities = [
  {
    Name: 'widget',
    Description: 'A widget',
    EntityType: [{ Name: 'default', Attribute: [{ Name: 'size', Datatype: 'integer', Codelist: 'LIST_A', AFD1: 'x' }, { Name: 'label' }] }],
  },
  { Name: 'gadget' },
];

describe('dry run', () => {
  it('reports everything as new for a missing data directory and writes nothing', async () => {
    writeSource(remoteCodelists, remoteEntities);
    const io = capture();
    const code = await run(['--source', source, '--data', data], io);
    expect(code).toBe(0);
    expect(io.stdout).toBe(
      [
        'Fetching upstream SIVI data...',
        '  Fetched 3 codelists, 2 entities',
        '',
        '=== SIVI Update Report ===',
        '',
        'DATACAT: 2 added, 0 changed, 0 removed',
        '  + NEW entity: gadget',
        '  + NEW entity: widget',
        '',
        'CODELISTS: 3 added, 0 changed, 0 removed',
        '  + NEW codelist: LIST_A',
        '  + NEW codelist: LIST_B',
        '  + NEW codelist: LIST_C',
        '',
        '',
        'Dry-run complete. Use --apply to write changes.',
        'Use --no-desc to hide description-only changes in the overview.',
        '',
      ].join('\n'),
    );
    expect(() => readdirSync(data)).toThrow();
  });

  it('reports changes in detail', async () => {
    writeSource(
      [
        {
          Name: 'LIST_A',
          Description: 'new text',
          Code: [
            { CodeValue: '1', Description: 'uno' },
            { CodeValue: '3', Description: 'three' },
          ],
        },
      ],
      [
        {
          Name: 'widget',
          EntityType: [
            {
              Name: 'default',
              Attribute: [
                { Name: 'size', Datatype: 'decimal' },
                { Name: 'extra', Datatype: 'date' },
              ],
            },
          ],
        },
      ],
    );
    writeLocal(join(data, 'codelists'), 'LIST_A', {
      Name: 'LIST_A',
      Description: 'old text',
      Code: [
        { CodeValue: '1', Description: 'one' },
        { CodeValue: '2', Description: 'two' },
      ],
    });
    writeLocal(join(data, 'codelists'), 'LIST_Z', { Name: 'LIST_Z', Code: [] });
    writeLocal(join(data, 'datacat'), 'widget', {
      Name: 'widget',
      EntityType: [
        { Name: 'default', Attribute: [{ Name: 'size', Datatype: 'integer' }, { Name: 'gone' }] },
        { Name: 'legacy', Attribute: [{ Name: 'a' }] },
      ],
    });
    const io = capture();
    await run(['--source', source, '--data', data], io);
    expect(io.stdout).toContain(
      [
        'DATACAT: 0 added, 1 changed, 0 removed',
        '  ~ CHANGED entity: widget',
        '      - REMOVED subtype: legacy (1 attrs)',
        '      ~ subtype default: 1 added, 1 changed, 1 removed',
        '          - gone',
        '          ~ size: datatype: "integer" → "decimal"',
        '          + extra (date)',
        '',
        'CODELISTS: 0 added, 1 changed, 1 removed',
        '  ~ CHANGED LIST_A (description changed): 1 codes added, 1 codes changed, 1 codes removed',
        '      - 2 = "two"',
        '      ~ 1: "one" → "uno"',
        '      + 3 = "three"',
        '  - REMOVED codelist: LIST_Z',
      ].join('\n'),
    );
  });

  it('cuts descriptions at 60 bytes like Go', async () => {
    writeSource([], [{ Name: 'E', Description: 'x'.repeat(58) + '€' }]);
    writeLocal(join(data, 'datacat'), 'E', { Name: 'E', Description: 'old' });
    const io = capture();
    await run(['--source', source, '--data', data], io);
    expect(io.stdout).toContain(`      description: "old" → "${'x'.repeat(58)}\\xe2\\x82..."\n`);
  });

  it('hides description-only changes with --no-desc (and --ignore-desc)', async () => {
    writeSource([{ Name: 'LIST_A', Description: 'new', Code: [{ CodeValue: '1', Description: 'uno' }] }], []);
    writeLocal(join(data, 'codelists'), 'LIST_A', { Name: 'LIST_A', Description: 'old', Code: [{ CodeValue: '1', Description: 'one' }] });
    writeLocal(join(data, 'datacat'), 'keep', { Name: 'keep' });
    const all = capture();
    await run(['--source', source, '--data', data], all);
    expect(all.stdout).toContain('CHANGED LIST_A (description changed)');
    for (const flag of ['--no-desc', '--ignore-desc']) {
      const io = capture();
      await run(['--source', source, '--data', data, flag], io);
      expect(io.stdout).not.toContain('LIST_A');
      expect(io.stdout).toContain('DATACAT: 0 added, 0 changed, 1 removed');
      expect(io.stdout).not.toContain('Use --no-desc to hide');
    }
  });

  it('says so when nothing differs', async () => {
    writeSource([], []);
    const io = capture();
    expect(await run(['--source', source, '--data', data], io)).toBe(0);
    expect(io.stdout).toBe('Fetching upstream SIVI data...\n  Fetched 0 codelists, 0 entities\n\nEverything is up to date.\n');
  });
});

describe('--apply', () => {
  it('creates the catalogue in Go byte format from nothing', async () => {
    writeSource(remoteCodelists, remoteEntities);
    const io = capture();
    const code = await run(['--source', source, '--data', data, '--apply', '--version', 'v1'], io, { now: new Date(2030, 0, 2, 3, 4, 5) });
    expect(code).toBe(0);
    expect(
      io.stdout.endsWith(
        `\nApplying changes...\n  Wrote 3 codelist files to ${join(data, 'codelists')}\n  Wrote 2 entity files to ${join(data, 'datacat')}\n  Wrote version "v1" to ${join(data, 'version', '.sivi-version')}\nDone.\n`,
      ),
    ).toBe(true);

    expect(read('codelists', 'LIST_A.json')).toBe(
      '{\n  "Name": "LIST_A",\n  "Description": "Alpha \\u003clist\\u003e \\u0026 more",\n  "Code": [\n    {\n      "CodeValue": "1",\n      "Description": "one"\n    },\n    {\n      "CodeValue": "3",\n      "Description": "three"\n    }\n  ]\n}\n',
    );
    expect(read('codelists', 'LIST_B.json')).toBe('{\n  "Name": "LIST_B",\n  "Code": []\n}\n');
    expect(read('codelists', 'LIST_C.json')).toBe('{\n  "Name": "LIST_C",\n  "Code": null\n}\n');
    expect(read('codelists', '_index.json')).toBe('[\n  "LIST_A",\n  "LIST_B",\n  "LIST_C"\n]\n');
    expect(read('datacat', 'gadget.json')).toBe('{\n  "Name": "gadget"\n}\n');
    expect(read('datacat', 'widget.json')).toBe(
      [
        '{',
        '  "Name": "widget",',
        '  "Description": "A widget",',
        '  "EntityType": [',
        '    {',
        '      "Name": "default",',
        '      "Attribute": [',
        '        {',
        '          "Name": "size",',
        '          "Datatype": "integer",',
        '          "Codelist": "LIST_A",',
        '          "AFD1": "x"',
        '        },',
        '        {',
        '          "Name": "label"',
        '        }',
        '      ]',
        '    }',
        '  ]',
        '}',
        '',
      ].join('\n'),
    );
    expect(read('datacat', '_index.json')).toBe('[\n  "gadget",\n  "widget"\n]\n');
    expect(read('version', '.sivi-version')).toBe('v1\nupdated: 2030-01-02 03:04:05\n');
  });

  it('replaces stale files, keeps an existing datacat index and writes null for an empty index', async () => {
    writeSource([], [{ Name: 'one' }]);
    writeLocal(join(data, 'codelists'), 'OLD', { Name: 'OLD' });
    writeFileSync(join(data, 'codelists', 'notes.txt'), 'stale');
    writeLocal(join(data, 'datacat'), 'two', { Name: 'two' });
    writeFileSync(join(data, 'datacat', 'notes.txt'), 'kept');
    writeFileSync(join(data, 'datacat', '_index.json'), '["two"]\n');
    const io = capture();
    await run(['--source', source, '--data', data, '--apply', '--version', 'v2'], io);
    expect(readdirSync(join(data, 'codelists'))).toEqual(['_index.json']);
    expect(read('codelists', '_index.json')).toBe('null\n');
    expect(readdirSync(join(data, 'datacat')).sort()).toEqual(['_index.json', 'notes.txt', 'one.json']);
    expect(read('datacat', '_index.json')).toBe('["two"]\n');
  });

  it('asks for the version on stdin', async () => {
    writeSource(remoteCodelists, []);
    const io = capture('  1 march 2030  \nignored\n');
    expect(await run(['--source', source, '--data', data, '--apply'], io)).toBe(0);
    expect(io.stdout).toContain("Enter SIVI version (e.g. '1 maart 2026'): \nApplying changes...\n");
    expect(read('version', '.sivi-version')).toMatch(/^1 march 2030\nupdated: /);
  });

  it('aborts without a version', async () => {
    writeSource(remoteCodelists, []);
    const io = capture('\n');
    expect(await run(['--source', source, '--data', data, '--apply'], io)).toBe(1);
    expect(io.stderr).toBe('No version provided, aborting.\n');
    expect(() => readdirSync(data)).toThrow();
  });
});

describe('arguments', () => {
  it('prints help including the new flags', async () => {
    const io = capture();
    expect(await run(['--help'], io)).toBe(0);
    for (const flag of ['--data <dir>', '--source <dir>', '--version <label>', '--apply', '--no-desc', '--short']) {
      expect(io.stdout).toContain(flag);
    }
  });

  it('rejects unknown flags and missing values', async () => {
    const a = capture();
    expect(await run(['--bogus'], a)).toBe(1);
    expect(a.stderr).toBe('Unknown flag: --bogus\n');
    const b = capture();
    expect(await run(['--data'], b)).toBe(1);
    expect(b.stderr).toBe('Missing value for --data\n');
  });

  it('reports a failed fetch', async () => {
    const io = capture();
    expect(await run(['--source', join(tmp, 'nowhere'), '--data', data], io)).toBe(1);
    expect(io.stderr).toMatch(/^Error fetching codelists: /);
  });
});

describe('API impact', () => {
  const model = {
    title: 'Example API',
    entities: {
      Item: {
        sections: [
          {
            name: null,
            attributes: [
              { name: 'size', siviReference: 'widget.size' },
              { name: 'kind', siviCodelist: 'LIST_A' },
              { name: 'other', siviCodelist: 'LIST_A' },
              { name: 'unrelated', siviReference: 'nothing.here' },
            ],
          },
        ],
      },
    },
  };

  async function impact(extra: string[] = []): Promise<string> {
    writeSource(
      [
        {
          Name: 'LIST_A',
          Code: [
            { CodeValue: '1', Description: 'one' },
            { CodeValue: '2', Description: 'two' },
          ],
        },
      ],
      [{ Name: 'widget', EntityType: [{ Name: 'default', Attribute: [{ Name: 'size', Datatype: 'decimal' }] }] }],
    );
    writeLocal(join(data, 'codelists'), 'LIST_A', { Name: 'LIST_A', Code: [{ CodeValue: '1', Description: 'one' }] });
    writeLocal(join(data, 'datacat'), 'widget', {
      Name: 'widget',
      EntityType: [{ Name: 'default', Attribute: [{ Name: 'size', Datatype: 'integer' }] }],
    });
    const io = capture();
    await run(['--source', source, '--data', data, ...extra], io);
    return io.stdout;
  }

  it('finds models by file name', async () => {
    mkdirSync(data, { recursive: true });
    writeFileSync(join(data, 'example_model.json'), JSON.stringify(model));
    writeFileSync(join(data, 'broken_model.json'), '{');
    const out = await impact();
    expect(out).toContain(
      [
        '=== API Impact Report ===',
        '',
        'API: Example API (example_model.json)',
        '  Item:',
        '    .size                            ← SIVI attr widget.size: changed in subtype default (datatype: "integer" → "decimal")',
        '    .kind                            ← codelist LIST_A: 1 codes added',
        '        + 2 = "two"',
        '    .other                           ← codelist LIST_A: 1 codes added (codes listed above)',
        '',
      ].join('\n'),
    );
  });

  it('omits code details with --short', async () => {
    mkdirSync(data, { recursive: true });
    writeFileSync(join(data, 'example_model.json'), JSON.stringify(model));
    const out = await impact(['--short']);
    expect(out).not.toContain('        + 2 = "two"');
    expect(out).not.toContain('codes listed above');
  });

  it('uses the models named by minerva.json when there is one', async () => {
    mkdirSync(data, { recursive: true });
    writeFileSync(join(data, 'listed.json'), JSON.stringify({ ...model, title: 'Listed' }));
    writeFileSync(join(data, 'example_model.json'), JSON.stringify(model));
    writeFileSync(join(data, 'minerva.json'), JSON.stringify({ models: [{ id: 'listed', file: 'listed.json' }] }));
    const out = await impact();
    expect(out).toContain('API: Listed (listed.json)');
    expect(out).not.toContain('example_model.json');
  });

  it('says when the models are not affected', async () => {
    mkdirSync(data, { recursive: true });
    writeFileSync(join(data, 'example_model.json'), JSON.stringify({ title: 'T', entities: {} }));
    expect(await impact()).toContain('No API impact detected from SIVI changes.\n\n');
  });
});

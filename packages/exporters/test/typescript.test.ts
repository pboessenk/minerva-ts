import { describe, expect, it } from 'vitest';
import { UNTITLED, decodeModel, emittedEnumNames, emptyManifest, resolveExportSettings, type CatalogLookups } from '@minerva/core';
import type { ExportContext } from '../src/context.ts';
import { exportTypeScript } from '../src/typescript.ts';

const NO_LOOKUPS: CatalogLookups = {
  codelists: null,
  attributeDescriptions: null,
  subtypeDescriptions: new Map(),
  codelistDescriptions: null,
  codeNotes: new Map(),
};

function context(model: object, lookups: Partial<CatalogLookups> = {}): ExportContext {
  const decoded = decodeModel(JSON.stringify(model));
  return {
    model: decoded,
    lookups: { ...NO_LOOKUPS, ...lookups },
    settings: resolveExportSettings(decoded, emptyManifest(), 'test_model.json'),
    now: new Date(0),
  };
}

function render(model: object, lookups: Partial<CatalogLookups> = {}): string {
  return exportTypeScript(context(model, lookups)).body;
}

const count = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

/**
 * Every description case: a codelist subset with its own type name, an
 * enum-typed attribute without a description, a plain attribute, and a
 * discriminated entity with one shared attribute.
 */
const descriptionModel = {
  title: 'Description Test',
  entities: {
    Thing: {
      description: 'A thing.',
      sections: [
        {
          attributes: [
            {
              name: 'code',
              type: 'string',
              required: true,
              siviCodelist: 'CL01',
              allowedValues: ['a', 'b'],
              allowedName: 'ThingCode',
              description: 'Code of the thing.',
            },
            { name: 'status', type: 'StatusEnum' },
            { name: 'name', type: 'string', description: 'Name of the thing.' },
          ],
        },
      ],
    },
    Poly: {
      description: 'A polymorphic thing.',
      sections: [
        {
          attributes: [
            { name: 'entityType', type: 'string', required: true, allowedValues: ['one', 'two'], description: 'Discriminator.' },
            { name: 'shared', type: 'string', description: 'Shared attribute.' },
          ],
        },
      ],
    },
  },
  enums: {
    StatusEnum: {
      description: 'Status codes.',
      values: [
        { name: 'Open', value: 'open' },
        { name: 'Closed', value: 'closed' },
      ],
    },
  },
};

const discriminator = { name: 'entityType', type: 'string', required: true, allowedValues: ['one', 'two'], description: 'Discriminator.' };

describe('exportTypeScript', () => {
  it('names the download after the settings and falls back to a generic title', () => {
    const result = exportTypeScript(context({}));
    expect(result.filename).toBe('test_model.ts');
    expect(result.contentType).toBe('text/plain; charset=utf-8');
    expect(result.body).toBe(`// ${UNTITLED}\n// Version:   Last Modified: \n\n`);
  });

  describe('discriminated entities', () => {
    it('put shared attributes in a base interface that the subtypes extend', () => {
      const ts = render(descriptionModel);
      expect(ts).toContain('/** Shared attributes of all Poly subtypes. */\nexport interface PolyBase {\n');
      expect(ts).toContain('export interface PolyOne extends PolyBase {\n');
      expect(count(ts, '  shared?: string;')).toBe(1);
      // The union does not include the base.
      expect(ts).toContain('export type Poly = PolyOne | PolyTwo;');
    });

    it('stay flat when the subtypes share nothing beyond the discriminator', () => {
      const ts = render({
        title: 'Empty Base Test',
        entities: {
          Poly: {
            description: 'A polymorphic thing.',
            sections: [{ attributes: [discriminator, { name: 'onlyOne', type: 'string', applicableSubtypes: ['one'] }] }],
          },
        },
      });
      expect(ts).not.toContain('PolyBase');
      expect(ts).not.toContain('extends');
    });

    it('stay flat when the base name is taken by another entity', () => {
      const ts = render({
        title: 'Collision Test',
        entities: {
          Poly: {
            description: 'A polymorphic thing.',
            sections: [{ attributes: [discriminator, { name: 'shared', type: 'string', description: 'Shared attribute.' }] }],
          },
          PolyBase: {
            description: 'An unrelated entity that happens to have the base name.',
            sections: [{ attributes: [{ name: 'name', type: 'string' }] }],
          },
        },
      });
      expect(count(ts, 'export interface PolyBase {')).toBe(1);
      expect(ts).not.toContain('extends PolyBase');
    });
  });

  it('leads descriptions with the bound codelist, never on the discriminator', () => {
    const ts = render(descriptionModel);
    expect(ts).toContain('Codelist: ThingCode. Code of the thing.');
    expect(count(ts, 'Codelist:')).toBe(2);
  });

  it('documents validation constraints as JSDoc tags', () => {
    const ts = render({
      title: 'Constraint Test',
      entities: {
        Part: { description: 'A part.', sections: [{ attributes: [{ name: 'id', type: 'string', required: true }] }] },
        Thing: {
          description: 'A thing.',
          sections: [
            {
              attributes: [
                { name: 'code', type: 'string', required: true, minLength: 4, maxLength: 7, pattern: '^[A-Z]+$' },
                { name: 'label', type: 'string', maxLength: 80, default: 'n/a' },
                { name: 'when', type: 'string', format: 'date', minLength: 10 },
                { name: 'count', type: 'integer', required: true, minimum: 0, exclusiveMaximum: 424242 },
                { name: 'windows', type: 'integer', maximum: 99, default: '1' },
                { name: 'ratio', type: 'number', format: 'float', exclusiveMinimum: 0, maximum: 1 },
                { name: 'flag', type: 'boolean', default: 'TRUE' },
                { name: 'tags', type: 'string[]', minLength: 2, minItems: 1, maxItems: 5 },
                { name: 'counts', type: 'integer[]', minimum: 0 },
                { name: 'parts', type: 'Part[]', minItems: 1 },
                { name: 'kind', type: 'string', allowedValues: ['a', 'b'], allowedName: 'ThingKind', minLength: 1, default: 'a' },
                { name: 'fixed', type: 'string', required: true, default: 'x' },
                { name: 'since', type: 'Date', default: '2024-01-01' },
                { name: 'stale', type: 'integer', minLength: 3 },
              ],
            },
          ],
        },
      },
    });
    for (const needle of [
      '  /** @pattern ^[A-Z]+$ @minLength 4 @maxLength 7 */\n  code: string;\n',
      '  /** @maxLength 80 @default n/a */\n  label?: string;\n',
      '  /** @minimum 0 @exclusiveMaximum 424242 */\n  count: number;\n',
      '  /** @exclusiveMinimum 0 @maximum 1 */\n  ratio?: number;\n',
      '  /** @default true */\n  flag?: boolean;\n',
      '  /** @minLength 2 @minItems 1 @maxItems 5 */\n  tags?: string[];\n',
      '  /** @minItems 1 */\n  parts?: Part[];\n',
    ]) {
      expect(ts).toContain(needle);
    }
    // Named type, required default, Date default and a stale string bound.
    for (const absent of ['@default x', '@default 2024-01-01', '@default a ', '@minLength 3', '@minLength 1 ']) {
      expect(ts).not.toContain(absent);
    }
  });

  it('gives a pattern-only attribute a JSDoc block', () => {
    const ts = render({
      title: 'Pattern Test',
      entities: {
        Thing: {
          description: 'A thing.',
          sections: [{ attributes: [{ name: 'zip', type: 'string', required: true, pattern: '^\\d{4}\\s?[A-Z]{2}$' }] }],
        },
      },
    });
    expect(ts).toContain('/** @pattern ^\\d{4}\\s?[A-Z]{2}$ */');
  });

  it('declares exactly the enums that emitted types reference', () => {
    const model = {
      title: 'Enum Test',
      entities: {
        Thing: {
          sections: [
            {
              attributes: [
                { name: 'entityType', type: 'ThingKind', allowedValues: ['one', 'two'] },
                { name: 'status', type: 'Status' },
                { name: 'material', type: 'Material', allowedValues: ['wood'] },
              ],
            },
          ],
        },
      },
      enums: {
        Status: { values: [{ value: 'open' }] },
        ThingKind: { values: [{ value: 'one' }, { value: 'two' }] },
        Material: { values: [{ value: 'wood' }, { value: 'metal' }] },
        Direction: { values: [{ value: 'asc' }] },
        Unused: { values: [{ value: 'x' }] },
      },
      operations: [{ id: 'listThings', method: 'GET', path: '/things', parameters: [{ name: 'sort', in: 'query', type: 'Direction' }] }],
    };
    const ts = render(model);
    const emitted = emittedEnumNames(decodeModel(JSON.stringify(model)));
    expect(emitted).toEqual(['Direction', 'Status']);
    for (const name of Object.keys(model.enums)) {
      expect(ts.includes(`export enum ${name} {`)).toBe(emitted.includes(name));
    }
  });

  it('is deterministic and does not mention the generator', () => {
    const lookups = {
      codelists: new Map([
        [
          'CL01',
          new Map([
            ['a', 'Alpha'],
            ['b', 'Beta'],
          ]),
        ],
      ]),
    };
    const first = render(descriptionModel, lookups);
    expect(render(descriptionModel, lookups)).toBe(first);
    for (const needle of ['Minerva', 'auto-generated']) expect(first).not.toContain(needle);
  });

  it('emits a response-only example as a response constant only', () => {
    const ts = render({
      title: 'Operation Example Test',
      entities: {
        Widget: { description: 'A widget.', sections: [{ attributes: [{ name: 'name', type: 'string', required: true }] }] },
        Problem: {
          description: 'A problem details body.',
          sections: [
            {
              attributes: [
                { name: 'title', type: 'string' },
                { name: 'detail', type: 'string' },
                { name: 'causes', type: 'string[]' },
              ],
            },
          ],
        },
      },
      operations: [
        {
          id: 'createWidget',
          method: 'POST',
          path: '/widget',
          requestBody: 'Widget',
          responses: { '201': { description: 'created', schema: 'Widget' }, '403': { description: 'forbidden', schema: 'Problem' } },
        },
        {
          id: 'getWidget',
          method: 'GET',
          path: '/widget/latest',
          responses: { '200': { description: 'ok', schema: 'Widget' }, '403': { description: 'forbidden', schema: 'Problem' } },
        },
      ],
      examples: [
        {
          id: 'forbidden-example',
          operationId: 'createWidget',
          technicalName: 'forbiddenExample',
          summary: 'Forbidden',
          response: { title: 'Forbidden', detail: 'say "hi"', causes: ['a', 'b'] },
          responseCode: '403',
        },
        {
          id: 'get-forbidden',
          operationId: 'getWidget',
          technicalName: 'getForbidden',
          summary: 'Get forbidden',
          response: { title: 'Forbidden' },
          responseCode: '403',
        },
      ],
    });
    expect(ts).not.toContain('export const forbiddenExample:');
    expect(ts).toContain('export const forbiddenExampleResponse: Problem');
  });

  it('writes examples as literals typed by the model', () => {
    const ts = render({
      entities: {
        Item: {
          sections: [
            {
              attributes: [
                { name: 'status', type: 'Status' },
                { name: 'count', type: 'integer' },
                { name: 'active', type: 'boolean' },
                { name: 'tags', type: 'string[]' },
              ],
            },
          ],
        },
      },
      enums: { Status: { values: [{ value: 'open' }, { name: 'Shut', value: 'closed' }] } },
      operations: [{ id: 'addItems', method: 'POST', path: '/items', requestBody: 'Item', requestBodyArray: true }],
      examples: [
        {
          id: 'one-item',
          operationId: 'addItems',
          request: { status: 'closed', count: '3', active: 'TRUE', tags: [], _typeMap: { count: 'number' } },
        },
      ],
    });
    expect(ts).toContain(
      'export const one-item: Item[] = [\n' +
        '  {\n' +
        '    "status": Status.Shut,\n' +
        '    "count": 3,\n' +
        '    "active": true,\n' +
        '    "tags": [\n]\n' +
        '  }\n' +
        '];\n',
    );
  });

  it('documents a codelist type with a table of its codes and notes', () => {
    const ts = render(
      {
        entities: { Thing: { sections: [{ attributes: [{ name: 'colour', type: 'string', siviCodelist: 'CL02' }] }] } },
      },
      {
        codelists: new Map([
          [
            'CL02',
            new Map([
              ['1', 'Red'],
              ['2', 'Green'],
            ]),
          ],
        ]),
        codelistDescriptions: new Map([['CL02', 'Colours']]),
        codeNotes: new Map([['CL02', new Map([['2', 'Retired']])]]),
      },
    );
    expect(ts).toContain(
      '/**\n' +
        ' * Colours\n' +
        ' *\n' +
        ' * | Code | Description | Notes |\n' +
        ' * |------|-------------|-------|\n' +
        ' * | 1 | Red |  |\n' +
        ' * | 2 | Green | Retired |\n' +
        ' */\n' +
        "export type CL02 = '1' | '2';\n",
    );
    expect(ts).toContain('  colour?: CL02;\n');
  });
});

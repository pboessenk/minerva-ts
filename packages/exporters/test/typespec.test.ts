import { describe, expect, it } from 'vitest';
import { UNTITLED, decodeModel, emptyManifest, filterModel, resolveExportSettings, type CatalogLookups, type Model } from '@minerva/core';
import type { ExportContext } from '../src/context.ts';
import { exportTypeSpec } from '../src/typespec.ts';

function context(model: Model, lookups: Partial<CatalogLookups> = {}): ExportContext {
  return {
    model,
    lookups: {
      codelists: null,
      attributeDescriptions: null,
      subtypeDescriptions: new Map(),
      codelistDescriptions: null,
      codeNotes: new Map(),
      ...lookups,
    },
    settings: resolveExportSettings(model, emptyManifest(), 'shop_model.json'),
    now: new Date(0),
  };
}

const decode = (model: object): Model => decodeModel(JSON.stringify(model));

/** Renders twice and requires identical output, so nothing order-dependent leaks into the document. */
function render(model: object, lookups: Partial<CatalogLookups> = {}): string {
  const first = exportTypeSpec(context(decode(model), lookups)).body;
  const second = exportTypeSpec(context(decode(model), lookups)).body;
  expect(second).toBe(first);
  return first;
}

const count = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

function expectContainsAll(out: string, needles: readonly string[]): void {
  for (const needle of needles) expect(out).toContain(needle);
}

/**
 * A codelist-subset attribute with its own name, an enum-typed attribute
 * without a description, a plain attribute, and a discriminated entity with
 * one shared attribute.
 */
const describedModel = {
  title: 'Desc Test',
  entities: {
    Thing: {
      description: 'A thing.',
      sections: [
        {
          name: null,
          attributes: [
            {
              name: 'code',
              type: 'string',
              required: true,
              siviCodelist: 'CL001',
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
          name: null,
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

describe('document frame', () => {
  const withOperation = (extra: object) => ({
    entities: { Order: { sections: [{ name: null, attributes: [{ name: 'id', type: 'string' }] }] } },
    operations: [{ id: 'getOrder', method: 'GET', path: '/order', responses: { '200': { description: 'ok', schema: 'Order' } } }],
    ...extra,
  });

  it('takes the namespace and the download name from the settings', () => {
    const result = exportTypeSpec(context(decode(withOperation({ title: 'Orders', export: { namespace: 'Shop' } }))));
    expect(result.body).toContain('\nnamespace Shop;\n\n');
    expect(result.filename).toBe('shop_model.tsp');
    expect(result.contentType).toBe('text/plain; charset=utf-8');
  });

  it('falls back to the default title', () => {
    expect(render(withOperation({}))).toContain(`@service(#{\n  title: "${UNTITLED}"\n})\n`);
  });

  it('has no service and no namespace without operations', () => {
    const out = render(describedModel);
    expect(out).not.toContain('@service');
    expect(out).not.toContain('namespace ');
  });

  it('emits servers, authentication, info and a multi-line namespace doc', () => {
    const out = render(
      withOperation({
        title: 'Orders',
        version: '1.2',
        subtitle: 'First.\nSecond.',
        servers: [{ url: 'https://api.example', description: '' }],
        security: { enabled: true },
        contact: { name: 'Team', email: '', url: 'https://example.org' },
      }),
    );
    expect(out).toContain(
      '@server("https://api.example", "https://api.example")\n' +
        '@useAuth(BearerAuth)\n' +
        '@service(#{\n  title: "Orders"\n})\n' +
        '@info(#{\n  version: "1.2",\n  contact: #{\n    name: "Team",\n    url: "https://example.org",\n  },\n})\n' +
        '@doc("""\n  First.  \n  Second.\n  """)\n',
    );
  });
});

describe('discriminated entities', () => {
  it('extracts shared attributes into a base model the variants extend', () => {
    const out = render(describedModel);
    expect(out).toContain(
      '@doc("Shared attributes of all Poly subtypes.")\nmodel PolyBase {\n  @doc("Shared attribute.")\n  shared?: string;\n}\n',
    );
    expect(out).toContain('model PolyOne extends PolyBase {\n  @doc("Discriminator.")\n  entityType: "one";\n}\n');
    expect(count(out, 'shared?: string;')).toBe(1);
    // The union is unchanged and does not include the base.
    expect(out).toContain('union Poly {\n  one: PolyOne,\n  two: PolyTwo\n}');
  });

  it('stays flat when the subtypes share nothing beyond the discriminator', () => {
    const out = render({
      title: 'Empty Base Test',
      entities: {
        Poly: {
          description: 'A polymorphic thing.',
          sections: [
            {
              name: null,
              attributes: [
                { name: 'entityType', type: 'string', required: true, allowedValues: ['one', 'two'], description: 'Discriminator.' },
                { name: 'onlyOne', type: 'string', applicableSubtypes: ['one'] },
              ],
            },
          ],
        },
      },
    });
    expect(out).not.toContain('PolyBase');
    expect(out).not.toContain('extends');
  });

  it('stays flat when the base name is taken by another entity', () => {
    const out = render({
      title: 'Collision Test',
      entities: {
        Poly: {
          description: 'A polymorphic thing.',
          sections: [
            {
              name: null,
              attributes: [
                { name: 'entityType', type: 'string', required: true, allowedValues: ['one', 'two'], description: 'Discriminator.' },
                { name: 'shared', type: 'string', description: 'Shared attribute.' },
              ],
            },
          ],
        },
        PolyBase: {
          description: 'An unrelated entity that happens to take the base name.',
          sections: [{ name: null, attributes: [{ name: 'name', type: 'string' }] }],
        },
      },
    });
    expect(count(out, 'model PolyBase {')).toBe(1);
    expect(out).not.toContain('extends PolyBase');
    expect(count(out, 'shared?: string;')).toBe(2);
  });
});

/**
 * Every constraint-emission gate: string bounds with pattern and default, a
 * string retyped by its format, numeric bounds inclusive and exclusive, a
 * boolean default, primitive and entity arrays, plus values that must never
 * be emitted (a named type, a default on a required attribute, a date
 * default, a string bound left on an integer).
 */
const constrainedModel = {
  title: 'Constraint Test',
  entities: {
    Part: { description: 'A part.', sections: [{ name: null, attributes: [{ name: 'id', type: 'string', required: true }] }] },
    Thing: {
      description: 'A thing.',
      sections: [
        {
          name: null,
          attributes: [
            { name: 'code', type: 'string', required: true, minLength: 4, maxLength: 7, pattern: '^[A-Z]+$' },
            { name: 'label', type: 'string', maxLength: 80, default: 'n/a' },
            { name: 'when', type: 'string', format: 'date', minLength: 10 },
            { name: 'count', type: 'integer', required: true, minimum: 0, exclusiveMaximum: 424242 },
            { name: 'windows', type: 'integer', maximum: 99, default: '1' },
            { name: 'ratio', type: 'number', format: 'float', exclusiveMinimum: 0, maximum: 1 },
            { name: 'flag', type: 'boolean', default: 'TRUE' },
            { name: 'tags', type: 'string[]', minLength: 2, minItems: 1, maxItems: 5 },
            { name: 'ratings', type: 'integer[]', minimum: 0 },
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
};

describe('constraints', () => {
  it('emits the applicable decorators and defaults', () => {
    const out = render(constrainedModel);
    expectContainsAll(out, [
      '  @pattern("^[A-Z]+$")\n  @minLength(4)\n  @maxLength(7)\n  code: string;\n',
      '  @maxLength(80)\n  label?: string = "n/a";\n',
      '  when?: plainDate;\n', // retyped: no @minLength
      '  @minValue(0)\n  @maxValueExclusive(424242)\n  count: int32;\n',
      '  @maxValue(99)\n  windows?: int32 = 1;\n',
      '  @minValueExclusive(0)\n  @maxValue(1)\n  ratio?: float32;\n',
      '  flag?: boolean = true;\n',
      // Element bounds move to a declared scalar; item bounds stay on the array.
      '@minLength(2)\nscalar ThingTags extends string;\n',
      '  @minItems(1)\n  @maxItems(5)\n  tags?: ThingTags[];\n',
      '@minValue(0)\nscalar ThingRatings extends int32;\n',
      '  ratings?: ThingRatings[];\n',
      '  @minItems(1)\n  parts?: Part[];\n',
      '  kind?: ThingKind;\n',
      '  fixed: string;\n',
      '  since?: plainDate;\n',
      '  stale?: int32;\n',
    ]);
    const counts: Record<string, number> = {
      '@minLength(': 2,
      '@maxLength(': 2,
      '@minValue(': 2,
      '@minValueExclusive(': 1,
      '@maxValue(': 2,
      '@maxValueExclusive(': 1,
      '@minItems(': 2,
      '@maxItems(': 1,
      'scalar ': 2,
    };
    for (const [needle, n] of Object.entries(counts)) expect(count(out, needle), needle).toBe(n);
  });

  it('declares element scalars for constrained primitive arrays', () => {
    const out = render({
      title: 'Element Scalar Test',
      enums: { OrderStatus: { values: [{ name: 'Open', value: 'open' }] } },
      entities: {
        Shipment: {
          sections: [
            {
              name: null,
              attributes: [{ name: 'trackingCodes', type: 'string[]', example: 'TRK12345', minLength: 1, maxLength: 15 }],
            },
          ],
        },
        Order: {
          sections: [
            {
              name: null,
              attributes: [
                { name: 'state', type: 'OrderStatus', required: true },
                { name: 'status', type: 'string[]', pattern: '^[a-z]+$' },
                { name: 'notes', type: 'string[]' },
                { name: 'refs', type: 'string[]', minItems: 1 },
                { name: 'codes', type: 'string[]', allowedValues: ['a', 'b'], allowedName: 'OrderCode', minLength: 1 },
                { name: 'weights', type: 'number[]', exclusiveMinimum: 0, maximum: 2.5 },
              ],
            },
          ],
        },
      },
    });
    expectContainsAll(out, [
      '@minLength(1)\n@maxLength(15)\nscalar ShipmentTrackingCodes extends string;\n',
      '  @example(#["TRK12345"])\n  trackingCodes?: ShipmentTrackingCodes[];\n',
      // OrderStatus is taken by the enum.
      '@pattern("^[a-z]+$")\nscalar OrderStatusItem extends string;\n',
      '  status?: OrderStatusItem[];\n',
      '@minValueExclusive(0)\n@maxValue(2.5)\nscalar OrderWeights extends float64;\n',
      '  weights?: OrderWeights[];\n',
      '  notes?: string[];\n',
      '  @minItems(1)\n  refs?: string[];\n',
      '  codes?: OrderCode[];\n',
    ]);
    expect(count(out, 'scalar ')).toBe(3);
    // Scalars are declared before the first model.
    expect(out.indexOf('scalar ShipmentTrackingCodes')).toBeLessThan(out.indexOf('model '));
  });

  it('numbers colliding scalar names', () => {
    const out = render({
      entities: {
        Order: { sections: [{ name: null, attributes: [{ name: 'tags', type: 'string[]', maxLength: 5 }] }] },
        OrderTags: { sections: [{ name: null, attributes: [{ name: 'x', type: 'string' }] }] },
        OrderTagsItem: { sections: [{ name: null, attributes: [{ name: 'x', type: 'string' }] }] },
      },
    });
    expect(out).toContain('@maxLength(5)\nscalar OrderTagsItem2 extends string;\n');
    expect(out).toContain('  tags?: OrderTagsItem2[];\n');
  });
});

describe('patterns', () => {
  it('escapes patterns and emits them on plain strings only', () => {
    const out = render({
      title: 'Pattern Test',
      entities: {
        Thing: {
          description: 'A thing.',
          sections: [
            {
              name: null,
              attributes: [
                { name: 'zip', type: 'string', required: true, pattern: '^\\d{4}\\s?[A-Z]{2}$' },
                // biome-ignore lint/suspicious/noTemplateCurlyInString: a literal ${y} in a pattern is the case under test.
                { name: 'quoted', type: 'string', pattern: '^it\'s "x" ${y}$' },
                { name: 'tags', type: 'string[]', pattern: '^[a-z]+$' },
                { name: 'kind', type: 'string', allowedValues: ['a', 'b'], allowedName: 'ThingKind', pattern: '^[ab]$' },
                { name: 'count', type: 'integer', pattern: '^\\d+$' },
                { name: 'when', type: 'string', format: 'date', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
              ],
            },
          ],
        },
      },
    });
    // Backslashes doubled; quotes and template interpolation escaped.
    expect(out).toContain('@pattern("^\\\\d{4}\\\\s?[A-Z]{2}$")');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the expected output contains a literal ${y}.
    expect(out).toContain('@pattern("^it\'s \\"x\\" \\${y}$")');
    // A string array carries its pattern on the element scalar.
    expect(out).toContain('@pattern("^[a-z]+$")\nscalar ThingTags extends string;\n');
    expect(out).toContain('  tags?: ThingTags[];\n');
    // Named types, non-strings and format-retyped strings carry none.
    expect(count(out, '@pattern')).toBe(3);
  });
});

describe('descriptions', () => {
  it('prefixes attributes bound to a codelist or enum', () => {
    const out = render(describedModel);
    expect(out).toContain('@doc("Codelist: ThingCode. Code of the thing.")');
    // No trailing space when the attribute has no description of its own.
    expect(out).toContain('@doc("Codelist: StatusEnum.")');
    expect(out).toContain('@doc("Name of the thing.")');
    // The discriminator and plain attributes are never prefixed.
    expect(count(out, 'Codelist:')).toBe(2);
  });

  it('documents a codelist union with an explicit @doc legend, never a doc comment', () => {
    const out = render(describedModel, {
      codelists: new Map([
        [
          'CL001',
          new Map([
            ['a', 'Alpha'],
            ['b', 'Beta'],
          ]),
        ],
      ]),
      codelistDescriptions: new Map([['CL001', 'Thing codes']]),
    });
    expect(out).toContain(
      '@doc("""\n' +
        '  Thing codes\n' +
        '\n' +
        '  | Code | Description |\n' +
        '  |------|-------------|\n' +
        '  | a | Alpha |\n' +
        '  | b | Beta |\n' +
        '  """)\n' +
        '@extension("x-schema-group", "codelist")\n' +
        '@extension("x-sivi-code", "CL001")\n' +
        'union ThingCode {',
    );
    // Some emitters crash on a doc comment attached to a union (decorator
    // lines in between do not detach it).
    const lines = out.split('\n');
    lines.forEach((line, i) => {
      if (line.trim() !== '*/') return;
      const next = lines.slice(i + 1).find((l) => !l.trim().startsWith('@'));
      expect(next?.trim().startsWith('union ')).toBe(false);
    });
  });

  it('adds a notes column when a code has a note', () => {
    const out = render(describedModel, {
      codelists: new Map([
        [
          'CL001',
          new Map([
            ['a', 'Alpha'],
            ['b', 'Beta'],
          ]),
        ],
      ]),
      codeNotes: new Map([['CL001', new Map([['b', 'Deprecated']])]]),
    });
    expect(out).toContain(
      '@doc("""\n  | Code | Description | Notes |\n  |------|-------------|-------|\n  | a | Alpha |  |\n  | b | Beta | Deprecated |\n  """)\n',
    );
  });

  it('keeps multi-line entity descriptions', () => {
    const entity = (description: string, attributes: object[]) => ({ description, sections: [{ name: null, attributes }] });
    const out = render({
      title: 'Multiline Test',
      entities: {
        Flat: entity('First line.\nSecond line.', [{ name: 'name', type: 'string', description: 'Name.' }]),
        Poly: entity('Union first line.\nUnion second line.', [
          { name: 'entityType', type: 'string', required: true, allowedValues: ['one', 'two'], description: 'Discriminator.' },
        ]),
        Single: entity('One line only.', [{ name: 'name', type: 'string' }]),
        Gapped: entity('Top.\n\n\nBottom.', [{ name: 'name', type: 'string' }]),
      },
    });
    // Models: a doc comment with Markdown hard breaks.
    expect(out).toContain('/**\n * First line.  \n * Second line.\n */\nmodel Flat {');
    // Unions: an explicit @doc; the discriminator note is a paragraph of its own.
    expect(out).toContain(
      '@doc("""\n  Union first line.  \n  Union second line.\n\n  Discriminated by the entityType property.\n  """)\n@discriminated(',
    );
    expect(out).toContain('@doc("One line only.")\nmodel Single {');
    // Extra blank lines become &nbsp; lines; a single blank line stays a paragraph break.
    expect(out).toContain('/**\n * Top.\n *\n * &nbsp;  \n * Bottom.\n */');
    expect(out).not.toContain('Union second line.\n  &nbsp;');
  });

  it('documents variants with their discriminator value and subtype description', () => {
    const out = render(describedModel, { subtypeDescriptions: new Map([['poly.one', 'The first kind.']]) });
    expect(out).toContain('@doc("EntityType: one. The first kind.")\nmodel PolyOne extends PolyBase {');
    expect(out).toContain('@doc("EntityType: two. Poly subtype: two")\nmodel PolyTwo extends PolyBase {');
  });
});

describe('enums', () => {
  it('emits only enums that emitted schemas reference', () => {
    const out = render({
      entities: {
        Order: {
          sections: [
            {
              name: null,
              attributes: [
                { name: 'status', type: 'OrderStatus', example: 'open' },
                { name: 'kind', type: 'OrderKind', allowedValues: ['a'], allowedName: 'OrderKindSubset' },
              ],
            },
          ],
        },
      },
      enums: {
        OrderStatus: { values: [{ name: 'Open', value: 'open', description: 'Still open.' }, { value: 'on_hold' }] },
        OrderKind: { values: [{ value: 'a' }] },
        SortOrder: { values: [{ value: 'asc' }] },
        Unused: { values: [{ value: 'x' }] },
      },
      operations: [
        {
          id: 'listOrders',
          method: 'GET',
          path: '/orders',
          parameters: [{ name: 'sort', in: 'query', type: 'SortOrder' }],
          responses: {},
        },
      ],
    });
    expect(out).toContain(
      '@extension("x-schema-group", "codelist")\nenum OrderStatus {\n  @doc("Still open.")\n  Open: "open",\n  OnHold: "on_hold"\n}\n',
    );
    expect(out).toContain('enum SortOrder {');
    // Fully specialised into a named type, or not referenced at all.
    expect(out).not.toContain('enum OrderKind {');
    expect(out).not.toContain('enum Unused {');
    // Enum examples are written as member references.
    expect(out).toContain('  @example(OrderStatus.Open)\n');
  });
});

/** Response-only examples on an operation with a request body and on one without. */
const exampleModel = {
  title: 'OpExample Test',
  entities: {
    Widget: { description: 'A widget.', sections: [{ name: null, attributes: [{ name: 'name', type: 'string', required: true }] }] },
    Problem: {
      description: 'A problem details body.',
      sections: [
        {
          name: null,
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
};

describe('operation examples', () => {
  it('omits the parameters of response-only examples', () => {
    const out = render(exampleModel);
    expectContainsAll(out, ['@opExample(', '    returnType: #{', '      statusCode: 403,', '  #{ title: "Forbidden" }', 'causes: #[']);
    expect(out).toContain('detail: "say \\"hi\\""');
    // A `body: #{}` placeholder would fail to compile when the body model
    // has required properties.
    expect(count(out, 'parameters: #{')).toBe(0);
    expect(out).not.toContain('body: #{}');
  });

  it('emits response wrappers and a union return type', () => {
    const out = render(exampleModel);
    expect(out).toContain('@doc("created")\nmodel CreateWidgetResponse201 {\n  @statusCode statusCode: 201;\n  @body body: Widget;\n}\n');
    expect(out).toContain(
      '@route("/widget")\n@post\nop createWidget(@body body: Widget): CreateWidgetResponse201 | CreateWidgetResponse403;\n',
    );
  });

  it('types request values and narrows discriminated objects to their subtype', () => {
    const out = render({
      entities: {
        Order: {
          sections: [
            {
              name: null,
              attributes: [
                { name: 'placed', type: 'Date' },
                { name: 'total', type: 'number' },
                { name: 'status', type: 'OrderStatus' },
                { name: 'party', type: 'Party' },
              ],
            },
          ],
        },
        Party: {
          sections: [
            {
              name: null,
              attributes: [
                { name: 'entityType', type: 'string', required: true, allowedValues: ['person', 'company'] },
                { name: 'name', type: 'string' },
                { name: 'birthDate', type: 'Date', applicableSubtypes: ['person'] },
                { name: 'registration', type: 'string', applicableSubtypes: ['company'] },
              ],
            },
          ],
        },
      },
      enums: { OrderStatus: { values: [{ name: 'Open', value: 'open' }] } },
      operations: [
        {
          id: 'createOrder',
          method: 'POST',
          path: '/orders/{shop}',
          requestBody: 'Order',
          parameters: [
            { name: 'shop', in: 'path', type: 'string' },
            { name: 'limit', in: 'query', type: 'integer' },
          ],
          responses: { '201': { description: '', schema: 'Order' } },
        },
      ],
      examples: [
        {
          id: 'full',
          operationId: 'createOrder',
          summary: 'Full',
          parameterValues: { shop: 'main' },
          request: {
            _typeMap: { total: 'number' },
            placed: '2024-01-02',
            total: '12.5',
            status: 'open',
            party: { name: 'Ann', entityType: 'person', birthDate: '2000-01-01', registration: 'R1' },
          },
        },
      ],
    });
    expect(out).toContain(
      '@opExample(\n' +
        '  #{\n' +
        '    parameters: #{\n' +
        '      shop: "main",\n' +
        '      limit: 0,\n' +
        '      body: #{\n' +
        '        placed: plainDate.fromISO("2024-01-02"),\n' +
        '        total: 12.5,\n' +
        '        status: OrderStatus.Open,\n' +
        '        party: #{\n' +
        '          name: "Ann",\n' +
        '          entityType: "person",\n' +
        '          birthDate: plainDate.fromISO("2000-01-01")\n' +
        '        }\n' +
        '      }\n' +
        '    },\n' +
        '  },\n' +
        '  #{ title: "Full" }\n' +
        ')\n' +
        '@route("/orders/{shop}")\n' +
        '@post\n' +
        'op createOrder(@path shop: string, @query limit: integer, @body body: Order): CreateOrderResponse201;\n',
    );
  });
});

describe('root-filtered export', () => {
  it('defines every model it references', () => {
    const model = decode({
      entities: {
        Order: {
          children: [{ name: 'Party' }],
          sections: [{ name: null, attributes: [{ name: 'id', type: 'string' }] }],
        },
        Party: {
          sections: [
            {
              name: null,
              attributes: [
                { name: 'entityType', type: 'string', required: true, allowedValues: ['person', 'company'] },
                { name: 'name', type: 'string' },
              ],
            },
          ],
        },
        Problem: { excludeFromInclusion: true, sections: [{ name: null, attributes: [{ name: 'title', type: 'string' }] }] },
        Unrelated: { sections: [{ name: null, attributes: [{ name: 'x', type: 'string' }] }] },
      },
      operations: [
        {
          id: 'createOrder',
          method: 'POST',
          path: '/orders',
          requestBody: 'Order',
          responses: { '201': { description: '', schema: 'Order' }, '400': { description: '', schema: 'Problem' } },
        },
        { id: 'getProblem', method: 'GET', path: '/problem', responses: { '200': { description: '', schema: 'Problem' } } },
      ],
    });
    const out = exportTypeSpec(context(filterModel(model, ['Order']))).body;
    expect(out).toContain('model Problem {');
    expect(out).toContain('model PartyBase {');
    expect(out).not.toContain('model Unrelated {');
    expect(out).not.toContain('op getProblem(');
    for (const [, base] of out.matchAll(/extends (\w+) \{/g)) expect(out).toContain(`model ${base} {`);
  });
});

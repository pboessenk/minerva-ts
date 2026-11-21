import { describe, expect, it } from 'vitest';
import { decodeModel, emptyManifest, resolveExportSettings, type CatalogLookups, type Model } from '@minerva/core';
import { exportHtml } from '../src/html.ts';
import { formatExampleJson } from '../src/html/operation.ts';

const NOW = new Date(Date.UTC(2024, 2, 5, 7, 9, 30));

function lookups(overrides: Partial<CatalogLookups> = {}): CatalogLookups {
  return {
    codelists: null,
    attributeDescriptions: null,
    subtypeDescriptions: new Map(),
    codelistDescriptions: null,
    codeNotes: new Map(),
    ...overrides,
  };
}

function model(source: unknown): Model {
  return decodeModel(JSON.stringify(source));
}

function render(m: Model, options: { lookups?: CatalogLookups; includeInternalDocs?: boolean } = {}) {
  return exportHtml(
    {
      model: m,
      lookups: options.lookups ?? lookups(),
      settings: resolveExportSettings(m, emptyManifest(), 'test_model.json'),
      now: NOW,
    },
    { includeInternalDocs: options.includeInternalDocs ?? true },
  );
}

const html = (m: Model, options?: Parameters<typeof render>[1]): string => render(m, options).body;

/**
 * A codelist-subset attribute with its own name, an enum subset, an open
 * enum binding, a plain attribute, and a subtyped entity whose
 * discriminator must never get a named type.
 */
function namedTypesModel(title: string, { enumSubset = true } = {}): Model {
  return model({
    title,
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
                siviCodelist: 'LIST01',
                allowedValues: ['a', 'b'],
                allowedName: 'ThingCode',
                description: 'Code of the thing.',
              },
              ...(enumSubset ? [{ name: 'kind', type: 'StatusEnum', allowedValues: ['open'] }] : []),
              { name: 'status', type: 'StatusEnum', description: 'Open binding to the enum.' },
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
  });
}

describe('html export', () => {
  it('renders codelists as the named types the specification exports emit', () => {
    const out = html(namedTypesModel('Codelist Test'), {
      lookups: lookups({
        codelists: new Map([
          [
            'LIST01',
            new Map([
              ['a', 'Alpha'],
              ['b', 'Beta'],
            ]),
          ],
        ]),
        codeNotes: new Map([['LIST01', new Map([['a', 'note-a']])]]),
      }),
    });

    for (const needle of [
      'id="cl-ThingCode"', // a section per alias
      'ml-cl-name">ThingCode<', // titled by the alias
      '<span class="ml-subtype-tag">LIST01</span>', // the codelist itself as a tag
      '<td>Alpha</td>', // code description from the codelist
      '<td>note-a</td>', // workspace code note
      'id="cl-ThingKind"', // a section for the enum subset
      'ml-cl-code">open<', // with the subset value
      'href="#cl-ThingCode">ThingCode</a>', // attribute type links to the alias
      'href="#cl-ThingKind">ThingKind</a>',
      'href="#enum-StatusEnum"', // an open enum binding links the enum
      '<span class="ml-attr-cl" title="SIVI codelist">LIST01</span>', // codelist chip is plain metadata
      'data-toc="codelist">ThingCode</a>', // listed in the sidebar
    ]) {
      expect(out).toContain(needle);
    }
    expect(out).not.toContain('id="cl-LIST01"'); // no section keyed by the codelist name
    expect(out).not.toContain('PolyEntityType'); // no named type for the discriminator
    expect(out).not.toContain('<a class="ml-attr-cl"'); // the codelist chip is not a link
  });

  it('leads bound attribute descriptions with the codelist name', () => {
    const out = html(namedTypesModel('Description Test', { enumSubset: false }));
    expect(out).toContain('<span class="ml-attr-desc">Codelist: ThingCode. Code of the thing.</span>');
    // An open enum binding is prefixed with the enum name.
    expect(out).toContain('<span class="ml-attr-desc">Codelist: StatusEnum. Open binding to the enum.</span>');
    // The two bound attributes only: never the discriminator or a plain attribute.
    expect(out.split('Codelist:').length - 1).toBe(2);
  });

  it('shows applicable constraints as badges', () => {
    const out = html(
      model({
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
                  { name: 'count', type: 'integer', required: true, minimum: 0, exclusiveMaximum: 424242 },
                  { name: 'ratio', type: 'number', exclusiveMinimum: 0, maximum: 1 },
                  { name: 'flag', type: 'boolean', default: 'TRUE' },
                  { name: 'tags', type: 'string[]', minLength: 2, minItems: 1, maxItems: 5 },
                  { name: 'parts', type: 'Part[]', minItems: 1 },
                  { name: 'kind', type: 'string', allowedValues: ['a', 'b'], allowedName: 'ThingKind', minLength: 1, default: 'a' },
                  { name: 'fixed', type: 'string', required: true, default: 'x' },
                  { name: 'stale', type: 'integer', minLength: 3 },
                ],
              },
            ],
          },
        },
      }),
    );
    for (const needle of [
      '<span class="ml-attr-constraint" title="minLength">minLength 4</span>',
      '<span class="ml-attr-constraint" title="exclusiveMaximum">exclusiveMaximum 424242</span>',
      '<span class="ml-attr-constraint" title="default">default n/a</span>',
      '<span class="ml-attr-constraint" title="default">default true</span>',
      '<span class="ml-attr-constraint" title="minItems">minItems 1</span>',
    ]) {
      expect(out).toContain(needle);
    }
    expect(out).not.toContain('title="default">default x<'); // a default on a required attribute
    expect(out).not.toContain('title="minLength">minLength 3<'); // a string bound left on an integer
    expect(out).not.toContain('title="minLength">minLength 1<'); // an element bound on a named type
  });

  it('shows a pattern badge', () => {
    const out = html(
      model({
        title: 'Pattern Test',
        entities: {
          Thing: {
            description: 'A thing.',
            sections: [{ attributes: [{ name: 'zip', type: 'string', required: true, pattern: '^\\d{4}\\s?[A-Z]{2}$' }] }],
          },
        },
      }),
    );
    expect(out).toContain('<span class="ml-attr-pattern" title="pattern: ^\\d{4}\\s?[A-Z]{2}$">^\\d{4}\\s?[A-Z]{2}$</span>');
  });

  it('does not ship authoring comments of its assets', () => {
    const out = html(namedTypesModel('Leak Test'));
    for (const needle of ['Minerva', 'auto-generated', 'documentation theme', 'Progressive enhancement', 'subtype-css.ts']) {
      expect(out).not.toContain(needle);
    }
  });

  it('removes open points from the public export', () => {
    const m = model({
      title: 'Public Test',
      entities: {
        Thing: {
          description: 'A thing.',
          root: true,
          openPoints: [{ text: 'entity point', type: 'error' }],
          sections: [{ attributes: [{ name: 'id', type: 'string', description: 'Public text.', notes: 'internal note' }] }],
        },
      },
      enums: { Colour: { description: 'Colours.', values: [], openPoints: [{ text: 'enum point', type: '' }] } },
    });
    const internal = html(m);
    expect(internal).toContain('<div class="ml-banner ml-banner-error">entity point</div>');
    expect(internal).toContain('<div class="ml-banner ml-banner-warning">enum point</div>');

    const pub = html(m, { includeInternalDocs: false });
    expect(pub).not.toContain('entity point');
    expect(pub).not.toContain('enum point');
    expect(pub).not.toContain('internal note');
    expect(pub).toContain('Public text.');
    // The input model is left as it was.
    expect(m.entities.get('Thing')?.openPoints).toHaveLength(1);
  });

  it('fills the page template', () => {
    const result = render(
      model({ title: '  Orders + Returns: v2  ', subtitle: 'For <partners>', version: '1.2', lastModified: '2024-01-01' }),
    );
    expect(result.contentType).toBe('text/html; charset=utf-8');
    expect(result.filename).toBe('Orders_+_Returns__v2.html');
    expect(result.body).toContain('<title>Orders &#43; Returns: v2</title>');
    expect(result.body).toContain('<p class="ml-subtitle">For &lt;partners&gt;</p>');
    expect(result.body).toContain('<div class="ml-side-meta">v1.2 &middot; 2024-01-01</div>');
    expect(result.body).toContain('Generated 2024-03-05 07:09 UTC &middot; 0 entities &middot; 0 operations &middot; 0 enums');
    expect(result.body).not.toContain('<nav id="ml-tabs"'); // one section only
    expect(result.body.startsWith('<!DOCTYPE html>\n')).toBe(true);
    expect(result.body.endsWith('</body>\n</html>\n')).toBe(true);

    const untitled = render(model({ version: '1' }));
    expect(untitled.body).toContain('<h1>API Model</h1>');
    expect(untitled.filename).toBe('API_Model.html');
  });

  it('shows each entity once and refers back to it elsewhere', () => {
    const out = html(
      model({
        entities: {
          Root: { root: true, children: [{ name: 'Shared', cardinality: '1..*' }, { name: 'Gone' }], sections: [] },
          Other: { root: true, children: [{ name: 'Shared', condition: 'if any' }], sections: [] },
          Shared: { sections: [{ attributes: [{ name: 'id', type: 'string' }] }] },
          Loose: { sections: [] },
        },
      }),
    );
    // Roots in name order: Other comes first and owns Shared.
    expect(out.indexOf('id="Other"')).toBeLessThan(out.indexOf('id="Root"'));
    expect(out).toContain('<details class="ml-tree-node" id="Shared" data-depth="1">');
    expect(out).toContain(
      '<div class="ml-tree-ref" data-depth="1" data-ref-to="Shared"><span class="ml-tree-leader" aria-hidden="true">&#8627;</span>' +
        '<a class="ml-ref-name ml-link" href="#Shared">Shared</a> <span class="ml-ref-where">defined under <a href="#Other">Other</a></span>' +
        '<span class="ml-card-badge" title="cardinality">1..*</span></div>',
    );
    expect(out).toContain('<span class="ml-ref-where ml-ref-missing">unknown entity</span>');
    expect(out).toContain('<h3 class="ml-orphans-h">Orphans');
    expect(out).toContain('<li class="ml-toc-li ml-toc-ref ml-toc-missing"><a href="#Gone" data-toc="entity">Gone ');
  });

  it('generates the subtype switcher and its CSS', () => {
    const out = html(
      model({
        entities: {
          'Poly Thing': {
            root: true,
            children: [{ name: 'Extra' }],
            sections: [
              {
                attributes: [
                  { name: 'entityType', type: 'string', allowedValues: ['one', 'two "b"'] },
                  { name: 'extra', type: 'Extra', applicableSubtypes: ['one'] },
                ],
              },
            ],
          },
          Extra: { sections: [] },
        },
      }),
    );
    expect(out).toContain('<input class="ml-subr" type="radio" name="subg-Poly_Thing" id="sub-Poly_Thing-__base__" checked>');
    expect(out).toContain('<label class="ml-subtype-opt" for="sub-Poly_Thing-two__b_">two &#34;b&#34;</label>');
    expect(out).toContain('<details class="ml-tree-node" id="Extra" data-depth="1" data-subs="one">');
    expect(out).toContain(
      '#sub-Poly_Thing-two__b_:checked ~ .ml-entity-card .ml-attr[data-subs]:not([data-subs~="two \\"b\\""]):not([data-entitytype="1"]){display:none}\n',
    );
  });

  it('pretty-prints example payloads with sorted keys and without editor bookkeeping', () => {
    expect(formatExampleJson('{"b":1,"a":{"_typeMap":{"x":"number"},"x":"<1>"},"c":[1e21,0.0000001]}')).toBe(
      '{\n  "a": {\n    "x": "\\u003c1\\u003e"\n  },\n  "b": 1,\n  "c": [\n    1e+21,\n    1e-7\n  ]\n}',
    );
    expect(formatExampleJson('[1e400]')).toBe('[1e400]');
  });
});

import { describe, expect, it } from 'vitest';
import { ContractDecodeError, formatShortFloat, normalizeContract, parseOpenApiDocument, valueText } from '../src/compare/index.ts';
import type { LooseValue } from '../src/compare/value-text.ts';

/** The error text of a document that fails to parse. */
function parseError(text: string): string {
  try {
    parseOpenApiDocument(text);
  } catch (err) {
    if (err instanceof ContractDecodeError) return err.message;
    throw err;
  }
  return '(no error)';
}

describe('contract decoding', () => {
  it('reports the first value of the wrong type with its location', () => {
    expect(parseError('{"openapi": 5, "info": {"title": 6}}')).toBe('#/openapi: expected string, found number 5');
    expect(parseError('{"OPENAPI": 5}')).toBe('#/OPENAPI: expected string, found number 5');
    expect(parseError('{"info": 5}')).toBe('#/info: expected object, found number 5');
    expect(parseError('{"paths": {"/a": [5]}}')).toBe('#/paths/~1a: expected object, found array');
    expect(parseError('{"components": {"schemas": {"A/b~c": {"description": 5}}}}')).toBe(
      '#/components/schemas/A~1b~0c/description: expected string, found number 5',
    );
    expect(parseError('{"components": {"schemas": {"A": {"minLength": "5"}}}}')).toBe(
      '#/components/schemas/A/minLength: expected number, found string',
    );
    expect(parseError('{"components": {"schemas": {"A": {"required": [5]}}}}')).toBe(
      '#/components/schemas/A/required/0: expected string, found number 5',
    );
    expect(parseError('{"components": {"schemas": {"A": {"allOf": [true]}}}}')).toBe(
      '#/components/schemas/A/allOf/0: expected object, found boolean',
    );
    expect(parseError('{"components": {"schemas": {"A": {"type": [1, 2e999]}}}}')).toBe(
      '#/components/schemas/A/type/1: expected a finite number, found number 2e999',
    );
    expect(parseError('{"components": {"schemas": {"A": {"enum": {}}}}}')).toBe(
      '#/components/schemas/A/enum: expected array, found object',
    );
    expect(parseError('[]')).toBe('#: expected object, found array');
  });

  it('lets a syntax error win over type errors', () => {
    expect(parseError('{"openapi": 5, "paths": {')).toBe('unexpected end of JSON input at line 1, column 26');
    expect(parseError('{nope')).toBe('expected a double-quoted property name, found "n" at line 1, column 2');
    expect(parseError('{"a":"\\x"}')).toBe('bad escape sequence in string, found "x" at line 1, column 8');
    expect(parseError('{"a":nul}')).toBe('expected "null", found "}" at line 1, column 9');
    expect(parseError('{\n  "openapi": 5,\n  "paths": [1 2]\n}')).toBe(
      'expected "," or "]" after array element, found "2" at line 3, column 15',
    );
  });

  it('requires one of openapi, paths and components.schemas', () => {
    expect(parseError('null')).toBe('document has no openapi/paths/components fields — not an OpenAPI spec');
    expect(parseError('{"paths": {}}')).toBe('(no error)');
  });

  it('matches member names case-insensitively, exact names first', () => {
    const doc = parseOpenApiDocument(
      '{"OpenAPI": "3", "components": {"ſchemas": {"A": {"$REF": "a", "X-SIVI-CODE": "x", "xsivicode": "y"}}}}',
    );
    expect(doc.openapi).toBe('3');
    expect(doc.components.schemas?.get('A')).toMatchObject({ ref: 'a', xSiviCode: 'x' });
  });

  it('merges repeated members into what the first occurrence left', () => {
    const doc = parseOpenApiDocument(
      `{"info": {"title": "t"}, "info": {"version": "v"}, "info": null,
        "components": {"schemas": {"A": {
          "items": {"type": "string"}, "items": {"format": "f"},
          "properties": {"x": {"type": "string"}, "x": {"format": "g"}}, "properties": {"y": {}},
          "allOf": [{"$ref": "r"}, {"type": "x"}], "allOf": [{"format": "h"}],
          "required": ["a", "b"], "required": ["c"],
          "type": {"a": 1}, "type": {"b": 2},
          "description": "d", "description": null
        }}}}`,
    );
    expect(doc.info).toEqual({ title: 't', version: 'v' });
    const a = doc.components.schemas?.get('A');
    expect(a?.items).toMatchObject({ type: 'string', format: 'f' });
    expect([...(a?.properties?.keys() ?? [])]).toEqual(['x', 'y']);
    expect(a?.properties?.get('x')).toMatchObject({ type: null, format: 'g' });
    expect(a?.allOf).toHaveLength(1);
    expect(a?.allOf?.[0]).toMatchObject({ ref: 'r', format: 'h' });
    expect(a?.required).toEqual(['c']);
    expect(a?.type).toEqual(new Map([['b', 2]]));
    expect(a?.description).toBe('d');
  });

  it('keeps what it could decode of shared parameters and reports broken operations', () => {
    const { ir, findings } = normalizeContract(
      parseOpenApiDocument(`{"paths": {"/a/{id}": {
        "parameters": [{"name": 5, "in": "query"}, {"name": "id", "in": "path", "required": "yes"}],
        "get": {"responses": {}},
        "put": {"tags": ["x", 1]}
      }}}`),
    );
    expect(ir.operations.get('GET /a/{}')?.params).toEqual([
      { name: '', in: 'query', required: false, type: 'string' },
      { name: 'id', in: 'path', required: false, type: 'string' },
    ]);
    expect(findings.map((f) => [f.operation, f.changeNeeded])).toEqual([
      ['PUT /a/{id}', 'Could not parse this contract operation: #/paths/~1a~1{id}/put/tags/1: expected string, found number 1'],
    ]);
  });

  it('treats additionalProperties: null as present', () => {
    const { ir } = normalizeContract(parseOpenApiDocument('{"components": {"schemas": {"A": {"additionalProperties": null}}}}'));
    expect(ir.schemas.get('A')?.kind).toBe('open');
  });
});

describe('value text', () => {
  it('prints floats with the fewest digits and exponents from 1e6', () => {
    const cases: [number, string][] = [
      [1e6, '1e+06'],
      [1.5e-7, '1.5e-07'],
      [100, '100'],
      [-0, '-0'],
      [1e21, '1e+21'],
      [123456789, '1.23456789e+08'],
      [0.0001, '0.0001'],
      [0.00001, '1e-05'],
      [123456, '123456'],
      [1234567, '1.234567e+06'],
      [5e-324, '5e-324'],
      [1.7976931348623157e308, '1.7976931348623157e+308'],
      // biome-ignore lint/correctness/noPrecisionLoss: the test is about a literal that does not fit a double.
      [12345678901234567890, '1.2345678901234567e+19'],
      [-3.75e10, '-3.75e+10'],
    ];
    for (const [value, text] of cases) expect(formatShortFloat(value), String(value)).toBe(text);
  });

  it('prints lists and objects', () => {
    const value = new Map<string, LooseValue>([
      [
        'b',
        [
          1,
          'x y',
          null,
          true,
          new Map<string, LooseValue>([
            ['z', 1],
            ['a', [2]],
          ]),
        ],
      ],
      ['a', 's'],
      ['', null],
      ['B', 1],
    ]);
    expect(valueText(value)).toBe('map[:<nil> B:1 a:s b:[1 x y <nil> true map[a:[2] z:1]]]');
    expect(valueText([[], new Map(), [null], '', '<&>'])).toBe('[[] map[] [<nil>]  <&>]');
  });
});

import { describe, expect, it } from 'vitest';
import { normalizeContract, normalizeModel, parseOpenApiDocument } from '../src/compare/index.ts';
import type { Model } from '../src/model/types.ts';
import { countCategory, findFinding, model, runCompare } from './compare-helpers.ts';

// ── Contract parsing and normalization ──

const shapesContract = `{
  "openapi": "3.1.0",
  "info": {"title": "fixture", "version": "v9"},
  "paths": {
    "/things/{thingId}": {
      "parameters": [{"name": "thingId", "in": "path", "required": true, "schema": {"type": "string"}}],
      "get": {
        "operationId": "getThing",
        "responses": {
          "200": {"description": "ok", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/Ns.Thing"}}}}
        }
      }
    },
    "/things": {
      "post": {
        "operationId": "createThing",
        "requestBody": {"required": true, "content": {"application/json": {"schema": {"type": "array", "items": {"$ref": "#/components/schemas/Ns.Thing"}}}}},
        "responses": {
          "201": {"description": "created", "content": {"application/json": {"schema": {"type": "object", "unevaluatedProperties": {}}}}}
        }
      }
    },
    "/api-docs-json": {
      "get": {"operationId": "docs", "tags": ["Docs"], "responses": {"200": {"description": "ok"}}}
    }
  },
  "components": {"schemas": {
    "Ns.Thing": {
      "type": "object",
      "required": ["id", "kind"],
      "properties": {
        "id": {"minLength": 2, "type": "string", "pattern": "^x-\\\\d+$"},
        "kind": {"allOf": [{"$ref": "#/components/schemas/Ns.KindType"}], "description": "wrapped ref", "x-sivi-code": "CLX"},
        "count": {"type": ["integer", "null"], "format": "int32", "minimum": 1, "exclusiveMinimum": true},
        "labels": {"type": "array", "minItems": 1, "items": {"type": "string", "pattern": "^[a-z]+$", "maxLength": 20}},
        "flag": {"anyOf": [{"type": "boolean"}, {"type": "null"}]}
      }
    },
    "Ns.KindType": {"type": "string", "enum": ["A", "B"], "x-sivi-code": "CLX", "x-schema-group": "codelist"},
    "Ns.Open": {"type": "object", "unevaluatedProperties": {}}
  }}
}`;

describe('contract normalization', () => {
  it('unwraps emitter idioms into the IR', () => {
    const { ir } = normalizeContract(parseOpenApiDocument(shapesContract));

    const thing = ir.schemas.get('Thing');
    expect(thing?.kind).toBe('object');
    expect(thing?.rawName).toBe('Ns.Thing');

    const kind = thing?.properties.get('kind');
    expect(kind?.ref, 'allOf-wrapped ref').toBe('KindType');
    expect(kind?.siviCode, 'sibling of the allOf wrapper').toBe('CLX');
    expect(kind?.required).toBe(true);

    const count = thing?.properties.get('count');
    expect(count).toMatchObject({ type: 'integer', format: 'int32', nullable: true, required: false });
    expect(count?.constraints?.get('exclusiveMinimum'), '3.0 boolean exclusiveMinimum converted').toBe('1');
    expect(count?.constraints?.has('minimum')).toBe(false);

    const labels = thing?.properties.get('labels');
    expect(labels).toMatchObject({ array: true, type: 'string', pattern: '^[a-z]+$' });
    expect(labels?.constraints?.get('minItems'), 'item bound from the array').toBe('1');
    expect(labels?.constraints?.get('maxLength'), 'element keyword from the items').toBe('20');

    const id = thing?.properties.get('id');
    expect(id?.pattern).toBe('^x-\\d+$');
    expect(id?.constraints?.get('minLength')).toBe('2');

    expect(thing?.properties.get('flag')).toMatchObject({ type: 'boolean', nullable: true });

    const kindType = ir.schemas.get('KindType');
    expect(kindType).toMatchObject({ kind: 'enum', enumValues: ['A', 'B'], siviCode: 'CLX' });
    expect(ir.schemas.get('Open')?.kind).toBe('open');

    const get = ir.operations.get('GET /things/{}');
    expect(get?.params, 'path-level parameters merged into the operation').toEqual([
      { name: 'thingId', in: 'path', required: true, type: 'string' },
    ]);
    expect(get?.responses.get('200')?.ref).toBe('Thing');

    const post = ir.operations.get('POST /things');
    expect(post?.requestBody).toMatchObject({ array: true, ref: 'Thing' });
    expect(post?.responses.get('201')?.unconstrained, 'inline open object').toBe(true);
  });
});

// ── Model projection ──

describe('model projection', () => {
  it('projects the model as the OpenAPI export emits it', () => {
    const m = model({
      title: 't',
      version: '1',
      entities: {
        Shape: {
          sections: [
            {
              attributes: [
                { name: 'entityType', type: 'string', required: true, allowedValues: ['circle', 'roundedSquare'] },
                { name: 'area', type: 'number' },
                { name: 'radius', type: 'string', applicableSubtypes: ['circle'] },
              ],
            },
          ],
        },
        Thing: {
          sections: [
            {
              attributes: [
                { name: 'id', type: 'string', required: true, minLength: 3, pattern: '^t-\\d+$' },
                { name: 'when', type: 'date' },
                {
                  name: 'kind',
                  type: 'string',
                  siviCodelist: 'CLX',
                  allowedValues: ['A', 'B'],
                  allowedName: 'KindType',
                  pattern: '^[AB]$',
                  minLength: 1,
                },
                { name: 'status', type: 'Status' },
                { name: 'tags', type: 'string[]', pattern: '^[a-z]+$', minItems: 1 },
              ],
            },
          ],
        },
      },
      enums: {
        Status: {
          values: [
            { name: 'Open', value: 'open' },
            { name: 'Done', value: 'done' },
          ],
        },
      },
    });
    const ir = normalizeModel(m, null);

    const shape = ir.schemas.get('Shape');
    expect(shape?.kind).toBe('union');
    expect(shape?.oneOf).toEqual(['ShapeCircle', 'ShapeRoundedSquare']);
    const circle = ir.schemas.get('ShapeCircle');
    expect(circle?.isSubtype).toBe(true);
    expect(circle?.properties.has('radius'), 'subtype-specific attribute').toBe(true);
    expect(circle?.properties.get('entityType')?.enumValues, 'discriminator as constant').toEqual(['circle']);
    expect(ir.schemas.get('ShapeRoundedSquare')?.properties.has('radius')).toBe(false);

    const thing = ir.schemas.get('Thing');
    expect(thing?.properties.get('when')).toMatchObject({ type: 'string', format: 'date' });
    const kind = thing?.properties.get('kind');
    expect(kind?.ref).toBe('KindType');
    expect(kind?.pattern, 'no pattern on a named type').toBe('');
    expect(kind?.constraints?.get('minLength'), 'no element keywords on a named type').toBeUndefined();
    expect(ir.schemas.get('KindType')).toMatchObject({ kind: 'enum', enumValues: ['A', 'B'], siviCode: 'CLX' });
    expect(thing?.properties.get('status')?.ref).toBe('Status');
    expect(ir.schemas.get('Status')).toMatchObject({ kind: 'enum', enumValues: ['open', 'done'] });
    expect(thing?.properties.get('tags')).toMatchObject({ array: true, type: 'string', pattern: '^[a-z]+$' });
    expect(thing?.properties.get('tags')?.constraints?.get('minItems')).toBe('1');
    expect(thing?.properties.get('id')?.pattern).toBe('^t-\\d+$');
    expect(thing?.properties.get('id')?.constraints?.get('minLength')).toBe('3');
  });
});

// ── Findings, one case per category ──

/** One entity Thing {id, kind} and one operation, matching `diffContract`. */
function diffModel(attributes?: object[], operations?: object[]): Model {
  return model({
    title: 'm',
    version: '1',
    entities: {
      Thing: {
        sections: [
          {
            attributes: attributes ?? [
              { name: 'id', type: 'string', required: true },
              {
                name: 'kind',
                type: 'string',
                required: true,
                siviCodelist: 'CLX',
                allowedValues: ['A', 'B', 'C'],
                allowedName: 'KindType',
              },
            ],
          },
        ],
      },
    },
    enums: {},
    operations: operations ?? [getThing],
  });
}

const getThing = {
  id: 'getThing',
  method: 'GET',
  path: '/v2/things/{id}',
  parameters: [{ name: 'id', in: 'path', type: 'string', required: true }],
  responses: { '200': { description: 'ok', schema: 'Thing' } },
};

function diffContract(schemas: string, paths: string): string {
  return `{
    "openapi": "3.1.0",
    "info": {"title": "c", "version": "v2"},
    "paths": {${paths}},
    "components": {"schemas": {${schemas}}}
  }`;
}

const thingGetPath = `"/things/{thingId}": {
  "get": {
    "operationId": "getThing",
    "parameters": [{"name": "thingId", "in": "path", "required": true, "schema": {"type": "string"}}],
    "responses": {"200": {"description": "ok", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/Thing"}}}}}
  }
}`;

const thingSchema = (idProps = '', extra = ''): string => `"Thing": {"type": "object", "required": ["id", "kind"], "properties": {
  "id": {"type": "string"${idProps}},
  "kind": {"type": "string", "enum": ["A", "B", "C"], "x-sivi-code": "CLX"}${extra}
}}`;

describe('findings', () => {
  it('matches an operation despite a version prefix and a renamed path parameter', () => {
    const r = runCompare(diffModel(), diffContract(thingSchema(), thingGetPath));
    expect(countCategory(r.findings, 'operation-missing-in-contract')).toBe(0);
    expect(countCategory(r.findings, 'operation-missing-in-model')).toBe(0);
    expect(findFinding(r.findings, 'param-mismatch')?.severity, 'a rename is info').toBe('info');
    expect(findFinding(r.findings, 'enum-values-drift'), 'equal enum values').toBeUndefined();
  });

  it('lists the differing values of enums', () => {
    const contract = diffContract(
      `"Thing": {"type": "object", "required": ["id", "kind"], "properties": {
        "id": {"type": "string"},
        "kind": {"allOf": [{"$ref": "#/components/schemas/KindType"}]}
      }},
      "KindType": {"type": "string", "enum": ["A", "B", "D"], "x-sivi-code": "CLX"}`,
      thingGetPath,
    );
    const f = findFinding(runCompare(diffModel(), contract).findings, 'enum-values-drift', 'KindType');
    expect(f).toMatchObject({ severity: 'error', onlyInModel: ['C'], onlyInContract: ['D'] });
  });

  it('reports type, required and property mismatches', () => {
    const contract = diffContract(
      `"Thing": {"type": "object", "properties": {
        "id": {"type": "integer", "format": "int64"},
        "extra": {"type": "string"}
      }}`,
      thingGetPath,
    );
    const r = runCompare(diffModel([{ name: 'id', type: 'string', required: true }]), contract);
    expect(findFinding(r.findings, 'type-mismatch', 'Thing', 'id')?.severity).toBe('error');
    expect(findFinding(r.findings, 'required-mismatch', 'Thing', 'id')?.severity).toBe('warn');
    expect(findFinding(r.findings, 'property-missing-in-model', 'Thing', 'extra')?.severity).toBe('error');
  });

  it('grades pattern mismatches', () => {
    const m = diffModel([
      { name: 'id', type: 'string', required: true, pattern: '^a$' },
      { name: 'kind', type: 'string', required: true, siviCodelist: 'CLX', allowedValues: ['A', 'B', 'C'], allowedName: 'KindType' },
    ]);
    const run = (idProps: string) => runCompare(m, diffContract(thingSchema(idProps), thingGetPath)).findings;
    expect(findFinding(run(', "pattern": "^b$"'), 'pattern-mismatch', 'Thing', 'id')?.severity, 'both constrain').toBe('warn');
    expect(findFinding(run(''), 'pattern-mismatch', 'Thing', 'id')?.severity, 'one side constrains').toBe('info');
    expect(countCategory(run(', "pattern": "^a$"'), 'pattern-mismatch')).toBe(0);
  });

  it('grades constraint mismatches, item bounds on reference arrays included', () => {
    const m = diffModel([
      { name: 'id', type: 'string', required: true, minLength: 4 },
      { name: 'kind', type: 'string', required: true, siviCodelist: 'CLX', allowedValues: ['A', 'B', 'C'], allowedName: 'KindType' },
      { name: 'parts', type: 'Thing[]', minItems: 1 },
    ]);
    const run = (idProps: string, partsProps: string) =>
      runCompare(
        m,
        diffContract(
          thingSchema(idProps, `, "parts": {"type": "array"${partsProps}, "items": {"$ref": "#/components/schemas/Thing"}}`),
          thingGetPath,
        ),
      ).findings;

    let findings = run(', "minLength": 2', ', "minItems": 2');
    expect(findFinding(findings, 'constraint-mismatch', 'Thing', 'id')).toMatchObject({
      severity: 'warn',
      model: 'minLength=4',
      contract: 'minLength=2',
    });
    expect(findFinding(findings, 'constraint-mismatch', 'Thing', 'parts')?.severity).toBe('warn');

    findings = run('', '');
    expect(findFinding(findings, 'constraint-mismatch', 'Thing', 'id')?.severity).toBe('info');
    expect(findFinding(findings, 'constraint-mismatch', 'Thing', 'parts')?.severity).toBe('info');

    expect(countCategory(run(', "minLength": 4', ', "minItems": 1'), 'constraint-mismatch')).toBe(0);
  });

  it('reports a contract that drops an enum, at the property only', () => {
    const contract = diffContract(
      `"Thing": {"type": "object", "required": ["id", "kind"], "properties": {
        "id": {"type": "string"},
        "kind": {"type": "string"}
      }}`,
      thingGetPath,
    );
    const r = runCompare(diffModel(), contract);
    expect(findFinding(r.findings, 'enum-constraint-drift', 'Thing', 'kind')?.severity).toBe('warn');
    expect(findFinding(r.findings, 'schema-missing-in-contract', 'KindType'), 'covered at the property').toBeUndefined();
  });

  it('grades missing response codes: 4xx warn, 5xx info, model-only warn', () => {
    const path = `"/things/{thingId}": {"get": {
      "operationId": "getThing",
      "parameters": [{"name": "thingId", "in": "path", "required": true, "schema": {"type": "string"}}],
      "responses": {"403": {"description": "forbidden"}, "500": {"description": "boom"}}
    }}`;
    const r = runCompare(
      diffModel(),
      diffContract(
        `"Thing": {"type": "object", "required": ["id", "kind"], "properties": {"id": {"type": "string"}, "kind": {"type": "string", "enum": ["A", "B", "C"]}}}`,
        path,
      ),
    );
    const missing = r.findings.filter((f) => f.category === 'response-code-missing-in-model');
    expect(missing.map((f) => [f.code, f.severity])).toEqual([
      ['403', 'warn'],
      ['500', 'info'],
    ]);
    expect(findFinding(r.findings, 'response-code-missing-in-contract')).toMatchObject({ code: '200', severity: 'warn' });
  });

  it('downgrades the schemas below an unconstrained request body', () => {
    const m = model({
      title: 'm',
      version: '1',
      entities: {
        Root: {
          children: [{ name: 'Leaf', cardinality: '1' }],
          sections: [{ attributes: [{ name: 'leaf', type: 'Leaf', required: true }] }],
        },
        Leaf: { sections: [{ attributes: [{ name: 'x', type: 'string' }] }] },
        Loose: { sections: [{ attributes: [{ name: 'y', type: 'string' }] }] },
      },
      operations: [{ id: 'create', method: 'POST', path: '/things', requestBody: 'Root', responses: { '201': { description: 'ok' } } }],
    });
    const path = `"/things": {"post": {
      "operationId": "create",
      "requestBody": {"content": {"application/json": {"schema": {"type": "object", "unevaluatedProperties": {}}}}},
      "responses": {"201": {"description": "ok"}}
    }}`;
    const r = runCompare(m, diffContract('', path));
    expect(findFinding(r.findings, 'request-body-unconstrained')?.severity).toBe('info');
    for (const name of ['Root', 'Leaf']) expect(findFinding(r.findings, 'schema-missing-in-contract', name)?.severity, name).toBe('info');
    expect(findFinding(r.findings, 'schema-missing-in-contract', 'Loose')?.severity, 'not reachable from the body').toBe('warn');
  });

  it('pairs renamed schemas through operations and properties', () => {
    const m = model({
      title: 'm',
      version: '1',
      entities: {
        MyResult: {
          sections: [
            {
              attributes: [
                { name: 'id', type: 'string', required: true },
                { name: 'sub', type: 'Sub', required: true },
              ],
            },
          ],
        },
        Sub: { sections: [{ attributes: [{ name: 'code', type: 'string', required: true }] }] },
      },
      operations: [{ id: 'create', method: 'POST', path: '/things', responses: { '201': { description: 'ok', schema: 'MyResult' } } }],
    });
    const path = `"/things": {"post": {
      "operationId": "create",
      "responses": {"201": {"description": "ok", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/Ns.OtherResult"}}}}}
    }}`;
    const schemas = `"Ns.OtherResult": {"type": "object", "required": ["id", "sub"], "properties": {
      "id": {"type": "string"},
      "sub": {"allOf": [{"$ref": "#/components/schemas/Ns.SubInfo"}]}
    }},
    "Ns.SubInfo": {"type": "object", "required": ["code"], "properties": {"code": {"type": "string"}}}`;
    const r = runCompare(m, diffContract(schemas, path));
    expect(countCategory(r.findings, 'schema-missing-in-model')).toBe(0);
    expect(countCategory(r.findings, 'schema-missing-in-contract')).toBe(0);
    expect(findFinding(r.findings, 'schema-name-mismatch', 'MyResult')?.contract).toBe('Ns.OtherResult');
    expect(findFinding(r.findings, 'schema-name-mismatch', 'Sub')?.contract).toBe('Ns.SubInfo');
  });

  it('reports a request body cardinality mismatch', () => {
    const m = diffModel(undefined, [
      getThing,
      {
        id: 'create',
        method: 'POST',
        path: '/things',
        requestBody: 'Thing',
        requestBodyArray: false,
        responses: { '201': { description: 'ok' } },
      },
    ]);
    const path = `${thingGetPath},
    "/things": {"post": {
      "operationId": "create",
      "requestBody": {"content": {"application/json": {"schema": {"type": "array", "items": {"$ref": "#/components/schemas/Thing"}}}}},
      "responses": {"201": {"description": "ok"}}
    }}`;
    const r = runCompare(m, diffContract(thingSchema(), path));
    expect(findFinding(r.findings, 'request-body-mismatch')?.severity).toBe('error');
  });

  it('grades metadata operations info and business operations warn', () => {
    const path = `${thingGetPath},
    "/api-docs-json": {"get": {"operationId": "docs", "tags": ["Docs"], "responses": {"200": {"description": "ok"}}}},
    "/other": {"get": {"operationId": "other", "responses": {"200": {"description": "ok"}}}}`;
    const r = runCompare(
      diffModel(),
      diffContract(
        `"Thing": {"type": "object", "required": ["id", "kind"], "properties": {"id": {"type": "string"}, "kind": {"type": "string", "enum": ["A", "B", "C"]}}}`,
        path,
      ),
    );
    const severities = Object.fromEntries(
      r.findings.filter((f) => f.category === 'operation-missing-in-model').map((f) => [f.operation, f.severity]),
    );
    expect(severities).toEqual({ 'GET /api-docs-json': 'info', 'GET /other': 'warn' });
  });
});

describe('determinism', () => {
  it('produces the same report twice', () => {
    const run = () => {
      const r = runCompare(
        diffModel(),
        diffContract(`"Thing": {"type": "object", "properties": {"id": {"type": "integer"}, "extra": {"type": "string"}}}`, thingGetPath),
      );
      return JSON.stringify({ findings: r.findings, stats: r.stats });
    };
    expect(run()).toBe(run());
  });
});

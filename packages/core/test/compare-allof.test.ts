import { describe, expect, it } from 'vitest';
import { normalizeContract, parseOpenApiDocument } from '../src/compare/index.ts';
import { countCategory, findFinding, model, runCompare } from './compare-helpers.ts';

// Base-class extraction in both shapes the flattener handles: Ns.PolyOne is
// what TypeSpec `extends` emits (own properties plus a single-ref allOf),
// Ns.PolyTwo is hand-written multi-member composition. Ns.PolyEmpty is an
// allOf schema without own properties, which used as a body is constrained.
const allOfContract = `{
  "openapi": "3.1.0",
  "info": {"title": "c", "version": "v2"},
  "paths": {
    "/polys/{id}": {
      "get": {
        "operationId": "getPoly",
        "parameters": [{"name": "id", "in": "path", "required": true, "schema": {"type": "string"}}],
        "responses": {
          "200": {"description": "ok", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/Ns.PolyEmpty"}}}}
        }
      }
    }
  },
  "components": {"schemas": {
    "Ns.Poly": {
      "oneOf": [
        {"$ref": "#/components/schemas/Ns.PolyOne"},
        {"$ref": "#/components/schemas/Ns.PolyTwo"}
      ],
      "discriminator": {"propertyName": "entityType"}
    },
    "Ns.PolyBase": {
      "type": "object",
      "required": ["id"],
      "properties": {
        "id": {"type": "string"},
        "shared": {"type": "string"}
      }
    },
    "Ns.PolyOne": {
      "type": "object",
      "required": ["entityType"],
      "properties": {
        "entityType": {"type": "string", "const": "one"},
        "own": {"type": "string"},
        "shared": {"type": "integer"}
      },
      "allOf": [{"$ref": "#/components/schemas/Ns.PolyBase"}]
    },
    "Ns.PolyTwo": {
      "allOf": [
        {"$ref": "#/components/schemas/Ns.PolyBase"},
        {"type": "object", "required": ["entityType"], "properties": {"entityType": {"type": "string", "const": "two"}}}
      ]
    },
    "Ns.PolyEmpty": {"type": "object", "allOf": [{"$ref": "#/components/schemas/Ns.PolyBase"}]}
  }}
}`;

describe('component-level allOf', () => {
  it('flattens base and composition shapes', () => {
    const { ir, findings } = normalizeContract(parseOpenApiDocument(allOfContract));

    const one = ir.schemas.get('PolyOne');
    expect(one?.kind).toBe('object');
    expect(one?.propOrder).toEqual(['entityType', 'id', 'own', 'shared']);
    expect(one?.properties.get('id')?.required, 'required from the base').toBe(true);
    expect(one?.properties.get('entityType')?.required, 'own required').toBe(true);
    expect(one?.properties.get('shared')?.type, 'own property overrides the base').toBe('integer');

    const two = ir.schemas.get('PolyTwo');
    expect(two?.kind).toBe('object');
    expect(two?.propOrder).toEqual(['entityType', 'id', 'shared']);
    expect(two?.properties.get('shared')?.type).toBe('string');

    expect(ir.schemas.get('PolyBase')?.isAllOfBase).toBe(true);
    expect(ir.schemas.get('Poly')).toMatchObject({ kind: 'union', oneOf: ['PolyOne', 'PolyTwo'] });
    expect(findFinding(findings, 'unsupported-shape', 'PolyOne')).toBeUndefined();

    const get = ir.operations.get('GET /polys/{}');
    expect(get?.responses.get('200')?.unconstrained, 'a body ref to an allOf schema is constrained').toBe(false);
    expect(ir.schemas.get('PolyEmpty')?.kind).toBe('object');
  });

  it('falls back on a cycle with an info finding', () => {
    const cyclic = `{
      "openapi": "3.1.0",
      "info": {"title": "c", "version": "v2"},
      "paths": {},
      "components": {"schemas": {
        "Ns.A": {"allOf": [{"$ref": "#/components/schemas/Ns.B"}]},
        "Ns.B": {"allOf": [{"$ref": "#/components/schemas/Ns.A"}]}
      }}
    }`;
    const { ir, findings } = normalizeContract(parseOpenApiDocument(cyclic));
    for (const name of ['A', 'B']) {
      const kind = ir.schemas.get(name)?.kind;
      expect(kind, name).toBeDefined();
      expect(['open', 'object']).not.toContain(kind);
    }
    expect(findFinding(findings, 'unsupported-shape', 'A')).toBeDefined();
  });

  it('pairs a flat model with a base-extracted contract without noise', () => {
    const m = model({
      title: 'm',
      version: '1',
      entities: {
        Poly: {
          sections: [
            {
              attributes: [
                { name: 'entityType', type: 'string', required: true, allowedValues: ['one', 'two'] },
                { name: 'id', type: 'string', required: true },
                { name: 'shared', type: 'string' },
                { name: 'own', type: 'string', applicableSubtypes: ['one'] },
              ],
            },
          ],
        },
      },
    });
    const contract = `{
      "openapi": "3.1.0",
      "info": {"title": "c", "version": "v2"},
      "paths": {},
      "components": {"schemas": {
        "Ns.Poly": {
          "oneOf": [{"$ref": "#/components/schemas/Ns.PolyOne"}, {"$ref": "#/components/schemas/Ns.PolyTwo"}],
          "discriminator": {"propertyName": "entityType"}
        },
        "Ns.PolyBase": {"type": "object", "required": ["id"], "properties": {"id": {"type": "string"}, "shared": {"type": "string"}}},
        "Ns.PolyOne": {"allOf": [
          {"$ref": "#/components/schemas/Ns.PolyBase"},
          {"type": "object", "required": ["entityType"], "properties": {"entityType": {"type": "string", "const": "one"}, "own": {"type": "string"}}}
        ]},
        "Ns.PolyTwo": {"allOf": [
          {"$ref": "#/components/schemas/Ns.PolyBase"},
          {"type": "object", "required": ["entityType"], "properties": {"entityType": {"type": "string", "const": "two"}}}
        ]}
      }}
    }`;
    const r = runCompare(m, contract);
    expect(countCategory(r.findings, 'property-missing-in-contract')).toBe(0);
    expect(countCategory(r.findings, 'property-missing-in-model')).toBe(0);
    expect(findFinding(r.findings, 'schema-missing-in-model', 'PolyBase'), 'a structural base').toBeUndefined();
    expect(findFinding(r.findings, 'schema-kind-mismatch')).toBeUndefined();
  });
});

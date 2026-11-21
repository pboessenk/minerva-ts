import { describe, expect, it } from 'vitest';
import { countCategory, findFinding, model, runCompare } from './compare-helpers.ts';

// The shape an emitter produces for declared scalar types: an array property
// whose items reference a primitive component schema, and a scalar property
// that references another primitive directly.
const scalarRefContract = `{
  "openapi": "3.1.0",
  "info": {"title": "c", "version": "v2"},
  "paths": {},
  "components": {"schemas": {
    "Widget": {
      "type": "object",
      "properties": {
        "partNumber": {"type": "array", "items": {"$ref": "#/components/schemas/WidgetPartNumber"}, "minItems": 1},
        "code": {"$ref": "#/components/schemas/Code"}
      }
    },
    "WidgetPartNumber": {"type": "string", "minLength": 1, "maxLength": 15},
    "Code": {"type": "string", "pattern": "^[A-Z]+$"}
  }}
}`;

const scalarRefModel = (maxLength: number) =>
  model({
    entities: {
      Widget: {
        sections: [
          {
            attributes: [
              { name: 'partNumber', type: 'string[]', minLength: 1, maxLength, minItems: 1 },
              { name: 'code', type: 'string', pattern: '^[A-Z]+$' },
            ],
          },
        ],
      },
    },
  });

describe('primitive component schemas', () => {
  it('compares a reference to a primitive as the inlined type and constraints', () => {
    const r = runCompare(scalarRefModel(15), scalarRefContract);
    for (const category of ['type-mismatch', 'schema-missing-in-model', 'constraint-mismatch', 'pattern-mismatch']) {
      expect(countCategory(r.findings, category), category).toBe(0);
    }
  });

  it('compares element bounds through the reference', () => {
    const r = runCompare(scalarRefModel(20), scalarRefContract);
    expect(findFinding(r.findings, 'constraint-mismatch', 'Widget', 'partNumber')?.severity).toBe('warn');
  });
});

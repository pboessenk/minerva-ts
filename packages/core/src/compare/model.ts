import type { CodelistLookup } from '../catalog/types.ts';
import { DISCRIMINATOR, attributesForSubtype, buildEntityOrder, sortedResponseCodes, subtypesOf } from '../export/entities.ts';
import { allowedTypeName, collectAllowedTypes, emittedEnumNames } from '../export/named-types.ts';
import { subtypeSchemaName } from '../export/naming.ts';
import { constraintMap, hasNamedType } from '../model/constraints.ts';
import type { Attribute, Entity, Model } from '../model/types.ts';
import { toLower, toUpper } from '../text/case.ts';
import { trimSuffix } from '../text/strings.ts';
import { type IrBody, type IrDoc, type IrOperation, type IrProp, type IrSchema, newDoc, newProp, newSchema } from './ir.ts';
import { normalizePath } from './names.ts';

/**
 * Model side of a comparison: the model projected into the IR with the rules
 * of the OpenAPI export (same type mapping, named types and subtype
 * schemas), so the comparison sees the model exactly as that export emits it.
 */

/** OpenAPI type and format of a model type; format `$ref` marks a schema reference. */
function openApiType(type: string, model: Model): [type: string, format: string] {
  switch (toLower(type)) {
    case 'string':
      return ['string', ''];
    case 'boolean':
      return ['boolean', ''];
    case 'number':
      return ['number', 'double'];
    case 'integer':
    case 'int':
      return ['integer', 'int32'];
    case 'date':
      return ['string', 'date'];
  }
  if (model.enums.has(type) || model.entities.has(type)) return [type, '$ref'];
  return ['string', ''];
}

/** One attribute as a property, with the type rules of the OpenAPI export. */
function attributeToProp(entityName: string, a: Attribute, model: Model): IrProp {
  const p = newProp(a.name);
  p.required = a.required;
  p.description = a.description;
  let type = a.type;
  if (type.endsWith('[]')) {
    p.array = true;
    type = trimSuffix(type, '[]');
  }
  // The same applicability rules as the exporters: item bounds survive the
  // references below, element keywords do not.
  const constraints = constraintMap(a);
  if (constraints.size > 0) p.constraints = constraints;
  if (a.siviCodelist !== null) p.siviCode = a.siviCodelist;
  if (hasNamedType(a)) {
    p.ref = allowedTypeName(entityName, a, model);
    return p;
  }
  const [oaType, oaFormat] = openApiType(type, model);
  if (oaFormat === '$ref') {
    p.ref = oaType;
    return p;
  }
  p.type = oaType;
  p.format = a.format !== '' ? a.format : oaFormat;
  if (a.pattern !== '' && oaType === 'string') p.pattern = a.pattern;
  return p;
}

export function normalizeModel(model: Model, codelists: CodelistLookup | null): IrDoc {
  const ir = newDoc(model.title, model.version);
  const addSchema = (s: IrSchema): void => {
    if (ir.schemas.has(s.name)) return;
    ir.schemas.set(s.name, s);
    ir.schemaOrder.push(s.name);
  };

  const entityOrder = buildEntityOrder(model, model.export.primaryRoot);

  for (const entityName of entityOrder) {
    const entity = model.entities.get(entityName) as Entity;
    const subtypes = subtypesOf(entity);

    if (subtypes !== null) {
      // A discriminated union plus one object schema per subtype, as the
      // OpenAPI export emits it.
      const union = newSchema(entityName, entityName, 'union');
      union.description = entity.description;
      union.discriminator = DISCRIMINATOR;
      for (const subtype of subtypes) union.oneOf.push(subtypeSchemaName(entityName, subtype));
      addSchema(union);

      for (const subtype of subtypes) {
        const name = subtypeSchemaName(entityName, subtype);
        const schema = newSchema(name, name, 'object');
        schema.isSubtype = true;
        for (const a of attributesForSubtype(entity, subtype)) {
          let p = attributeToProp(entityName, a, model);
          if (a.name === DISCRIMINATOR) {
            // The discriminator is emitted as a constant: the subtype itself.
            p = newProp(a.name);
            p.type = 'string';
            p.required = a.required;
            p.enumValues = [subtype];
          }
          schema.properties.set(p.name, p);
          schema.propOrder.push(p.name);
        }
        addSchema(schema);
      }
      continue;
    }

    const schema = newSchema(entityName, entityName, 'object');
    schema.description = entity.description;
    for (const section of entity.sections) {
      for (const a of section.attributes) {
        const p = attributeToProp(entityName, a, model);
        schema.properties.set(p.name, p);
        schema.propOrder.push(p.name);
      }
    }
    addSchema(schema);
  }

  // The enums emitted schemas actually reference.
  for (const enumName of emittedEnumNames(model)) {
    const definition = model.enums.get(enumName);
    const schema = newSchema(enumName, enumName, 'enum');
    schema.description = definition?.description ?? '';
    schema.enumValues = (definition?.values ?? []).map((v) => v.value);
    addSchema(schema);
  }

  // Named types: codelist subsets and whole codelists.
  for (const type of collectAllowedTypes(model, entityOrder, codelists)) {
    const schema = newSchema(type.name, type.name, 'enum');
    schema.enumValues = [...type.values];
    if (type.codelist !== null) schema.siviCode = type.codelist;
    addSchema(schema);
  }

  for (const op of model.operations) {
    const irOp: IrOperation = {
      method: toUpper(op.method),
      path: normalizePath(op.path),
      rawPath: op.path,
      operationId: op.id,
      tags: op.tags,
      params: op.parameters.map((p) => ({ name: p.name, in: p.in, required: p.required, type: p.type !== '' ? p.type : 'string' })),
      requestBody: op.requestBody !== '' ? { ref: op.requestBody, array: op.requestBodyArray, unconstrained: false } : null,
      responses: new Map(),
      respOrder: [],
    };
    for (const code of sortedResponseCodes(op)) {
      const response = op.responses.get(code);
      const body: IrBody | null =
        response !== undefined && response.schema !== ''
          ? { ref: response.schema, array: response.responseBodyArray, unconstrained: false }
          : null;
      irOp.responses.set(code, body);
      irOp.respOrder.push(code);
    }
    const key = irOp.method + ' ' + irOp.path;
    if (!ir.operations.has(key)) {
      ir.operations.set(key, irOp);
      ir.opOrder.push(key);
    }
  }

  return ir;
}

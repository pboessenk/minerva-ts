import {
  DISCRIMINATOR,
  JsonDecoder,
  UNTITLED,
  allAttributes,
  allowedTypeName,
  attributeDescription,
  attributesForSubtype,
  baseSchemaDescription,
  baseSchemaName,
  buildEntityOrder,
  codeNote,
  coerceExampleJson,
  collectAllowedTypes,
  compactJson,
  constraintScope,
  emittedEnumNames,
  ensureJsonArray,
  exampleExportName,
  examplesForOperation,
  examplesWithData,
  formatFloat,
  hasAnyCodeNotes,
  hasNamedType,
  indentJson,
  normalizeMarkdownBreaks,
  replaceAll,
  scopedAttributesForSubtype,
  sortStrings,
  sortedResponseCodes,
  stripInternalKeys,
  subtypeDescription,
  subtypeSchemaName,
  subtypesOf,
  takenExportNames,
  toLower,
  trimSpace,
  trimSuffix,
  unscopedAttributes,
  useBaseExtraction,
  type Attribute,
  type Entity,
  type Enum,
  type Model,
} from '@minerva/core';
import type { ExportContext, ExportResult } from './context.ts';

/** Escapes text for a YAML single-quoted scalar; newlines become spaces. */
function yamlEscape(s: string): string {
  return replaceAll(replaceAll(s, "'", "''"), '\n', ' ');
}

/**
 * A `description:` entry. Multi-line text uses a literal block scalar so
 * line breaks survive; single-line text is a quoted scalar.
 */
function yamlDescription(indent: string, text: string): string {
  if (!text.includes('\n')) return `${indent}description: '${yamlEscape(text)}'\n`;
  let out = `${indent}description: |\n`;
  for (const line of normalizeMarkdownBreaks(text).split('\n')) {
    out += line === '' ? '\n' : `${indent}  ${line}\n`;
  }
  return out;
}

/**
 * An example or default as a YAML scalar typed by the attribute: numbers and
 * booleans bare, everything else single-quoted.
 */
function yamlScalar(attributeType: string, value: string): string {
  switch (toLower(attributeType)) {
    case 'number':
    case 'integer':
    case 'int':
      return trimSpace(value);
    case 'boolean':
      return toLower(trimSpace(value));
    default:
      return `'${yamlEscape(value)}'`;
  }
}

/** OpenAPI `type` and `format` of a model type; format `$ref` marks a schema reference. */
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

const ref = (name: string): string => `$ref: '#/components/schemas/${name}'`;

/** String and numeric validation keywords at `indent`. */
function bounds(indent: string, a: Attribute): string {
  const scope = constraintScope(a);
  let out = '';
  if (scope.string) {
    if (a.minLength !== null) out += `${indent}minLength: ${a.minLength}\n`;
    if (a.maxLength !== null) out += `${indent}maxLength: ${a.maxLength}\n`;
  }
  if (scope.numeric) {
    if (a.minimum !== null) out += `${indent}minimum: ${formatFloat(a.minimum)}\n`;
    if (a.exclusiveMinimum !== null) out += `${indent}exclusiveMinimum: ${formatFloat(a.exclusiveMinimum)}\n`;
    if (a.maximum !== null) out += `${indent}maximum: ${formatFloat(a.maximum)}\n`;
    if (a.exclusiveMaximum !== null) out += `${indent}exclusiveMaximum: ${formatFloat(a.exclusiveMaximum)}\n`;
  }
  return out;
}

/** One attribute as a schema property. `indent` is the indentation of the property name. */
function property(ctx: ExportContext, entityName: string, a: Attribute, indent: string): string {
  const { model, lookups } = ctx;
  const k = indent + '  '; // keys of the property
  const n = indent + '    '; // keys of array items
  let out = `${indent}${a.name}:\n`;

  const isArray = a.type.endsWith('[]');
  const elementType = trimSuffix(a.type, '[]');
  let [type, format] = openApiType(elementType, model);
  if (a.format !== '') format = a.format;
  const namedType = hasNamedType(a) ? allowedTypeName(entityName, a, model) : '';

  const scalar = (at: string): string => {
    let s = `${at}type: ${type}\n`;
    if (format !== '') s += `${at}format: ${format}\n`;
    if (a.pattern !== '' && type === 'string') s += `${at}pattern: '${yamlEscape(a.pattern)}'\n`;
    return s + bounds(at, a);
  };

  if (isArray) {
    out += `${k}type: array\n${k}items:\n`;
    if (namedType !== '') out += `${n}${ref(namedType)}\n`;
    else if (format === '$ref') out += `${n}${ref(type)}\n`;
    else out += scalar(n);
    // Item bounds belong to the array itself, whatever the items are.
    if (a.minItems !== null) out += `${k}minItems: ${a.minItems}\n`;
    if (a.maxItems !== null) out += `${k}maxItems: ${a.maxItems}\n`;
  } else if (namedType !== '') {
    out += `${k}${ref(namedType)}\n`;
  } else if (format === '$ref') {
    out += `${k}${ref(type)}\n`;
  } else {
    out += scalar(k);
  }

  const description = attributeDescription(entityName, a, lookups.attributeDescriptions, model);
  if (description !== '') out += `${k}description: '${yamlEscape(description)}'\n`;
  if (a.siviCodelist !== null) out += `${k}x-sivi-code: '${a.siviCodelist}'\n`;
  if (a.example !== '') out += `${k}examples:\n${n}- ${yamlScalar(a.type, a.example)}\n`;
  if (constraintScope(a).default && trimSpace(a.default) !== '') {
    out += `${k}default: ${yamlScalar(a.type, trimSpace(a.default))}\n`;
  }
  return out;
}

/**
 * An example payload under a `value:` key. An object becomes one
 * `key: <compact JSON>` line per member, which is valid YAML flow syntax;
 * anything else is pretty-printed JSON.
 */
function exampleValue(raw: string, indent: string): string {
  const stripped = stripInternalKeys(raw);
  const dec = new JsonDecoder(stripped);
  const first = dec.token();
  if (first === undefined) return `${indent}${stripped}\n`;
  if (first.kind === 'delim' && first.value === '{') {
    let out = '';
    while (dec.more()) {
      const key = dec.token();
      if (key === undefined || key.kind !== 'string') break;
      const value = dec.raw();
      if (value === undefined) break;
      out += `${indent}${key.value}: ${compactJson(value) ?? value}\n`;
    }
    return out;
  }
  return `${indent}${indentJson(stripped, indent, '  ') ?? stripped}\n`;
}

function requiredList(indent: string, names: readonly string[]): string {
  if (names.length === 0) return '';
  return `${indent}required:\n` + names.map((name) => `${indent}  - ${name}\n`).join('');
}

function info(model: Model): string {
  let out = "openapi: '3.1.0'\ninfo:\n";
  out += `  title: '${yamlEscape(model.title !== '' ? model.title : UNTITLED)}'\n`;
  out += `  version: '${model.version}'\n`;
  if (model.subtitle !== '') out += yamlDescription('  ', model.subtitle);
  const contact = model.contact;
  if (contact !== null && (contact.name !== '' || contact.email !== '' || contact.url !== '')) {
    out += '  contact:\n';
    if (contact.name !== '') out += `    name: '${yamlEscape(contact.name)}'\n`;
    if (contact.email !== '') out += `    email: '${yamlEscape(contact.email)}'\n`;
    if (contact.url !== '') out += `    url: '${yamlEscape(contact.url)}'\n`;
  }
  if (model.servers.length > 0) {
    out += 'servers:\n';
    for (const server of model.servers) {
      out += `  - url: '${yamlEscape(server.url)}'\n`;
      if (server.description !== '') out += `    description: '${yamlEscape(server.description)}'\n`;
    }
  }
  const tags = sortStrings(new Set(model.operations.flatMap((operation) => operation.tags)));
  if (tags.length > 0) {
    out += 'tags:\n' + tags.map((tag) => `  - name: '${yamlEscape(tag)}'\n`).join('');
  }
  return out;
}

function paths(model: Model): string {
  if (model.operations.length === 0) return 'paths: {}\n';
  let out = 'paths:\n';
  for (const operation of model.operations) {
    const examples = examplesForOperation(model, operation.id);
    out += `  ${operation.path}:\n    ${toLower(operation.method)}:\n`;
    if (operation.summary !== '') out += `      summary: '${yamlEscape(operation.summary)}'\n`;
    if (operation.description !== '') out += yamlDescription('      ', operation.description);
    if (operation.tags.length > 0) {
      out += '      tags:\n' + operation.tags.map((tag) => `        - '${yamlEscape(tag)}'\n`).join('');
    }

    if (operation.parameters.length > 0) {
      out += '      parameters:\n';
      for (const parameter of operation.parameters) {
        out += `        - name: ${parameter.name}\n          in: ${parameter.in}\n`;
        if (parameter.required) out += '          required: true\n';
        out += `          schema:\n            type: ${parameter.type !== '' ? parameter.type : 'string'}\n`;
        if (parameter.description !== '') out += `          description: '${yamlEscape(parameter.description)}'\n`;
        const withValue = examples.filter((ex) => (ex.parameterValues.get(parameter.name) ?? '') !== '');
        if (withValue.length > 0) {
          out += '          examples:\n';
          for (const ex of withValue) {
            out += `            ${exampleExportName(ex)}:\n`;
            out += `              value: '${yamlEscape(ex.parameterValues.get(parameter.name) as string)}'\n`;
          }
        }
      }
    }

    if (operation.requestBody !== '') {
      out += '      requestBody:\n        required: true\n        content:\n          application/json:\n            schema:\n';
      if (operation.requestBodyArray) {
        out += `              type: array\n              items:\n                ${ref(operation.requestBody)}\n`;
      } else {
        out += `              ${ref(operation.requestBody)}\n`;
      }
      // Response-only examples are skipped: they would be a name without a value.
      const requestExamples = examplesWithData(examples, 'request');
      if (requestExamples.length > 0) {
        out += '            examples:\n';
        for (const ex of requestExamples) {
          let data = ex.request as string;
          if (operation.requestBodyArray) data = ensureJsonArray(data);
          data = coerceExampleJson(data, operation.requestBody, model);
          out += `              ${exampleExportName(ex)}:\n`;
          out += `                summary: '${yamlEscape(ex.summary)}'\n`;
          out += '                value:\n' + exampleValue(data, '                  ');
        }
      }
    }

    out += '      responses:\n';
    for (const code of sortedResponseCodes(operation)) {
      const response = operation.responses.get(code)!;
      out += `        '${code}':\n          description: '${yamlEscape(response.description)}'\n`;
      if (response.schema === '') continue;
      out += '          content:\n            application/json:\n              schema:\n';
      if (response.responseBodyArray) {
        out += `                type: array\n                items:\n                  ${ref(response.schema)}\n`;
      } else {
        out += `                ${ref(response.schema)}\n`;
      }
      // An example without a response code belongs to the success responses.
      const responseExamples = examplesWithData(examples, 'response').filter(
        (ex) => ex.responseCode === code || (ex.responseCode === '' && code.startsWith('2')),
      );
      if (responseExamples.length > 0) {
        out += '              examples:\n';
        for (const ex of responseExamples) {
          let data = ex.response as string;
          if (response.responseBodyArray) data = ensureJsonArray(data);
          data = coerceExampleJson(data, response.schema, model);
          out += `                ${exampleExportName(ex)}:\n`;
          out += `                  summary: '${yamlEscape(ex.summary)}'\n`;
          out += '                  value:\n' + exampleValue(data, '                    ');
        }
      }
    }
  }
  return out;
}

/** The pinned discriminator property of one subtype schema. */
function discriminatorProperty(ctx: ExportContext, entityName: string, a: Attribute, subtype: string, indent: string): string {
  let out = `${indent}${DISCRIMINATOR}:\n${indent}  type: string\n${indent}  const: '${subtype}'\n`;
  const description = attributeDescription(entityName, a, ctx.lookups.attributeDescriptions, ctx.model);
  if (description !== '') out += `${indent}  description: '${yamlEscape(description)}'\n`;
  return out;
}

function entitySchemas(ctx: ExportContext, entityOrder: readonly string[]): string {
  const { model, lookups } = ctx;
  const taken = takenExportNames(model, entityOrder, lookups.codelists);
  let out = '';

  for (const entityName of entityOrder) {
    const entity = model.entities.get(entityName) as Entity;
    const subtypes = subtypesOf(entity);

    if (subtypes === null) {
      out += `    ${entityName}:\n      type: object\n`;
      if (entity.description !== '') out += yamlDescription('      ', entity.description);
      const attributes = allAttributes(entity);
      out += requiredList(
        '      ',
        attributes.filter((a) => a.required).map((a) => a.name),
      );
      out += '      properties:\n';
      for (const a of attributes) out += property(ctx, entityName, a, '        ');
      continue;
    }

    // A discriminated entity: a oneOf wrapper plus one schema per subtype.
    out += `    ${entityName}:\n`;
    if (entity.description !== '') out += yamlDescription('      ', entity.description);
    out += '      oneOf:\n';
    for (const subtype of subtypes) out += `        - ${ref(subtypeSchemaName(entityName, subtype))}\n`;
    out += `      discriminator:\n        propertyName: ${DISCRIMINATOR}\n        mapping:\n`;
    for (const subtype of subtypes) {
      out += `          ${subtype}: '#/components/schemas/${subtypeSchemaName(entityName, subtype)}'\n`;
    }

    // Variant descriptions lead with the discriminator value: documentation
    // tools list oneOf variants anonymously.
    const variantDescription = (subtype: string): string =>
      yamlEscape(`EntityType: ${subtype}. ${subtypeDescription(entityName, subtype, lookups.subtypeDescriptions)}`);

    if (useBaseExtraction(entityName, entity, taken)) {
      // Shared attributes are defined once in a base schema. Each variant
      // references it and adds the discriminator pin and its own attributes.
      const baseName = baseSchemaName(entityName);
      const baseAttributes = unscopedAttributes(entity);
      out += `    ${baseName}:\n      type: object\n`;
      out += `      description: '${yamlEscape(baseSchemaDescription(entityName))}'\n`;
      out += requiredList(
        '      ',
        baseAttributes.filter((a) => a.required).map((a) => a.name),
      );
      out += '      properties:\n';
      for (const a of baseAttributes) out += property(ctx, entityName, a, '        ');

      for (const subtype of subtypes) {
        const scoped = scopedAttributesForSubtype(entity, subtype);
        const discriminator = attributesForSubtype(entity, subtype).find((a) => a.name === DISCRIMINATOR);
        out += `    ${subtypeSchemaName(entityName, subtype)}:\n`;
        out += `      description: '${variantDescription(subtype)}'\n`;
        out += `      allOf:\n        - ${ref(baseName)}\n        - type: object\n`;
        const required = scoped.filter((a) => a.required).map((a) => a.name);
        if (discriminator?.required === true) required.unshift(DISCRIMINATOR);
        out += requiredList('          ', required);
        out += '          properties:\n';
        if (discriminator !== undefined) {
          out += discriminatorProperty(ctx, entityName, discriminator, subtype, '            ');
        }
        for (const a of scoped) out += property(ctx, entityName, a, '            ');
      }
    } else {
      // Nothing is shared beyond the discriminator (or the base name is
      // taken): each variant carries all of its attributes.
      for (const subtype of subtypes) {
        const attributes = attributesForSubtype(entity, subtype);
        out += `    ${subtypeSchemaName(entityName, subtype)}:\n      type: object\n`;
        out += `      description: '${variantDescription(subtype)}'\n`;
        out += requiredList(
          '      ',
          attributes.filter((a) => a.required).map((a) => a.name),
        );
        out += '      properties:\n';
        for (const a of attributes) {
          out +=
            a.name === DISCRIMINATOR
              ? discriminatorProperty(ctx, entityName, a, subtype, '        ')
              : property(ctx, entityName, a, '        ');
        }
      }
    }
  }
  return out;
}

/** Enums referenced by emitted schemas, with a Markdown table of their values. */
function enumSchemas(model: Model): string {
  let out = '';
  for (const enumName of emittedEnumNames(model)) {
    const enumeration = model.enums.get(enumName) as Enum;
    out += `    ${enumName}:\n      x-schema-group: codelist\n      type: string\n`;
    if (enumeration.values.some((v) => v.label !== '' || v.description !== '')) {
      out += '      description: |\n';
      if (enumeration.description !== '') out += `        ${enumeration.description}\n\n`;
      out += '        | Code | Description |\n        |------|-------------|\n';
      for (const v of enumeration.values) {
        out += `        | ${v.value} | ${v.label !== '' ? v.label : v.description} |\n`;
      }
    } else if (enumeration.description !== '') {
      out += `      description: '${yamlEscape(enumeration.description)}'\n`;
    }
    out += '      enum:\n' + enumeration.values.map((v) => `        - '${yamlEscape(v.value)}'\n`).join('');
  }
  return out;
}

/** Named value types: codelists and subsets of them. */
function allowedTypeSchemas(ctx: ExportContext, entityOrder: readonly string[]): string {
  const { model, lookups } = ctx;
  let out = '';
  for (const type of collectAllowedTypes(model, entityOrder, lookups.codelists)) {
    out += `    ${type.name}:\n      x-schema-group: codelist\n`;
    if (type.codelist !== null) out += `      x-sivi-code: '${type.codelist}'\n`;
    out += '      type: string\n';

    const codes = type.codelist !== null ? lookups.codelists?.get(type.codelist) : undefined;
    if (codes !== undefined && type.values.some((v) => codes.has(v))) {
      const codelist = type.codelist as string;
      out += '      description: |\n';
      const description = lookups.codelistDescriptions?.get(codelist);
      if (description !== undefined) out += `        ${description}\n\n`;
      const withNotes = hasAnyCodeNotes(lookups.codeNotes, codelist, type.values);
      out += withNotes
        ? '        | Code | Description | Notes |\n        |------|-------------|-------|\n'
        : '        | Code | Description |\n        |------|-------------|\n';
      for (const v of type.values) {
        const text = codes.get(v) ?? '';
        out += withNotes ? `        | ${v} | ${text} | ${codeNote(lookups.codeNotes, codelist, v)} |\n` : `        | ${v} | ${text} |\n`;
      }
    } else if (type.codelist !== null) {
      out += `      description: 'SIVI codelist ${yamlEscape(type.codelist)}'\n`;
    }
    out += '      enum:\n' + type.values.map((v) => `        - '${yamlEscape(v)}'\n`).join('');
  }
  return out;
}

/** OpenAPI 3.1 export, as YAML. */
export function exportOpenApi(ctx: ExportContext): ExportResult {
  const { model, settings } = ctx;
  const entityOrder = buildEntityOrder(model, settings.primaryRoot);
  const secured = model.security !== null && model.security.enabled;

  let out = info(model) + paths(model) + 'components:\n';
  if (secured && model.security !== null) {
    out += '  securitySchemes:\n    bearerAuth:\n      type: http\n      scheme: bearer\n';
    if (model.security.bearerFormat !== '') out += `      bearerFormat: ${model.security.bearerFormat}\n`;
    if (model.security.description !== '') out += `      description: '${yamlEscape(model.security.description)}'\n`;
  }
  out += '  schemas:\n';
  out += entitySchemas(ctx, entityOrder);
  out += enumSchemas(model);
  out += allowedTypeSchemas(ctx, entityOrder);
  if (secured) out += 'security:\n  - bearerAuth: []\n';

  return { body: out, contentType: 'text/yaml; charset=utf-8', filename: settings.filenames.openapi };
}

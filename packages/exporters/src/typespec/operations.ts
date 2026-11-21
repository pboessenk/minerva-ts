import {
  UNTITLED,
  ensureJsonArray,
  examplesForOperation,
  hasExampleData,
  normalizeMarkdownBreaks,
  sliceBytes,
  sortedResponseCodes,
  toLower,
  toUpper,
  type Example,
  type Model,
  type Operation,
  type Parameter,
} from '@minerva/core';
import { docBlock, escapeText } from './text.ts';
import type { ExampleFormatter } from './values.ts';

/** Depth at which example bodies sit inside an `@opExample` decorator. */
const EXAMPLE_BODY_DEPTH = 3;

/**
 * `@service`, `@info` and the namespace documentation, then the namespace
 * itself. Only emitted for a model with operations.
 */
export function service(model: Model, namespace: string): string {
  let out = `@service(#{\n  title: "${escapeText(model.title !== '' ? model.title : UNTITLED)}"\n})\n`;

  const contact = model.contact;
  const hasContact = contact !== null && (contact.name !== '' || contact.email !== '' || contact.url !== '');
  if (model.version !== '' || hasContact) {
    out += '@info(#{\n';
    if (model.version !== '') out += `  version: "${escapeText(model.version)}",\n`;
    if (hasContact) {
      out += '  contact: #{\n';
      if (contact.name !== '') out += `    name: "${escapeText(contact.name)}",\n`;
      if (contact.email !== '') out += `    email: "${escapeText(contact.email)}",\n`;
      if (contact.url !== '') out += `    url: "${escapeText(contact.url)}",\n`;
      out += '  },\n';
    }
    out += '})\n';
  }

  // The namespace's @doc becomes info.description in the compiled OpenAPI.
  if (model.subtitle.includes('\n')) {
    out += '@doc("""\n';
    for (const line of normalizeMarkdownBreaks(model.subtitle).split('\n')) out += `  ${line}\n`;
    out += '  """)\n';
  } else if (model.subtitle !== '') {
    out += `@doc("${escapeText(model.subtitle)}")\n`;
  }

  return out + `namespace ${namespace};\n\n`;
}

/** A response with a body, emitted as a wrapper model that carries the status code. */
interface ResponseModel {
  code: string;
  name: string;
  body: string;
  description: string;
}

/** The wrapper models of an operation's responses with a body, in status-code order. */
function responseModels(operation: Operation): ResponseModel[] {
  // The first byte, as in toPascalCase.
  const pascalId = toUpper(sliceBytes(operation.id, 0, 1)) + sliceBytes(operation.id, 1);
  const out: ResponseModel[] = [];
  for (const code of sortedResponseCodes(operation)) {
    const response = operation.responses.get(code)!;
    if (response.schema === '') continue;
    out.push({
      code,
      name: `${pascalId}Response${code}`,
      body: response.schema + (response.responseBodyArray ? '[]' : ''),
      description: response.description,
    });
  }
  return out;
}

function responseModel(response: ResponseModel): string {
  const doc = response.description !== '' ? `@doc("${escapeText(response.description)}")\n` : '';
  return (
    `${doc}model ${response.name} {\n` + `  @statusCode statusCode: ${response.code};\n` + `  @body body: ${response.body};\n` + '}\n\n'
  );
}

/** A type-appropriate stand-in for a parameter the example gives no value for. */
function parameterPlaceholder(parameter: Parameter): string {
  switch (parameter.type) {
    case 'integer':
    case 'int32':
    case 'int64':
      return '0';
    case 'boolean':
      return 'true';
    case 'number':
    case 'float':
    case 'double':
      return '0.0';
    default:
      return '"example"';
  }
}

/**
 * The response an example is shown under: the one with its status code when
 * that response has a body, else the first response with a body.
 */
function exampleResponse(operation: Operation, example: Example): { code: string; schema: string; isArray: boolean } {
  const own = example.responseCode !== '' ? operation.responses.get(example.responseCode) : undefined;
  if (own !== undefined && own.schema !== '') {
    return { code: example.responseCode, schema: own.schema, isArray: own.responseBodyArray };
  }
  for (const code of sortedResponseCodes(operation)) {
    const response = operation.responses.get(code)!;
    if (response.schema !== '') return { code, schema: response.schema, isArray: response.responseBodyArray };
  }
  return { code: example.responseCode, schema: '', isArray: false };
}

/**
 * One `@opExample` decorator, or nothing for an example without data.
 *
 * `parameters` is optional, but once present it must type-check against the
 * whole operation signature: a placeholder body fails when the body model
 * has required properties. A response-only example therefore leaves the
 * parameters out entirely.
 */
function opExample(operation: Operation, example: Example, formatter: ExampleFormatter): string {
  const hasRequest = hasExampleData(example.request);
  const hasResponse = hasExampleData(example.response);
  if (!hasRequest && !hasResponse) return '';

  let out = '@opExample(\n  #{\n';
  if (hasRequest) {
    out += '    parameters: #{\n';
    for (const parameter of operation.parameters) {
      const value = example.parameterValues.get(parameter.name) ?? '';
      const literal = value !== '' ? `"${escapeText(value)}"` : parameterPlaceholder(parameter);
      out += `      ${parameter.name}: ${literal},\n`;
    }
    let data = example.request as string;
    if (operation.requestBodyArray) data = ensureJsonArray(data);
    out += `      body: ${formatter.format(data, operation.requestBody, EXAMPLE_BODY_DEPTH)}\n`;
    out += '    },\n';
  }
  if (hasResponse) {
    const response = exampleResponse(operation, example);
    let data = example.response as string;
    if (response.isArray) data = ensureJsonArray(data);
    out += '    returnType: #{\n';
    out += `      statusCode: ${response.code},\n`;
    out += `      body: ${formatter.format(data, response.schema, EXAMPLE_BODY_DEPTH)}\n`;
    out += '    }\n';
  }
  return out + `  },\n  #{ title: "${escapeText(example.summary)}" }\n)\n`;
}

const PARAMETER_DECORATORS: ReadonlyMap<string, string> = new Map([
  ['path', '@path '],
  ['query', '@query '],
  ['header', '@header '],
]);

function signature(operation: Operation): string {
  const parts = operation.parameters.map((p) => `${PARAMETER_DECORATORS.get(p.in) ?? ''}${p.name}: ${p.type !== '' ? p.type : 'string'}`);
  if (operation.requestBody !== '') {
    parts.push(`@body body: ${operation.requestBody}${operation.requestBodyArray ? '[]' : ''}`);
  }
  return parts.join(', ');
}

/**
 * One operation: its response wrapper models, then the operation with its
 * documentation, tags, examples and route. The return type is the union of
 * the wrappers.
 */
function operationDeclaration(model: Model, operation: Operation, formatter: ExampleFormatter): string {
  const responses = responseModels(operation);
  let out = responses.map(responseModel).join('');
  if (operation.description !== '') out += docBlock(operation.description);
  for (const tag of operation.tags) out += `@tag("${escapeText(tag)}")\n`;
  for (const example of examplesForOperation(model, operation.id)) out += opExample(operation, example, formatter);
  out += `@route("${operation.path}")\n@${toLower(operation.method)}\n`;
  const returnType = responses.length === 0 ? 'void' : responses.map((r) => r.name).join(' | ');
  return out + `op ${operation.id}(${signature(operation)}): ${returnType};\n\n`;
}

export function operations(model: Model, formatter: ExampleFormatter): string {
  return model.operations.map((operation) => operationDeclaration(model, operation, formatter)).join('');
}

import {
  ensureJsonArray,
  exampleExportName,
  hasExampleData,
  type Example,
  type Model,
  type Operation,
  type OperationResponse,
} from '@minerva/core';
import { formatExampleLiteral, literalTypes, type LiteralTypes } from './literal.ts';
import { firstResponseWithBody, requestBodyType, responseBodyType } from './operations.ts';

/**
 * The response an example shows: the one with the example's status code,
 * else (no code given) the first one with a body. `undefined` when that
 * response has no body.
 */
function exampleResponse(operation: Operation | undefined, example: Example): OperationResponse | undefined {
  if (operation === undefined) return undefined;
  const response = example.responseCode !== '' ? operation.responses.get(example.responseCode) : firstResponseWithBody(operation);
  return response !== undefined && response.schema !== '' ? response : undefined;
}

/**
 * One example as typed constants: `<name>` for the request and
 * `<name>Response` for the response, each only when it holds data.
 */
function exampleConstants(model: Model, example: Example, types: LiteralTypes): string {
  const operation = model.operations.find((op) => op.id === example.operationId);
  let out = example.summary !== '' ? `/** ${example.summary} */\n` : '';
  const name = exampleExportName(example);

  if (hasExampleData(example.request)) {
    const operationBody = operation !== undefined ? requestBodyType(operation) : '';
    const type = operationBody !== '' ? operationBody : 'unknown';
    let data = example.request as string;
    if (type.endsWith('[]')) data = ensureJsonArray(data);
    out += `export const ${name}: ${type} = ${formatExampleLiteral(data, type, types)};\n\n`;
  }

  if (hasExampleData(example.response)) {
    // Without a body type the annotation is left empty.
    const response = exampleResponse(operation, example);
    const type = response !== undefined ? responseBodyType(response) : '';
    let data = example.response as string;
    if (response?.responseBodyArray === true) data = ensureJsonArray(data);
    out += `export const ${name}Response: ${type} = ${formatExampleLiteral(data, type, types)};\n\n`;
  }
  return out;
}

/** Every example of the model as typed constants. */
export function exampleDeclarations(model: Model): string {
  if (model.examples.length === 0) return '';
  const types = literalTypes(model);
  return '// ── Operation Examples ──\n\n' + model.examples.map((ex) => exampleConstants(model, ex, types)).join('');
}

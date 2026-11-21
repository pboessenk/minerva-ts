import { UNTITLED, quote, sortedResponseCodes, type Model, type Operation, type OperationResponse } from '@minerva/core';

/** The leading comment block: title, subtitle lines, version. */
export function header(model: Model): string {
  let out = `// ${model.title !== '' ? model.title : UNTITLED}\n`;
  if (model.subtitle !== '') {
    for (const line of model.subtitle.split('\n')) out += line === '' ? '//\n' : `// ${line}\n`;
  }
  return out + `// Version: ${model.version}  Last Modified: ${model.lastModified}\n\n`;
}

/** The servers as a `const` array, or nothing when there are none. */
export function servers(model: Model): string {
  if (model.servers.length === 0) return '';
  let out = 'export const servers = [\n';
  for (const server of model.servers) {
    out += `  { url: ${quote(server.url)}, description: ${quote(server.description)} },\n`;
  }
  return out + '] as const;\n\n';
}

/** The response with the lowest status code that has a body. */
export function firstResponseWithBody(operation: Operation): OperationResponse | undefined {
  for (const code of sortedResponseCodes(operation)) {
    const response = operation.responses.get(code) as OperationResponse;
    if (response.schema !== '') return response;
  }
  return undefined;
}

/** The TypeScript type of a response body, e.g. `Order` or `Order[]`. */
export function responseBodyType(response: OperationResponse): string {
  return response.responseBodyArray ? response.schema + '[]' : response.schema;
}

/** The TypeScript type of an operation's request body, or an empty string when it has none. */
export function requestBodyType(operation: Operation): string {
  if (operation.requestBody === '') return '';
  return operation.requestBodyArray ? operation.requestBody + '[]' : operation.requestBody;
}

/** Parameter types are written as declared; `integer` becomes `number`, a missing type `string`. */
function parameterType(type: string): string {
  if (type === 'integer') return 'number';
  if (type === '') return 'string';
  return type;
}

function signature(operation: Operation): string {
  let out = '';
  if (operation.description !== '') {
    out += `/** ${operation.method} ${operation.path} — ${operation.description} */\n`;
  }
  const parts = operation.parameters.map((p) => `${p.name}: ${parameterType(p.type)}`);
  const body = requestBodyType(operation);
  if (body !== '') parts.push(`body: ${body}`);
  const response = firstResponseWithBody(operation);
  const returnType = response !== undefined ? responseBodyType(response) : 'void';
  return out + `export declare function ${operation.id}(${parts.join(', ')}): Promise<${returnType}>;\n\n`;
}

/** One function declaration per operation. */
export function operationSignatures(model: Model): string {
  if (model.operations.length === 0) return '';
  return '// ── API Operations ──\n\n' + model.operations.map(signature).join('');
}

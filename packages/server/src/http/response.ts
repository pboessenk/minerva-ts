import type { IncomingMessage, ServerResponse } from 'node:http';
import { gzipSync } from 'node:zlib';

/** A complete response. Handlers return one of these; nothing is streamed. */
export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: Buffer;
}

export function respond(status: number, contentType: string, body: string | Buffer, headers: Record<string, string> = {}): HttpResponse {
  return {
    status,
    headers: { 'Content-Type': contentType, ...headers },
    body: typeof body === 'string' ? Buffer.from(body, 'utf8') : body,
  };
}

/** A plain-text error: the message followed by a newline. */
export function textError(status: number, message: string): HttpResponse {
  return respond(status, 'text/plain; charset=utf-8', message + '\n', { 'X-Content-Type-Options': 'nosniff' });
}

export const notFound = (): HttpResponse => textError(404, '404 page not found');
export const methodNotAllowed = (): HttpResponse => textError(405, 'Method not allowed');

export function json(status: number, body: string): HttpResponse {
  return respond(status, 'application/json', body);
}

/** Reads the whole request body. */
export function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Writes a response, gzip-compressed for clients that accept it. Reference
 * data runs to megabytes of JSON, so compression matters even on localhost.
 */
export function send(req: IncomingMessage, res: ServerResponse, response: HttpResponse): void {
  const acceptsGzip = String(req.headers['accept-encoding'] ?? '').includes('gzip');
  const headers: Record<string, string> = { ...response.headers };
  let body = response.body;
  if (acceptsGzip) {
    headers['Content-Encoding'] = 'gzip';
    body = gzipSync(body);
  }
  headers['Content-Length'] = String(body.length);
  res.writeHead(response.status, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

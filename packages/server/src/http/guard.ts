import type { IncomingHttpHeaders } from 'node:http';
import { type HttpResponse, textError } from './response.ts';

/**
 * Keeps other websites away from the local server.
 *
 * The server listens on localhost only, but a browser will still send
 * requests to it on behalf of any page the user has open:
 *
 *  - A cross-site form or `fetch` can POST to `/api/save` and overwrite a
 *    model. Browsers mark such requests with an `Origin` (and usually a
 *    `Sec-Fetch-Site`) header, and a plain form cannot send JSON.
 *  - A DNS-rebinding page reaches the server under its own host name, so the
 *    `Host` header names that site instead of localhost.
 *
 * Every request must therefore name a loopback host, and every request that
 * changes something must come from the editor's own origin (or from a
 * non-browser client, which sends no `Origin` at all) and carry JSON.
 */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const SAFE_METHODS = new Set(['GET', 'HEAD']);

/** Returns the response that refuses the request, or `undefined` to let it through. */
export function guardRequest(method: string, headers: IncomingHttpHeaders): HttpResponse | undefined {
  const host = headers.host;
  if (host === undefined || !LOOPBACK_HOSTS.has(hostname(host))) {
    return textError(403, 'Forbidden: the server only answers requests addressed to localhost');
  }
  if (SAFE_METHODS.has(method)) return undefined;

  const site = headers['sec-fetch-site'];
  if (site !== undefined && site !== 'same-origin' && site !== 'none') {
    return textError(403, 'Forbidden: cross-site request');
  }
  const origin = headers.origin;
  if (origin !== undefined && !isSameOrigin(origin, host)) {
    return textError(403, 'Forbidden: cross-origin request');
  }
  // Only POST can be sent cross-site without a CORS preflight, so only POST
  // needs the JSON rule; other methods go on to their route's 405.
  const contentType = (headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase();
  if (method === 'POST' && contentType !== 'application/json') {
    return textError(415, 'Unsupported Media Type: send the request body as application/json');
  }
  return undefined;
}

/** The host name of a `Host` header value, without its port. */
function hostname(host: string): string {
  if (host.startsWith('[')) return host.slice(0, host.indexOf(']') + 1);
  return host.split(':')[0] ?? '';
}

function isSameOrigin(origin: string, host: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && url.host === host;
  } catch {
    return false; // includes the opaque origin "null"
  }
}

/**
 * Names and paths as both sides of a comparison are matched on.
 */

/** A leading version segment such as `v1` or `v12`. */
function isVersionSegment(segment: string): boolean {
  return /^v[0-9]+$/.test(segment);
}

/**
 * Strips a trailing slash and one leading version segment, and anonymizes
 * path parameters, so `/v2/orders/{orderId}` matches `/orders/{id}`: both
 * become `/orders/{}`.
 */
export function normalizePath(path: string): string {
  const p = path.endsWith('/') ? path.slice(0, -1) : path;
  if (p === '') return '/';
  let segments = (p.startsWith('/') ? p.slice(1) : p).split('/');
  if (segments.length > 0 && isVersionSegment(segments[0] as string)) segments = segments.slice(1);
  segments = segments.map((s) => (s.startsWith('{') && s.endsWith('}') ? '{}' : s));
  return '/' + segments.join('/');
}

/** Strips a namespace prefix: `Ns.Document` -> `Document`. */
export function canonicalSchemaName(raw: string): string {
  const dot = raw.lastIndexOf('.');
  return dot >= 0 ? raw.slice(dot + 1) : raw;
}

const LOCAL_REF = '#/components/schemas/';

/** The raw schema name of a local `$ref`, or an empty string for an external or unsupported one. */
export function refSchemaName(ref: string): string {
  return ref.startsWith(LOCAL_REF) ? ref.slice(LOCAL_REF.length) : '';
}

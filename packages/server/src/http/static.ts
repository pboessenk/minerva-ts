import { readFileSync, statSync } from 'node:fs';
import { extname, join, posix, sep } from 'node:path';
import { type HttpResponse, notFound, respond } from './response.ts';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.htm': 'text/html; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.mjs': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.xml': 'text/xml; charset=utf-8',
};

function contentType(path: string, content: Buffer): string {
  const known = CONTENT_TYPES[extname(path).toLowerCase()];
  if (known !== undefined) return known;
  // Unknown extension: text unless the start of the file says otherwise.
  return content.subarray(0, 512).includes(0) ? 'application/octet-stream' : 'text/plain; charset=utf-8';
}

/**
 * Resolves "." and ".." in the part of a URL path below a mount point. The
 * result never climbs above the mount: `../x` is `x`.
 */
export function cleanRelativePath(relativePath: string): string {
  return posix.normalize('/' + relativePath).slice(1);
}

/**
 * Serves one file from `root`. `relativePath` is the URL path below the
 * mount point, percent-decoded and cleaned with {@link cleanRelativePath}.
 *
 * Only regular files are served; directories are not listed. Responses are
 * marked `no-store` so edits on disk show up without a hard refresh.
 */
export function serveFile(root: string, relativePath: string): HttpResponse {
  const segments = relativePath.split('/');
  if (segments.includes('..') || relativePath.includes('\0') || (sep === '\\' && relativePath.includes('\\'))) {
    return notFound();
  }

  const path = join(root, ...segments.filter((s) => s !== '' && s !== '.'));
  let content: Buffer;
  let modified: Date;
  try {
    const stat = statSync(path);
    if (!stat.isFile()) return notFound();
    content = readFileSync(path);
    modified = stat.mtime;
  } catch {
    return notFound();
  }
  return respond(200, contentType(path, content), content, {
    'Cache-Control': 'no-store',
    'Accept-Ranges': 'bytes',
    'Last-Modified': modified.toUTCString(),
  });
}

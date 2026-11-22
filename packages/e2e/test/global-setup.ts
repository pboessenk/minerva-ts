import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DIST_DIR, buildApp } from '@minerva/web/build';

/**
 * Builds the minified editor once, as `pnpm build` does. The tests serve it
 * with `prebuiltEditor`, so they run the bundle that ships. Each file is
 * written to a temporary name and renamed, so a run that starts at the same
 * moment never serves a half-written bundle.
 */
export default async function globalSetup(): Promise<void> {
  const { js, map } = await buildApp({ minify: true });
  mkdirSync(DIST_DIR, { recursive: true });
  for (const [name, content] of [
    ['app.js', js],
    ['app.js.map', map],
  ] as const) {
    const tmp = join(DIST_DIR, `.${name}.${process.pid}.tmp`);
    writeFileSync(tmp, content);
    renameSync(tmp, join(DIST_DIR, name));
  }
}

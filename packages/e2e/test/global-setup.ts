import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DIST_DIR, buildApp } from '@minerva/web/build';

/**
 * Builds the minified editor once, as `pnpm build` does. The tests serve it
 * with `prebuiltEditor`, so they run the bundle that ships.
 */
export default async function globalSetup(): Promise<void> {
  const { js, map } = await buildApp({ minify: true });
  mkdirSync(DIST_DIR, { recursive: true });
  writeFileSync(join(DIST_DIR, 'app.js'), js);
  writeFileSync(join(DIST_DIR, 'app.js.map'), map);
}

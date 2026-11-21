#!/usr/bin/env node
/**
 * `pnpm build`: writes the minified editor to packages/web/dist, for
 * `minerva --prebuilt`, which then serves it without building anything.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DIST_DIR, buildApp } from './build.ts';

const { js, map } = await buildApp({ minify: true });
mkdirSync(DIST_DIR, { recursive: true });
writeFileSync(join(DIST_DIR, 'app.js'), js);
writeFileSync(join(DIST_DIR, 'app.js.map'), map);
process.stdout.write(`Wrote ${join(DIST_DIR, 'app.js')} (${Math.round(js.length / 1024)} KiB)\n`);

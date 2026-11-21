import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

/** Builds the editor for the browser: one script, `app.js`, with its source map beside it. */

const ENTRY = fileURLToPath(new URL('./src/main.ts', import.meta.url));
export const STATIC_DIR = fileURLToPath(new URL('./static', import.meta.url));
/** Where `pnpm build` puts the built editor. */
export const DIST_DIR = fileURLToPath(new URL('./dist', import.meta.url));

export interface AppBundle {
  js: string;
  /** The source map; `js` refers to it as `app.js.map`, so browsers only fetch it when developer tools are open. */
  map: string;
}

export async function buildApp(options: { minify?: boolean } = {}): Promise<AppBundle> {
  const result = await build({
    entryPoints: [ENTRY],
    outfile: join(DIST_DIR, 'app.js'),
    bundle: true,
    format: 'iife',
    target: 'es2022',
    write: false,
    sourcemap: 'linked',
    minify: options.minify ?? false,
    charset: 'utf8',
    logLevel: 'silent',
  });
  const output = (suffix: string): string => {
    const file = result.outputFiles.find((f) => f.path.endsWith(suffix));
    if (file === undefined) throw new Error(`esbuild produced no ${suffix}`);
    return file.text;
  };
  return { js: output('app.js'), map: output('app.js.map') };
}

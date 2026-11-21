#!/usr/bin/env node
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createApp } from './app.ts';

const DEFAULT_PORT = 56043;

const USAGE = `Usage: minerva [--data <dir>] [--port <n>] [--prebuilt]

  --data <dir>        Data directory holding the models and the reference
                      catalogue. Default: ./data
  --port <n>          Port to listen on (localhost only). Default: ${DEFAULT_PORT}
  --prebuilt          Serve the editor as built by \`pnpm build\` instead of
                      building it from source on each page load.
  --help              Show this text.
`;

function main(): void {
  const { values } = parseArgs({
    options: {
      data: { type: 'string', default: 'data' },
      port: { type: 'string', default: String(DEFAULT_PORT) },
      prebuilt: { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  });
  if (values.help) {
    process.stdout.write(USAGE);
    return;
  }
  const port = Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    process.stderr.write(`Invalid port: ${values.port}\n`);
    process.exitCode = 1;
    return;
  }

  const app = createApp({
    dataDir: resolve(values.data),
    prebuiltEditor: values.prebuilt,
  });
  const { workspace } = app;

  createServer(app.handle).listen(port, 'localhost', () => {
    const lines = [
      `Minerva serving on http://localhost:${port}`,
      `   Data directory: ${workspace.dataDir}`,
      `   Models:         ${workspace.models.map((m) => m.id).join(', ') || '(none)'}`,
      `   Codelists:      ${workspace.catalog.codelists?.length ?? 0} loaded`,
      `   Datacat:        ${workspace.catalog.entities?.length ?? 0} entities loaded`,
    ];
    process.stdout.write(lines.join('\n') + '\n');
  });
}

main();

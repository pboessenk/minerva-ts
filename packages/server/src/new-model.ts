#!/usr/bin/env node
import { isAbsolute, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { ManifestError } from '@minerva/core';
import { CreateModelError, createModel } from './workspace/create-model.ts';
import { MANIFEST_FILE } from './workspace/workspace.ts';

const USAGE = `Usage: new-model <name> [--data <dir>] [--title <text>]

Creates an empty model <name>_model.json in the data directory, and adds it
to minerva.json when that lists the workspace's models.

  --data <dir>        Data directory. Created when missing. Default: ./data
  --title <text>      Title of the API. Default: the name, capitalised.
  --help              Show this text.
`;

/** A mistake in the command line; the usage text follows the message. */
class UsageError extends Error {}

function run(): string {
  let parsed: ReturnType<typeof parse>;
  try {
    parsed = parse();
  } catch (err) {
    throw new UsageError((err as Error).message);
  }
  const { values, positionals } = parsed;
  if (values.help) return USAGE;
  if (positionals.length !== 1) throw new UsageError('Give one model name, for example: new-model orders --data ./data');

  const dataDir = resolve(values.data);
  const created = createModel(dataDir, positionals[0] as string, values.title);
  const rel = relative(process.cwd(), dataDir);
  const shown = rel === '' ? '.' : isAbsolute(rel) || rel.startsWith('..') ? rel : `./${rel}`;
  const lines = [`Created ${shown}/${created.file}`];
  if (created.manifestUpdated) lines.push(`Added it to ${shown}/${MANIFEST_FILE}`);
  lines.push(`Open it with: pnpm serve --data ${shown}`);
  return lines.join('\n') + '\n';
}

function parse() {
  return parseArgs({
    allowPositionals: true,
    options: {
      data: { type: 'string', default: 'data' },
      title: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
  });
}

try {
  process.stdout.write(run());
} catch (err) {
  if (err instanceof UsageError) process.stderr.write(`${err.message}\n\n${USAGE}`);
  else if (err instanceof CreateModelError || err instanceof ManifestError) process.stderr.write(`${err.message}\n`);
  else throw err;
  process.exitCode = 1;
}

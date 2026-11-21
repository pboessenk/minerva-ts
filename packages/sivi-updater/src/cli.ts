#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ManifestError, trimSpace } from '@minerva/core';
import { diffCodelists, diffDatacat } from './diff.ts';
import { FetchError, type Source, directorySource, fetchCatalogue, networkSource } from './fetch.ts';
import { type ApiModel, loadApiModels, printApiImpact } from './impact.ts';
import { type Io, processIo } from './io.ts';
import { filterDescChanges, printReport } from './report.ts';
import { findDataDir, loadLocalCodelists, loadLocalDatacat, writeCodelists, writeDatacat, writeVersion } from './store.ts';

const HELP = [
  'Usage: sivi-updater [--data <dir>] [--source <dir>] [--version <label>] [--apply] [--no-desc] [--short]',
  '  (default)         Dry-run: fetch and show diff only',
  '  --data <dir>      Data directory to compare with and update (default: ./data, or the',
  '                    data/ of the nearest project directory above the working directory)',
  '  --source <dir>    Read codelist.json and datacat.json from <dir> instead of sivi.org',
  '  --version <label> SIVI version label for --apply (default: ask on stdin)',
  '  --apply           Write updated files to the data directory (creates it when missing)',
  '  --no-desc         Hide description-only changes in the overview',
  '  --short           Compact API impact report (no per-code details)',
  '',
].join('\n');

/** Everything a run can be told besides its arguments; the defaults are the real world. */
export interface RunOptions {
  /** Where the catalogue comes from when `--source` is not given. */
  source?: Source;
  /** Base for relative paths and the data directory search. */
  cwd?: string;
  now?: Date;
}

interface Args {
  apply: boolean;
  ignoreDesc: boolean;
  short: boolean;
  data: string | undefined;
  source: string | undefined;
  version: string | undefined;
}

type Parsed = { kind: 'run'; args: Args } | { kind: 'exit'; code: number };

function parseArgs(argv: string[], io: Io): Parsed {
  const args: Args = { apply: false, ignoreDesc: false, short: false, data: undefined, source: undefined, version: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    const eq = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const name = eq > 0 ? arg.slice(0, eq) : arg;
    switch (name) {
      case '--apply':
        args.apply = true;
        break;
      case '--no-desc':
      case '--ignore-desc':
        args.ignoreDesc = true;
        break;
      case '--short':
        args.short = true;
        break;
      case '--help':
      case '-h':
        io.out(HELP);
        return { kind: 'exit', code: 0 };
      case '--data':
      case '--source':
      case '--version': {
        let value: string | undefined;
        if (eq > 0) value = arg.slice(eq + 1);
        else value = argv[++i];
        if (value === undefined) {
          io.err(`Missing value for ${name}\n`);
          return { kind: 'exit', code: 1 };
        }
        if (name === '--data') args.data = value;
        else if (name === '--source') args.source = value;
        else args.version = value;
        break;
      }
      default:
        io.err(`Unknown flag: ${arg}\n`);
        return { kind: 'exit', code: 1 };
    }
  }
  return { kind: 'run', args };
}

/** Runs the updater; resolves to the process exit code. */
export async function run(argv: string[], io: Io, options: RunOptions = {}): Promise<number> {
  const parsed = parseArgs(argv, io);
  if (parsed.kind === 'exit') return parsed.code;
  const { args } = parsed;

  const cwd = options.cwd ?? process.cwd();
  const dataDir = args.data !== undefined ? resolve(cwd, args.data) : findDataDir(cwd);
  const datacatDir = join(dataDir, 'datacat');
  const codelistDir = join(dataDir, 'codelists');
  const source = args.source !== undefined ? directorySource(resolve(cwd, args.source)) : (options.source ?? networkSource());

  // Fetch upstream
  io.out('Fetching upstream SIVI data...\n');
  let remote: Awaited<ReturnType<typeof fetchCatalogue>>;
  try {
    remote = await fetchCatalogue(source);
  } catch (e) {
    if (!(e instanceof FetchError)) throw e;
    io.err(`Error fetching ${e.what}: ${e.message}\n`);
    return 1;
  }
  io.out(`  Fetched ${remote.codelists.length} codelists, ${remote.datacat.length} entities\n\n`);

  // Load local, diff
  const clDiffs = diffCodelists(loadLocalCodelists(codelistDir), remote.codelists);
  const dcDiffs = diffDatacat(loadLocalDatacat(datacatDir), remote.datacat);

  // Report
  const [reportDc, reportCl] = args.ignoreDesc ? filterDescChanges(dcDiffs, clDiffs) : [dcDiffs, clDiffs];
  const hasChanges = printReport(reportDc, reportCl, io);

  // API impact analysis
  let models: ApiModel[];
  try {
    models = loadApiModels(dataDir);
  } catch (e) {
    if (!(e instanceof ManifestError)) throw e;
    io.err(`Error reading models: ${e.message}\n`);
    return 1;
  }
  if (hasChanges && models.length > 0) printApiImpact(models, reportDc, reportCl, args.short, io);

  if (!hasChanges) {
    io.out('Everything is up to date.\n');
    return 0;
  }

  if (!args.apply) {
    io.out('\nDry-run complete. Use --apply to write changes.\n');
    if (!args.ignoreDesc) io.out('Use --no-desc to hide description-only changes in the overview.\n');
    return 0;
  }

  // Version label
  let version = args.version;
  if (version === undefined) {
    io.out("\nEnter SIVI version (e.g. '1 maart 2026'): ");
    version = await io.readLine();
  }
  version = trimSpace(version);
  if (version === '') {
    io.err('No version provided, aborting.\n');
    return 1;
  }

  // Write
  io.out('\nApplying changes...\n');
  await writeCodelists(codelistDir, remote.codelists, io);
  await writeDatacat(datacatDir, remote.datacat, io);
  await writeVersion(dataDir, version, io, options.now);
  io.out('Done.\n');
  return 0;
}

function isMain(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  process.exitCode = await run(process.argv.slice(2), processIo());
  process.stdin.unref?.();
}

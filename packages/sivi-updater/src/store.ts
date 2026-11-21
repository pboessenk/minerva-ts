import { type Dirent, existsSync, readdirSync, readFileSync } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { compareStrings, jsonString, quote as quoteGo, sortStrings } from '@minerva/core';
import { decodeClItem, decodeDcEntity, decodeText } from './decode.ts';
import type { Io } from './io.ts';
import type { ClItem, DcEntity } from './types.ts';

export const INDEX_FILE = '_index.json';

/**
 * Looks for a project root holding `data/datacat`, starting at the working
 * directory and climbing at most four levels. Returns its `data` directory,
 * or `./data` (absolute) when there is none.
 */
export function findDataDir(cwd: string = process.cwd()): string {
  let dir = resolve(cwd);
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, 'data', 'datacat'))) return join(dir, 'data');
    dir = dirname(dir);
  }
  return join(resolve(cwd), 'data');
}

// ── Reading ──

function readJsonFiles<T>(dir: string, decode: (v: unknown) => T): T[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const items: T[] = [];
  for (const e of entries.sort((a, b) => compareStrings(a.name, b.name))) {
    if (e.isDirectory() || !e.name.endsWith('.json') || e.name === INDEX_FILE) continue;
    try {
      items.push(decodeText(readFileSync(join(dir, e.name), 'utf8'), decode));
    } catch {
      // An unreadable or malformed file is skipped.
    }
  }
  return items;
}

/** The local codelists, in file-name order; a missing directory reads as empty. Unreadable files are skipped. */
export function loadLocalCodelists(dir: string): ClItem[] {
  return readJsonFiles(dir, decodeClItem);
}

/** The local entities, in file-name order; a missing directory reads as empty. Unreadable files are skipped. */
export function loadLocalDatacat(dir: string): DcEntity[] {
  return readJsonFiles(dir, decodeDcEntity);
}

// ── Encoding: the exact bytes of Go's json.MarshalIndent(v, "", "  ") plus a newline ──

function field(depth: number, key: string, value: string): string {
  return `${'  '.repeat(depth)}"${key}": ${value}`;
}

function object(depth: number, members: string[]): string {
  return `{\n${members.join(',\n')}\n${'  '.repeat(depth)}}`;
}

function array(depth: number, items: string[]): string {
  if (items.length === 0) return '[]';
  const pad = '  '.repeat(depth + 1);
  return `[\n${items.map((i) => pad + i).join(',\n')}\n${'  '.repeat(depth)}]`;
}

export function encodeCodelist(item: ClItem): string {
  const m = [field(1, 'Name', jsonString(item.Name))];
  if (item.Description !== '') m.push(field(1, 'Description', jsonString(item.Description)));
  const code =
    item.Code === null
      ? 'null'
      : array(
          1,
          item.Code.map((c) =>
            object(2, [field(3, 'CodeValue', jsonString(c.CodeValue)), field(3, 'Description', jsonString(c.Description))]),
          ),
        );
  m.push(field(1, 'Code', code));
  return object(0, m) + '\n';
}

export function encodeEntity(entity: DcEntity): string {
  const m = [field(1, 'Name', jsonString(entity.Name))];
  if (entity.Description !== '') m.push(field(1, 'Description', jsonString(entity.Description)));
  if (entity.EntityType.length > 0) {
    const types = entity.EntityType.map((et) => {
      const tm = [field(3, 'Name', jsonString(et.Name))];
      if (et.Description !== '') tm.push(field(3, 'Description', jsonString(et.Description)));
      if (et.Attribute.length > 0) {
        const attrs = et.Attribute.map((a) => {
          const am = [field(5, 'Name', jsonString(a.Name))];
          if (a.Description !== '') am.push(field(5, 'Description', jsonString(a.Description)));
          if (a.Datatype !== '') am.push(field(5, 'Datatype', jsonString(a.Datatype)));
          if (a.Codelist !== '') am.push(field(5, 'Codelist', jsonString(a.Codelist)));
          if (a.AFD1 !== '') am.push(field(5, 'AFD1', jsonString(a.AFD1)));
          return object(4, am);
        });
        tm.push(field(3, 'Attribute', array(3, attrs)));
      }
      return object(2, tm);
    });
    m.push(field(1, 'EntityType', array(1, types)));
  }
  return object(0, m) + '\n';
}

/** A list of names as Go marshals it: `null` when there are none. */
export function encodeIndex(names: string[]): string {
  if (names.length === 0) return 'null\n';
  return (
    array(
      0,
      names.map((n) => jsonString(n)),
    ) + '\n'
  );
}

// ── Writing ──

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function clearDirectory(dir: string, keep: (name: string, isDir: boolean) => boolean): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (keep(e.name, e.isDirectory())) continue;
    await rm(join(dir, e.name), { force: true }).catch(() => undefined);
  }
}

async function writeFiles<T extends { Name: string }>(dir: string, items: T[], encode: (item: T) => string, io: Io): Promise<void> {
  for (const item of items) {
    const path = join(dir, item.Name + '.json');
    try {
      await writeFile(path, encode(item));
    } catch (e) {
      io.err(`  Warning: failed to write ${path}: ${message(e)}\n`);
    }
  }
}

/**
 * Replaces the codelist files and `_index.json`. Creates the directory when
 * it does not exist yet (first run of a fresh checkout).
 */
export async function writeCodelists(dir: string, items: ClItem[], io: Io): Promise<void> {
  await mkdir(dir, { recursive: true });
  await clearDirectory(dir, (name, isDir) => name === INDEX_FILE || isDir);
  await writeFiles(dir, items, encodeCodelist, io);
  const path = join(dir, INDEX_FILE);
  try {
    await writeFile(path, encodeIndex(sortStrings(items.map((i) => i.Name))));
  } catch (e) {
    io.err(`  Warning: failed to write ${INDEX_FILE}: ${message(e)}\n`);
  }
  io.out(`  Wrote ${items.length} codelist files to ${dir}\n`);
}

/**
 * Replaces the entity files. An existing `_index.json` is left as it is;
 * when there is none (first run of a fresh checkout) one is created.
 */
export async function writeDatacat(dir: string, entities: DcEntity[], io: Io): Promise<void> {
  await mkdir(dir, { recursive: true });
  await clearDirectory(dir, (name, isDir) => isDir || !name.endsWith('.json') || name === INDEX_FILE);
  await writeFiles(dir, entities, encodeEntity, io);
  const path = join(dir, INDEX_FILE);
  if (!existsSync(path)) {
    try {
      await writeFile(path, encodeIndex(sortStrings(entities.map((e) => e.Name))));
    } catch (e) {
      io.err(`  Warning: failed to write ${INDEX_FILE}: ${message(e)}\n`);
    }
  }
  io.out(`  Wrote ${entities.length} entity files to ${dir}\n`);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local time as `2006-01-02 15:04:05`. */
export function formatTimestamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export async function writeVersion(dataDir: string, version: string, io: Io, now: Date = new Date()): Promise<void> {
  const content = `${version}\nupdated: ${formatTimestamp(now)}\n`;
  const path = join(dataDir, 'version', '.sivi-version');
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  } catch (e) {
    io.err(`  Warning: failed to write version file: ${message(e)}\n`);
    return;
  }
  io.out(`  Wrote version ${quoteGo(version)} to ${path}\n`);
}

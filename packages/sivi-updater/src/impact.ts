import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { type ManifestModel, compareStrings, decodeManifest, discoverModel, quote, runeCount, sortStrings } from '@minerva/core';
import { DecodeError } from './decode.ts';
import type { Io } from './io.ts';
import { summarizeCodeChanges } from './report.ts';
import type { CodeChange, CodelistChange, EntityChange } from './types.ts';

// ── API models ──

export interface ApiAttr {
  name: string;
  siviReference: string | null;
  siviCodelist: string | null;
}
export interface ApiSection {
  attributes: ApiAttr[];
}
export interface ApiEntity {
  sections: ApiSection[];
}
export interface ApiModel {
  title: string;
  fileName: string;
  entities: Map<string, ApiEntity>;
}

type Obj = Record<string, unknown>;

function obj(v: unknown, what: string): Obj {
  if (v === null) return {};
  if (typeof v !== 'object' || Array.isArray(v)) throw new DecodeError(`${what} is not an object`);
  return v as Obj;
}

/** The value under `key`, matched case-insensitively; `undefined` when absent or null. */
function get(o: Obj, key: string): unknown {
  let found: unknown;
  for (const [k, v] of Object.entries(o)) {
    if (k === key || k.toLowerCase() === key.toLowerCase()) found = v;
  }
  return found ?? undefined;
}

function optString(v: unknown, what: string): string | null {
  if (v === undefined) return null;
  if (typeof v !== 'string') throw new DecodeError(`${what} is not a string`);
  return v;
}

function list<T>(v: unknown, what: string, item: (x: unknown) => T): T[] {
  if (v === undefined) return [];
  if (!Array.isArray(v)) throw new DecodeError(`${what} is not an array`);
  return v.map(item);
}

function decodeModel(text: string, fileName: string): ApiModel {
  const root = obj(JSON.parse(text), 'model');
  const entities = new Map<string, ApiEntity>();
  for (const [name, e] of Object.entries(obj(get(root, 'entities') ?? null, 'entities'))) {
    entities.set(name, {
      sections: list(get(obj(e, 'entity'), 'sections'), 'sections', (s) => ({
        attributes: list(get(obj(s, 'section'), 'attributes'), 'attributes', (a) => {
          const attr = obj(a, 'attribute');
          return {
            name: optString(get(attr, 'name'), 'name') ?? '',
            siviReference: optString(get(attr, 'siviReference'), 'siviReference'),
            siviCodelist: optString(get(attr, 'siviCodelist'), 'siviCodelist'),
          };
        }),
      })),
    });
  }
  return { title: optString(get(root, 'title'), 'title') ?? '', fileName, entities };
}

/**
 * The API models of a data directory, found the way the server finds them:
 * the models named by `minerva.json` when it exists and lists any, otherwise
 * every `*_model.json` file. Unreadable or malformed models are skipped.
 */
export function loadApiModels(dataDir: string): ApiModel[] {
  let entries: ManifestModel[] = [];
  const manifestPath = join(dataDir, 'minerva.json');
  if (existsSync(manifestPath)) entries = decodeManifest(readFileSync(manifestPath, 'utf8')).models;
  if (entries.length === 0) {
    let names: string[];
    try {
      names = readdirSync(dataDir);
    } catch {
      return [];
    }
    entries = names
      .sort(compareStrings)
      .map(discoverModel)
      .filter((m): m is ManifestModel => m !== undefined);
  }
  const models: ApiModel[] = [];
  for (const entry of entries) {
    try {
      models.push(decodeModel(readFileSync(join(dataDir, entry.file), 'utf8'), basename(entry.file)));
    } catch {
      // A model that does not decode is skipped.
    }
  }
  return models;
}

// ── Impact analysis ──

interface Hit {
  apiEntity: string;
  apiAttr: string;
  reason: string;
  /** Set when the hit comes from a changed codelist. */
  codelist: string;
  /** Added or removed codes of that codelist. */
  codes: CodeChange[];
}

function hit(apiEntity: string, apiAttr: string, reason: string): Hit {
  return { apiEntity, apiAttr, reason, codelist: '', codes: [] };
}

export function printApiImpact(models: ApiModel[], dcDiffs: EntityChange[], clDiffs: CodelistChange[], short: boolean, io: Io): void {
  const lines: string[] = [];
  const println = (s = ''): void => void lines.push(s);

  const dcMap = new Map<string, EntityChange>(dcDiffs.map((d) => [d.name, d]));
  const attrKey = (entity: string, attr: string): string => `${entity}\u0000${attr}`;
  const attrChanges = new Map<string, string[]>();
  for (const ec of dcDiffs) {
    for (const sc of ec.subtypeDiffs) {
      for (const ac of sc.attrDiffs) {
        const verb = ac.kind === '+' ? 'added' : ac.kind === '-' ? 'removed' : 'changed';
        let detail = `${verb} in subtype ${sc.name}`;
        if (ac.details !== '') detail += ` (${ac.details})`;
        const key = attrKey(ec.name, ac.name);
        attrChanges.set(key, [...(attrChanges.get(key) ?? []), detail]);
      }
    }
  }
  const clMap = new Map<string, CodelistChange>(clDiffs.map((d) => [d.name, d]));

  let anyHit = false;
  for (const model of models) {
    const hits: Hit[] = [];
    for (const [entityName, entity] of model.entities) {
      for (const section of entity.sections) {
        for (const attr of section.attributes) {
          if (attr.siviReference !== null && attr.siviReference !== '') {
            const ref = attr.siviReference;
            const dot = ref.indexOf('.');
            if (dot > 0) {
              const siviEntity = ref.slice(0, dot);
              const siviAttr = ref.slice(dot + 1);
              const ec = dcMap.get(siviEntity);
              if (ec !== undefined) {
                if (ec.kind === '+') {
                  hits.push(hit(entityName, attr.name, `SIVI entity ${quote(siviEntity)} is NEW (ref: ${ref})`));
                } else if (ec.kind === '-') {
                  hits.push(hit(entityName, attr.name, `SIVI entity ${quote(siviEntity)} was REMOVED (ref: ${ref})`));
                } else {
                  for (const c of attrChanges.get(attrKey(siviEntity, siviAttr)) ?? []) {
                    hits.push(hit(entityName, attr.name, `SIVI attr ${ref}: ${c}`));
                  }
                }
              }
            }
          }

          if (attr.siviCodelist !== null && attr.siviCodelist !== '') {
            const cl = attr.siviCodelist;
            const cc = clMap.get(cl);
            if (cc !== undefined) {
              const h = hit(entityName, attr.name, '');
              if (cc.kind === '+') {
                h.reason = `codelist ${cl} is NEW`;
              } else if (cc.kind === '-') {
                h.reason = `codelist ${cl} was REMOVED`;
              } else {
                h.reason = `codelist ${cl}: ${summarizeCodeChanges(cc.codeDiffs)}`;
                h.codelist = cl;
                h.codes = cc.codeDiffs.filter((cd) => cd.kind === '+' || cd.kind === '-');
              }
              hits.push(h);
            }
          }
        }
      }
    }

    if (hits.length === 0) continue;
    if (!anyHit) {
      println('=== API Impact Report ===');
      println();
      anyHit = true;
    }

    println(`API: ${model.title} (${model.fileName})`);
    const grouped = new Map<string, Hit[]>();
    for (const h of hits) grouped.set(h.apiEntity, [...(grouped.get(h.apiEntity) ?? []), h]);
    const printedCodes = new Set<string>(); // codelists whose codes are already listed for this model
    for (const en of sortStrings(grouped.keys())) {
      println(`  ${en}:`);
      for (const h of grouped.get(en) ?? []) {
        let reason = h.reason;
        if (!short && h.codes.length > 0 && printedCodes.has(h.codelist)) reason += ' (codes listed above)';
        println(`    .${h.apiAttr}${' '.repeat(Math.max(0, 30 - runeCount(h.apiAttr)))}  ← ${reason}`);
        if (short || h.codes.length === 0 || printedCodes.has(h.codelist)) continue;
        printedCodes.add(h.codelist);
        for (const cd of h.codes) {
          if (cd.kind === '+') println(`        + ${cd.code} = ${quote(cd.newDesc)}`);
          else if (cd.kind === '-') println(`        - ${cd.code} = ${quote(cd.oldDesc)}`);
        }
      }
    }
    println();
  }

  if (!anyHit) {
    println('No API impact detected from SIVI changes.');
    println();
  }
  io.out(lines.join('\n') + '\n');
}

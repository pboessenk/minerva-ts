import { quote } from '@minerva/core';
import type { Io } from './io.ts';
import type { AttrChange, ChangeKind, CodeChange, CodelistChange, EntityChange, SubtypeChange } from './types.ts';

/**
 * Returns copies of the diffs with description-only changes removed: entity,
 * subtype and codelist description tweaks, the "description changed" detail
 * of an attribute, and code descriptions. Entries left with no change at all
 * are dropped.
 */
export function filterDescChanges(dcDiffs: EntityChange[], clDiffs: CodelistChange[]): [EntityChange[], CodelistChange[]] {
  const fdc: EntityChange[] = [];
  for (const original of dcDiffs) {
    if (original.kind !== '~') {
      fdc.push(original);
      continue;
    }
    const e: EntityChange = { ...original, descChange: '' };
    const subs: SubtypeChange[] = [];
    for (const original of e.subtypeDiffs) {
      if (original.kind !== '~') {
        subs.push(original);
        continue;
      }
      const st: SubtypeChange = { ...original, descChange: '' };
      const attrs: AttrChange[] = [];
      for (const original of st.attrDiffs) {
        const a = { ...original };
        if (a.kind === '~') {
          a.details = stripDescChanged(a.details);
          if (a.details === '') continue; // attribute changed only its description
        }
        attrs.push(a);
      }
      st.attrDiffs = attrs;
      if (st.attrDiffs.length === 0) continue; // subtype changed only its description
      subs.push(st);
    }
    e.subtypeDiffs = subs;
    if (e.descChange === '' && e.subtypeDiffs.length === 0) continue; // entity changed only descriptions
    fdc.push(e);
  }

  const fcl: CodelistChange[] = [];
  for (const original of clDiffs) {
    if (original.kind !== '~') {
      fcl.push(original);
      continue;
    }
    const c: CodelistChange = { ...original, descChange: '' };
    c.codeDiffs = c.codeDiffs.filter((cd) => cd.kind !== '~'); // code kept, only its description changed
    if (c.codeDiffs.length === 0) continue; // codelist changed only descriptions
    fcl.push(c);
  }
  return [fdc, fcl];
}

/** Removes the "description changed" token from an attribute detail string. */
export function stripDescChanged(details: string): string {
  if (details === '') return '';
  return details
    .split(', ')
    .filter((p) => p !== 'description changed')
    .join(', ');
}

function count(diffs: { kind: ChangeKind }[], kind: ChangeKind): number {
  return diffs.filter((d) => d.kind === kind).length;
}

function summarize(diffs: { kind: ChangeKind }[], suffix: string): string {
  const parts: string[] = [];
  const a = count(diffs, '+');
  const c = count(diffs, '~');
  const r = count(diffs, '-');
  if (a > 0) parts.push(`${a} ${suffix}added`);
  if (c > 0) parts.push(`${c} ${suffix}changed`);
  if (r > 0) parts.push(`${r} ${suffix}removed`);
  return parts.join(', ');
}

export function summarizeAttrChanges(diffs: AttrChange[]): string {
  return summarize(diffs, '');
}

export function summarizeCodeChanges(diffs: CodeChange[]): string {
  return summarize(diffs, 'codes ');
}

/** Prints the update report; returns whether there was anything to report. */
export function printReport(dcDiffs: EntityChange[], clDiffs: CodelistChange[], io: Io): boolean {
  if (dcDiffs.length === 0 && clDiffs.length === 0) return false;
  const lines: string[] = [];
  const println = (s = ''): void => void lines.push(s);

  println('=== SIVI Update Report ===');
  println();

  if (dcDiffs.length > 0) {
    println(`DATACAT: ${count(dcDiffs, '+')} added, ${count(dcDiffs, '~')} changed, ${count(dcDiffs, '-')} removed`);
    for (const d of dcDiffs) {
      switch (d.kind) {
        case '+':
          println(`  + NEW entity: ${d.name}`);
          break;
        case '-':
          println(`  - REMOVED entity: ${d.name}`);
          break;
        case '~':
          println(`  ~ CHANGED entity: ${d.name}`);
          if (d.descChange !== '') println(`      description: ${d.descChange}`);
          for (const sd of d.subtypeDiffs) {
            switch (sd.kind) {
              case '+':
                println(`      + NEW subtype: ${sd.name} (${sd.attrCount} attrs)`);
                break;
              case '-':
                println(`      - REMOVED subtype: ${sd.name} (${sd.attrCount} attrs)`);
                break;
              case '~': {
                const label = sd.descChange !== '' ? `${sd.name} (description changed)` : sd.name;
                println(`      ~ subtype ${label}: ${summarizeAttrChanges(sd.attrDiffs)}`);
                for (const ad of sd.attrDiffs) {
                  if (ad.kind === '+') println(`          + ${ad.name} ${ad.details}`);
                  else if (ad.kind === '-') println(`          - ${ad.name}`);
                  else println(`          ~ ${ad.name}: ${ad.details}`);
                }
                break;
              }
            }
          }
          break;
      }
    }
    println();
  }

  if (clDiffs.length > 0) {
    println(`CODELISTS: ${count(clDiffs, '+')} added, ${count(clDiffs, '~')} changed, ${count(clDiffs, '-')} removed`);
    for (const d of clDiffs) {
      switch (d.kind) {
        case '+':
          println(`  + NEW codelist: ${d.name}`);
          break;
        case '-':
          println(`  - REMOVED codelist: ${d.name}`);
          break;
        case '~': {
          const label = d.descChange !== '' ? `${d.name} (description changed)` : d.name;
          println(`  ~ CHANGED ${label}: ${summarizeCodeChanges(d.codeDiffs)}`);
          if (d.codeDiffs.length <= 20) {
            for (const cd of d.codeDiffs) {
              if (cd.kind === '+') println(`      + ${cd.code} = ${quote(cd.newDesc)}`);
              else if (cd.kind === '-') println(`      - ${cd.code} = ${quote(cd.oldDesc)}`);
              else println(`      ~ ${cd.code}: ${quote(cd.oldDesc)} → ${quote(cd.newDesc)}`);
            }
          }
          break;
        }
      }
    }
    println();
  }

  io.out(lines.join('\n') + '\n');
  return true;
}

import { compareStrings, quote } from '@minerva/core';
import type {
  AttrChange,
  ChangeKind,
  ClItem,
  CodeChange,
  CodelistChange,
  DcAttribute,
  DcEntity,
  DcEntityType,
  EntityChange,
  SubtypeChange,
} from './types.ts';
import { descDiff } from './text.ts';

/** Last entry wins when names repeat, as with a map filled in order. */
function byName<T extends { Name: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((i) => [i.Name, i]));
}

const ORDER: Record<ChangeKind, number> = { '+': 0, '~': 1, '-': 2 };

function sortChanges<T extends { kind: ChangeKind; name: string }>(diffs: T[]): T[] {
  return diffs.sort((a, b) => (a.kind !== b.kind ? ORDER[a.kind] - ORDER[b.kind] : compareStrings(a.name, b.name)));
}

// ── Datacat ──

export function diffDatacat(local: DcEntity[], remote: DcEntity[]): EntityChange[] {
  const localMap = byName(local);
  const remoteMap = byName(remote);
  const diffs: EntityChange[] = [];

  for (const e of local) {
    if (!remoteMap.has(e.Name)) diffs.push({ kind: '-', name: e.Name, descChange: '', subtypeDiffs: [] });
  }
  for (const re of remote) {
    const le = localMap.get(re.Name);
    if (le === undefined) {
      diffs.push({ kind: '+', name: re.Name, descChange: '', subtypeDiffs: [] });
      continue;
    }
    const ec = diffEntity(le, re);
    if (ec !== undefined) diffs.push(ec);
  }
  return sortChanges(diffs);
}

function diffEntity(local: DcEntity, remote: DcEntity): EntityChange | undefined {
  const ec: EntityChange = { kind: '~', name: local.Name, descChange: '', subtypeDiffs: [] };
  let hasChanges = false;

  if (local.Description !== remote.Description) {
    ec.descChange = descDiff(local.Description, remote.Description);
    hasChanges = true;
  }

  const localST = byName(local.EntityType);
  const remoteST = byName(remote.EntityType);

  for (const st of local.EntityType) {
    if (!remoteST.has(st.Name)) {
      ec.subtypeDiffs.push({ kind: '-', name: st.Name, attrCount: st.Attribute.length, attrDiffs: [], descChange: '' });
      hasChanges = true;
    }
  }
  for (const rst of remote.EntityType) {
    const lst = localST.get(rst.Name);
    if (lst === undefined) {
      ec.subtypeDiffs.push({ kind: '+', name: rst.Name, attrCount: rst.Attribute.length, attrDiffs: [], descChange: '' });
      hasChanges = true;
      continue;
    }
    const sc = diffSubtype(lst, rst);
    if (sc !== undefined) {
      ec.subtypeDiffs.push(sc);
      hasChanges = true;
    }
  }
  return hasChanges ? ec : undefined;
}

function diffSubtype(local: DcEntityType, remote: DcEntityType): SubtypeChange | undefined {
  const sc: SubtypeChange = { kind: '~', name: local.Name, attrCount: 0, attrDiffs: [], descChange: '' };
  let hasChanges = false;

  if (local.Description !== remote.Description) {
    sc.descChange = descDiff(local.Description, remote.Description);
    hasChanges = true;
  }

  const localAttrs = byName(local.Attribute);
  const remoteAttrs = byName(remote.Attribute);

  for (const a of local.Attribute) {
    if (!remoteAttrs.has(a.Name)) {
      sc.attrDiffs.push({ kind: '-', name: a.Name, details: '' });
      hasChanges = true;
    }
  }
  for (const ra of remote.Attribute) {
    const la = localAttrs.get(ra.Name);
    if (la === undefined) {
      sc.attrDiffs.push({ kind: '+', name: ra.Name, details: `(${ra.Datatype})` });
      hasChanges = true;
      continue;
    }
    const details = diffAttribute(la, ra);
    if (details !== '') {
      sc.attrDiffs.push({ kind: '~', name: ra.Name, details });
      hasChanges = true;
    }
  }
  return hasChanges ? sc : undefined;
}

function diffAttribute(local: DcAttribute, remote: DcAttribute): string {
  const parts: string[] = [];
  if (local.Description !== remote.Description) parts.push('description changed');
  if (local.Datatype !== remote.Datatype) parts.push(`datatype: ${quote(local.Datatype)} → ${quote(remote.Datatype)}`);
  if (local.Codelist !== remote.Codelist) parts.push(`codelist: ${quote(local.Codelist)} → ${quote(remote.Codelist)}`);
  // AFD1 is left out on purpose: it is a legacy mapping field that shows up as
  // duplicates (same attribute name, different AFD1), which makes a map-based
  // diff unreliable.
  return parts.join(', ');
}

// ── Codelists ──

export function diffCodelists(local: ClItem[], remote: ClItem[]): CodelistChange[] {
  const localMap = byName(local);
  const remoteMap = byName(remote);
  const diffs: CodelistChange[] = [];

  for (const c of local) {
    if (!remoteMap.has(c.Name)) diffs.push({ kind: '-', name: c.Name, descChange: '', codeDiffs: [] });
  }
  for (const rc of remote) {
    const lc = localMap.get(rc.Name);
    if (lc === undefined) {
      diffs.push({ kind: '+', name: rc.Name, descChange: '', codeDiffs: [] });
      continue;
    }
    const cc = diffCodelist(lc, rc);
    if (cc !== undefined) diffs.push(cc);
  }
  return sortChanges(diffs);
}

function diffCodelist(local: ClItem, remote: ClItem): CodelistChange | undefined {
  const cc: CodelistChange = { kind: '~', name: local.Name, descChange: '', codeDiffs: [] };
  let hasChanges = false;

  if (local.Description !== remote.Description) {
    cc.descChange = descDiff(local.Description, remote.Description);
    hasChanges = true;
  }

  const localList = local.Code ?? [];
  const remoteList = remote.Code ?? [];
  const localCodes = new Map(localList.map((c) => [c.CodeValue, c.Description]));
  const remoteCodes = new Map(remoteList.map((c) => [c.CodeValue, c.Description]));

  for (const c of localList) {
    if (!remoteCodes.has(c.CodeValue)) {
      cc.codeDiffs.push({ kind: '-', code: c.CodeValue, oldDesc: c.Description, newDesc: '' });
      hasChanges = true;
    }
  }
  for (const c of remoteList) {
    const oldDesc = localCodes.get(c.CodeValue);
    if (oldDesc === undefined) {
      cc.codeDiffs.push({ kind: '+', code: c.CodeValue, oldDesc: '', newDesc: c.Description });
      hasChanges = true;
      continue;
    }
    if (oldDesc !== c.Description) {
      cc.codeDiffs.push({ kind: '~', code: c.CodeValue, oldDesc, newDesc: c.Description });
      hasChanges = true;
    }
  }
  return hasChanges ? cc : undefined;
}

export type { AttrChange, CodeChange };

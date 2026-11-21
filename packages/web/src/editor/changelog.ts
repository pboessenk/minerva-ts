/**
 * Editor changelog: changelog management and version bumping. Renders the
 * Changelog tab of the General view (open changes + release history), the
 * "Bump version" dialog and the "Unlock release" dialog (moves the newest
 * release's entries back into open, e.g. to sneak one more change into an
 * already-published version). Data lives on the model as:
 *   changelog: { open: [{category, text}],
 *                releases: [{version, date, entries}] }
 * releases[] is ordered newest-first.
 */
import { showGeneralView } from './general.ts';
import type { Changelog, ChangelogEntry, ChangelogRelease, RawModel } from './model-types.ts';
import { state } from './state.ts';
import { editorSave, updateToolbarInfo } from './toolbar.ts';
import { escapeHtml, showToast } from '../base/ui.ts';
import { getModel, isDirty, setDirty } from '../base/model-state.ts';

const CHANGELOG_CATEGORIES = ['added', 'changed', 'fixed', 'removed'];
const CHANGELOG_CATEGORY_LABELS: Record<string, string> = { added: 'Added', changed: 'Changed', fixed: 'Fixed', removed: 'Removed' };

export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
}

// Lenient version parse: up to 3 dot-separated numeric segments, missing or
// non-numeric segments become 0 ("1.0" -> 1.0.0, "" -> 0.0.0). Suffixes are
// dropped; after a bump the version becomes canonical major.minor.patch.
export function parseVersion(str: string | null | undefined): ParsedVersion {
  const parts = String(str || '').split('.');
  const num = (p: string | undefined): number => {
    const n = parseInt(p as string, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  return { major: num(parts[0]), minor: num(parts[1]), patch: num(parts[2]) };
}

function localISODate(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Lazily create the changelog block. Only call from mutation paths so
// untouched models don't gain a noise key on unrelated saves.
function ensureChangelog(m: RawModel): Changelog {
  if (!m.changelog) m.changelog = { open: [], releases: [] };
  if (!m.changelog.open) m.changelog.open = [];
  if (!m.changelog.releases) m.changelog.releases = [];
  return m.changelog;
}

// Markdown for a set of entries: "### Added" sections with "- item"
// bullets, in fixed category order; unknown categories get their own
// trailing sections in insertion order.
function entriesMarkdown(entries: ChangelogEntry[] | undefined): string {
  const byCat = new Map<string, string[]>();
  for (const e of entries || []) {
    let bullets = byCat.get(e.category);
    if (!bullets) {
      bullets = [];
      byCat.set(e.category, bullets);
    }
    bullets.push(`- ${(e.text || '').trim()}`);
  }
  const order = [
    ...CHANGELOG_CATEGORIES.filter((c) => byCat.has(c)),
    ...[...byCat.keys()].filter((c) => !CHANGELOG_CATEGORIES.includes(c)),
  ];
  return order.map((cat) => `### ${CHANGELOG_CATEGORY_LABELS[cat] || cat || '?'}\n${(byCat.get(cat) as string[]).join('\n')}`).join('\n\n');
}

function categoryOptions(selected: string): string {
  return CHANGELOG_CATEGORIES.map(
    (c) => `<option value="${c}" ${c === selected ? 'selected' : ''}>${CHANGELOG_CATEGORY_LABELS[c]}</option>`,
  ).join('');
}

function categoryBadge(category: string): string {
  const known = CHANGELOG_CATEGORIES.includes(category);
  const cls = known ? ` ${category}` : '';
  const label = known ? (CHANGELOG_CATEGORY_LABELS[category] as string) : category || '?';
  return `<span class="ca-cl-badge${cls}">${escapeHtml(label)}</span>`;
}

function renderRelease(r: ChangelogRelease, i: number): string {
  const entries = r.entries || [];
  // Group entries by category in fixed order; unknown categories keep
  // their original order at the end.
  const ordered: ChangelogEntry[] = [];
  for (const cat of CHANGELOG_CATEGORIES) {
    for (const e of entries) if (e.category === cat) ordered.push(e);
  }
  for (const e of entries) if (!CHANGELOG_CATEGORIES.includes(e.category)) ordered.push(e);

  const items = ordered
    .map((e) => `<div class="ca-cl-hist-item">${categoryBadge(e.category)}<span>${escapeHtml(e.text || '')}</span></div>`)
    .join('');

  return `
        <div class="ca-cl-release">
            <div class="ca-cl-release-head">
                <span class="ca-cl-release-version">v${escapeHtml(r.version || '?')}</span>
                <span class="ca-cl-release-date">${escapeHtml(r.date || '')}</span>
                <button class="ca-cl-copy-btn" data-rel="${i}" title="Copy as markdown"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
                ${i === 0 ? '<button class="ca-cl-unlock-btn" id="clUnlockBtn" title="Move this release\'s entries back into open changes">Unlock…</button>' : ''}
            </div>
            ${items || '<div class="ca-cl-empty">No entries.</div>'}
        </div>`;
}

export function renderChangelogPane(container: HTMLElement | null): void {
  if (!container) return;
  const m = getModel();
  if (!m) return;
  const open = (m.changelog && m.changelog.open) || [];
  const releases = (m.changelog && m.changelog.releases) || [];
  const version = (m.version || '').trim();

  const openRows = open
    .map(
      (e, i) => `
        <div class="ca-cl-row" data-idx="${i}">
            <select class="ca-cl-cat">${categoryOptions(e.category)}</select>
            <input type="text" class="ca-cl-text" value="${escapeHtml(e.text || '')}" spellcheck="false">
            <button class="ca-delete-btn ca-cl-remove" title="Remove">✕</button>
        </div>`,
    )
    .join('');

  container.innerHTML = `
        <section class="ca-general-section">
            <div class="ca-cl-pane-head">
                <h3>Open changes <span class="ca-cl-pane-sub">since v${escapeHtml(version || '0.0.0')} (unreleased)</span></h3>
                <button class="ca-bump-btn" id="clBumpBtn">Bump version…</button>
            </div>
            <div id="clOpenRows">${openRows || '<div class="ca-cl-empty">No open changes yet.</div>'}</div>
            <div class="ca-cl-add-row">
                <select class="ca-cl-cat" id="clAddCat">${categoryOptions('added')}</select>
                <input type="text" class="ca-cl-text" id="clAddText" placeholder="Describe the change…" spellcheck="false">
                <button class="ca-add-attr-btn" id="clAddBtn">+ Add entry</button>
            </div>
        </section>

        <section class="ca-general-section">
            <h3>History</h3>
            ${releases.length ? releases.map(renderRelease).join('') : '<div class="ca-cl-empty">No releases yet.</div>'}
        </section>
    `;

  // In-place edits write straight into the model without re-render
  // (prevents focus loss), same pattern as the General servers list.
  const rowsEl = container.querySelector('#clOpenRows') as HTMLElement;
  const entryAt = (target: HTMLElement): ChangelogEntry | undefined => {
    const row = target.closest<HTMLElement>('.ca-cl-row');
    const m2 = getModel();
    const entries = (m2 && m2.changelog && m2.changelog.open) || [];
    return row ? entries[parseInt(row.dataset.idx as string, 10)] : undefined;
  };
  rowsEl.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    if (!target.classList.contains('ca-cl-text')) return;
    const entry = entryAt(target);
    if (entry) {
      entry.text = target.value;
      setDirty(true);
    }
  });
  rowsEl.addEventListener('change', (e) => {
    const target = e.target as HTMLSelectElement;
    if (!target.classList.contains('ca-cl-cat')) return;
    const entry = entryAt(target);
    if (entry) {
      entry.category = target.value;
      setDirty(true);
    }
  });
  rowsEl.querySelectorAll<HTMLElement>('.ca-cl-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt((btn.closest('.ca-cl-row') as HTMLElement).dataset.idx as string, 10);
      const m2 = getModel();
      if (!m2 || !m2.changelog) return;
      m2.changelog.open.splice(idx, 1);
      setDirty(true);
      renderChangelogPane(container);
    });
  });

  const addCat = container.querySelector('#clAddCat') as HTMLSelectElement;
  const addText = container.querySelector('#clAddText') as HTMLInputElement;
  const addEntry = (): void => {
    const text = addText.value.trim();
    if (!text) {
      addText.focus();
      return;
    }
    const m2 = getModel();
    if (!m2) return;
    const cat = addCat.value;
    ensureChangelog(m2).open.push({ category: cat, text });
    setDirty(true);
    renderChangelogPane(container);
    // Keep the chosen category and focus for rapid entry
    const newCat = container.querySelector<HTMLSelectElement>('#clAddCat');
    if (newCat) newCat.value = cat;
    const newText = container.querySelector<HTMLInputElement>('#clAddText');
    if (newText) newText.focus();
  };
  (container.querySelector('#clAddBtn') as HTMLElement).addEventListener('click', addEntry);
  addText.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addEntry();
  });

  (container.querySelector('#clBumpBtn') as HTMLElement).addEventListener('click', openBumpDialog);

  const unlockBtn = container.querySelector('#clUnlockBtn');
  if (unlockBtn) unlockBtn.addEventListener('click', openUnlockDialog);

  container.querySelectorAll<HTMLElement>('.ca-cl-copy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const m2 = getModel();
      const rels = (m2 && m2.changelog && m2.changelog.releases) || [];
      const rel = rels[parseInt(btn.dataset.rel as string, 10)];
      if (!rel) return;
      try {
        await navigator.clipboard.writeText(entriesMarkdown(rel.entries));
        showToast(`Copied v${rel.version || '?'} changelog as markdown`);
      } catch {
        showToast('Copy to clipboard failed', 'error');
      }
    });
  });
}

/* ── Bump dialog ── */

export function openBumpDialog(): void {
  const m = getModel();
  if (!m) {
    showToast('No model loaded', 'error');
    return;
  }
  const currentRaw = (m.version || '').trim();
  const cur = parseVersion(currentRaw);
  const open = (m.changelog && m.changelog.open) || [];
  const releases = (m.changelog && m.changelog.releases) || [];

  const overlay = document.createElement('div');
  overlay.className = 'ca-av-overlay';
  const popup = document.createElement('div');
  popup.className = 'ca-bump-popup';
  popup.innerHTML = `
        <div class="ca-bump-title">Bump version</div>
        <div class="ca-bump-current">Current: <span>${currentRaw ? escapeHtml(currentRaw) : '(none)'}</span></div>
        <div class="ca-bump-presets">
            <button data-preset="major">Major</button>
            <button data-preset="minor">Minor</button>
            <button data-preset="patch" class="active">Patch</button>
        </div>
        <div class="ca-bump-fields">
            <input type="number" min="0" step="1" class="ca-bump-major" title="Major">
            <span>.</span>
            <input type="number" min="0" step="1" class="ca-bump-minor" title="Minor">
            <span>.</span>
            <input type="number" min="0" step="1" class="ca-bump-patch" title="Patch">
        </div>
        <div class="ca-bump-summary"></div>
        <div class="ca-bump-msg"></div>
        <div class="ca-av-footer">
            <button class="ca-av-btn-cancel">Cancel</button>
            <button class="ca-av-btn-save">Bump &amp; save</button>
        </div>
    `;
  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  const majEl = popup.querySelector('.ca-bump-major') as HTMLInputElement;
  const minEl = popup.querySelector('.ca-bump-minor') as HTMLInputElement;
  const patEl = popup.querySelector('.ca-bump-patch') as HTMLInputElement;
  const summaryEl = popup.querySelector('.ca-bump-summary') as HTMLElement;
  const msgEl = popup.querySelector('.ca-bump-msg') as HTMLElement;
  const confirmBtn = popup.querySelector('.ca-av-btn-save') as HTMLButtonElement;
  const presetBtns = popup.querySelectorAll<HTMLElement>('.ca-bump-presets button');

  const applyPreset = (preset: string): void => {
    if (preset === 'major') {
      majEl.value = String(cur.major + 1);
      minEl.value = '0';
      patEl.value = '0';
    } else if (preset === 'minor') {
      majEl.value = String(cur.major);
      minEl.value = String(cur.minor + 1);
      patEl.value = '0';
    } else {
      majEl.value = String(cur.major);
      minEl.value = String(cur.minor);
      patEl.value = String(cur.patch + 1);
    }
    presetBtns.forEach((b) => b.classList.toggle('active', b.dataset.preset === preset));
  };

  const refresh = (): void => {
    const vals = [majEl.value, minEl.value, patEl.value].map((v) => v.trim());
    const nums = vals.map((v) => Number(v));
    const valid = vals.every((v) => v !== '') && nums.every((n) => Number.isInteger(n) && n >= 0);

    let error = '';
    let warn = '';
    if (!valid) {
      error = 'Major, minor and patch must be non-negative whole numbers.';
      summaryEl.textContent = '';
    } else {
      const [maj, min, pat] = nums as [number, number, number];
      const newStr = `${maj}.${min}.${pat}`;
      const sameAs = (v: string): boolean => {
        const p = parseVersion(v);
        return p.major === maj && p.minor === min && p.patch === pat;
      };
      if (sameAs(currentRaw)) {
        error = 'New version equals the current version.';
      } else if (releases.some((r) => sameAs(r.version))) {
        error = `Version ${newStr} already exists in the history.`;
      } else if (maj < cur.major || (maj === cur.major && (min < cur.minor || (min === cur.minor && pat < cur.patch)))) {
        warn = 'Lower than the current version.';
      }
      if (!error && !warn && isDirty()) {
        warn = 'Bump & save will save all pending changes.';
      }
      summaryEl.textContent = open.length
        ? `${currentRaw || '(none)'} → ${newStr} — ${open.length} open ${open.length === 1 ? 'entry' : 'entries'} will be released as v${newStr}`
        : `${currentRaw || '(none)'} → ${newStr} — no open changelog entries, no history entry will be recorded`;
    }
    msgEl.textContent = error || warn;
    msgEl.className = 'ca-bump-msg' + (error ? ' ca-bump-error' : warn ? ' ca-bump-warn' : '');
    confirmBtn.disabled = !!error;
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  const close = (): void => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  document.addEventListener('keydown', onKey);

  presetBtns.forEach((btn) =>
    btn.addEventListener('click', () => {
      applyPreset(btn.dataset.preset as string);
      refresh();
    }),
  );
  [majEl, minEl, patEl].forEach((el) =>
    el.addEventListener('input', () => {
      presetBtns.forEach((b) => b.classList.remove('active'));
      refresh();
    }),
  );

  confirmBtn.addEventListener('click', () => {
    const maj = Number(majEl.value),
      min = Number(minEl.value),
      pat = Number(patEl.value);
    close();
    performBump(maj, min, pat);
  });
  (popup.querySelector('.ca-av-btn-cancel') as HTMLElement).addEventListener('click', close);
  popup.addEventListener('click', (e) => e.stopPropagation());
  overlay.addEventListener('click', close);

  applyPreset('patch');
  refresh();
  patEl.focus();
  patEl.select();
}

// The bump transaction: release open entries under the NEW version,
// switch the working version, re-render and save to disk.
export async function performBump(major: number, minor: number, patch: number): Promise<void> {
  const m = getModel();
  if (!m) return;
  const newVersion = `${major}.${minor}.${patch}`;

  const open = (m.changelog && m.changelog.open) || [];
  if (open.length > 0) {
    const cl = ensureChangelog(m);
    cl.releases.unshift({ version: newVersion, date: localISODate(), entries: cl.open });
    cl.open = [];
  }

  m.version = newVersion;
  setDirty(true);
  updateToolbarInfo();
  if (state.apiActiveEntity === '__general__') showGeneralView();

  const ok = await editorSave();
  if (!ok) {
    // Not reverted: the bump stays in memory with the dirty flag set,
    // so the user can retry via the normal Save button.
    showToast('Version bumped in memory — save failed, press Save to retry', 'error');
  }
}

/* ── Unlock dialog ── */

function sameVersion(a: string, b: string | undefined): boolean {
  const pa = parseVersion(a),
    pb = parseVersion(b);
  return pa.major === pb.major && pa.minor === pb.minor && pa.patch === pb.patch;
}

export function openUnlockDialog(): void {
  const m = getModel();
  if (!m) {
    showToast('No model loaded', 'error');
    return;
  }
  const releases = (m.changelog && m.changelog.releases) || [];
  if (!releases.length) return;
  const release = releases[0] as ChangelogRelease;
  const open = (m.changelog && m.changelog.open) || [];

  const count = (release.entries || []).length;
  const versionMatches = sameVersion(release.version, m.version);
  const revertTo = releases.length > 1 ? (releases[1] as ChangelogRelease).version : '0.0.0';

  const versionLine = versionMatches
    ? `Version: <span>${escapeHtml(m.version || '(none)')}</span> → <span>${escapeHtml(revertTo)}</span>`
    : `Version stays at <span>${escapeHtml(m.version || '(none)')}</span> — it was bumped past this release.`;

  const warns: string[] = [];
  if (open.length) warns.push(`Merged in front of your ${open.length} current open ${open.length === 1 ? 'entry' : 'entries'}.`);
  if (isDirty()) warns.push('Unlock & save will save all pending changes.');

  const overlay = document.createElement('div');
  overlay.className = 'ca-av-overlay';
  const popup = document.createElement('div');
  popup.className = 'ca-bump-popup';
  popup.innerHTML = `
        <div class="ca-bump-title">Unlock release v${escapeHtml(release.version || '?')}</div>
        <div class="ca-bump-current">Released: <span>${escapeHtml(release.date || '?')}</span></div>
        <div class="ca-bump-summary">${count} ${count === 1 ? 'entry moves' : 'entries move'} back to open changes, so the release can be amended and re-published.<br>${versionLine}</div>
        <div class="ca-bump-msg${warns.length ? ' ca-bump-warn' : ''}">${escapeHtml(warns.join(' '))}</div>
        <div class="ca-av-footer">
            <button class="ca-av-btn-cancel">Cancel</button>
            <button class="ca-av-btn-save">Unlock &amp; save</button>
        </div>
    `;
  overlay.appendChild(popup);
  document.body.appendChild(overlay);

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') close();
  };
  const close = (): void => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  document.addEventListener('keydown', onKey);

  (popup.querySelector('.ca-av-btn-save') as HTMLElement).addEventListener('click', () => {
    close();
    performUnlock();
  });
  (popup.querySelector('.ca-av-btn-cancel') as HTMLElement).addEventListener('click', close);
  popup.addEventListener('click', (e) => e.stopPropagation());
  overlay.addEventListener('click', close);
}

// The inverse of performBump: pull the newest release's entries back into
// open (in front of any current open entries — they are older), drop the
// release from history and revert the working version, then save to disk.
export async function performUnlock(): Promise<void> {
  const m = getModel();
  if (!m || !m.changelog || !(m.changelog.releases || []).length) return;
  const cl = ensureChangelog(m);
  const release = cl.releases.shift() as ChangelogRelease;

  cl.open = (release.entries || []).concat(cl.open);

  // Only revert the version while it still matches the unlocked release;
  // a later entry-less bump means a newer version was chosen on purpose.
  if (sameVersion(release.version, m.version)) {
    const newest = cl.releases[0];
    m.version = newest ? newest.version : '0.0.0';
  }

  setDirty(true);
  updateToolbarInfo();
  if (state.apiActiveEntity === '__general__') showGeneralView();

  const ok = await editorSave();
  if (!ok) {
    // Not reverted: the unlock stays in memory with the dirty flag set,
    // so the user can retry via the normal Save button.
    showToast('Release unlocked in memory — save failed, press Save to retry', 'error');
  }
}

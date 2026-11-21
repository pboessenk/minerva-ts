/**
 * Import dialog of the allowed-values picker.
 */
import type { SourceValue } from './types.ts';
import { escapeHtml } from '../base/ui.ts';

/**
 * Sub-dialog for the allowed-values picker: paste a comma/semicolon/newline
 * separated list of codes. Validation is strict (exact match against the
 * picker's source values) — a single unmatched token aborts the whole import.
 * Two states in one dialog: input (textarea) → review (diff of New/Removed
 * codes with descriptions). Apply REPLACES the contents of workingSet and
 * calls onApplied(). Never persists — the picker's Save button still commits.
 * `workingSet` is mutated in place on Apply; `onApplied` re-renders.
 */
export function _openAllowedValuesImport(sourceValues: SourceValue[], workingSet: Set<string>, onApplied: () => void): void {
  const codeSet = new Set(sourceValues.map((v) => v.code));
  const descMap = new Map(sourceValues.map((v) => [v.code, v.desc]));

  const overlay = document.createElement('div');
  overlay.className = 'fn-prompt-overlay';
  overlay.innerHTML = `
        <div class="fn-prompt" style="width:480px">
            <div class="fn-prompt-title">Import allowed values</div>
            <div class="ca-imp-state-input">
                <textarea class="fn-prompt-input" rows="6" spellcheck="false"
                    style="min-height:120px;resize:vertical;font-size:13px;line-height:1.5;"
                    placeholder="Paste codes separated by commas, semicolons or newlines — e.g. 1, 3, 6"></textarea>
                <div class="fn-prompt-error" style="display:none"></div>
                <div class="fn-prompt-actions">
                    <button class="fn-prompt-btn fn-prompt-cancel">Cancel</button>
                    <button class="fn-prompt-btn fn-prompt-confirm" data-action="review">Import</button>
                </div>
            </div>
            <div class="ca-imp-state-review" style="display:none">
                <div class="ca-imp-review"></div>
                <div class="fn-prompt-actions">
                    <button class="fn-prompt-btn fn-prompt-cancel" data-action="back">Back</button>
                    <button class="fn-prompt-btn fn-prompt-confirm" data-action="apply">Apply</button>
                </div>
            </div>
        </div>`;
  document.body.appendChild(overlay);

  const titleEl = overlay.querySelector('.fn-prompt-title')!;
  const inputState = overlay.querySelector<HTMLElement>('.ca-imp-state-input')!;
  const reviewState = overlay.querySelector<HTMLElement>('.ca-imp-state-review')!;
  const reviewEl = overlay.querySelector('.ca-imp-review')!;
  const applyBtn = overlay.querySelector<HTMLButtonElement>('[data-action="apply"]')!;
  const ta = overlay.querySelector('textarea')!;
  const errEl = overlay.querySelector<HTMLElement>('.fn-prompt-error')!;
  let pendingTokens: string[] | null = null; // validated tokens awaiting Apply (null in input state / no-op)

  function showError(msg: string) {
    errEl.textContent = msg; // textContent: tokens are user-pasted text
    errEl.style.display = 'block';
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      // Plain Enter stays a newline (it is a valid separator)
      e.preventDefault();
      if (reviewState.style.display === 'none') review();
      else if (!applyBtn.disabled) applyImport();
    }
  }

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }

  function diffRows(codes: string[]) {
    return codes
      .map((c) => {
        const desc = descMap.get(c);
        return `<div class="ca-imp-row"><span class="ca-imp-code">${escapeHtml(c)}</span>${desc ? `<span class="ca-imp-desc">${escapeHtml(desc)}</span>` : ''}</div>`;
      })
      .join('');
  }

  function review() {
    const tokens = [
      ...new Set(
        ta.value
          .split(/[,;\n]/)
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    ];
    if (tokens.length === 0) {
      showError('Enter at least one code — an empty selection means "allow all" and must be set via Reset.');
      return;
    }
    const unmatched = tokens.filter((t) => !codeSet.has(t));
    if (unmatched.length > 0) {
      const shown = unmatched.slice(0, 20).join(', ');
      const more = unmatched.length > 20 ? ` … and ${unmatched.length - 20} more` : '';
      showError(`Nothing imported — ${unmatched.length} code(s) not in the list: ${shown}${more}`);
      return;
    }

    const tokenSet = new Set(tokens);
    const added = tokens.filter((t) => !workingSet.has(t));
    const removed = [...workingSet].filter((c) => !tokenSet.has(c)).sort();
    const unchanged = tokens.length - added.length;
    const wasAllowAll = workingSet.size === 0;
    const isNoop = added.length === 0 && removed.length === 0;

    let html = '';
    if (isNoop) {
      html = `<div class="ca-imp-note">No changes — the imported list matches the current selection (${tokens.length} code(s)).</div>`;
    } else {
      if (added.length > 0) {
        html += `<div class="ca-imp-section-h ca-imp-added">New (${added.length})</div><div class="ca-imp-list">${diffRows(added)}</div>`;
      }
      if (removed.length > 0) {
        html += `<div class="ca-imp-section-h ca-imp-removed">Removed (${removed.length})</div><div class="ca-imp-list">${diffRows(removed)}</div>`;
      }
      if (wasAllowAll) {
        html += `<div class="ca-imp-note">Currently all values are allowed — this import restricts the selection to ${tokens.length} code(s).</div>`;
      }
      if (unchanged > 0) {
        html += `<div class="ca-imp-note">Unchanged: ${unchanged} code(s) already selected.</div>`;
      }
    }
    reviewEl.innerHTML = html;
    applyBtn.disabled = isNoop;
    pendingTokens = isNoop ? null : tokens;
    titleEl.textContent = 'Review import';
    inputState.style.display = 'none';
    reviewState.style.display = '';
    (isNoop ? overlay.querySelector<HTMLElement>('[data-action="back"]')! : applyBtn).focus();
  }

  function back() {
    pendingTokens = null;
    titleEl.textContent = 'Import allowed values';
    reviewState.style.display = 'none';
    inputState.style.display = '';
    ta.focus();
  }

  function applyImport() {
    if (!pendingTokens) return;
    workingSet.clear();
    pendingTokens.forEach((c) => workingSet.add(c));
    onApplied();
    close();
  }

  ta.addEventListener('input', () => {
    errEl.style.display = 'none';
  });
  overlay.querySelector('[data-action="review"]')!.addEventListener('click', review);
  overlay.querySelector('[data-action="back"]')!.addEventListener('click', back);
  applyBtn.addEventListener('click', applyImport);
  overlay.querySelector('.fn-prompt-cancel:not([data-action])')!.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);
  ta.focus();
}

/**
 * Editor export: filename prompt, download-to-file, and copy-to-clipboard.
 */
import { exposeFunctions } from '../globals.ts';
import { state } from './state.ts';
import { escapeHtml, showToast } from '../base/ui.ts';

/** An extra checkbox in an export prompt. */
export interface PromptOption {
  id: string;
  label: string;
  checked?: boolean;
  note?: string;
  /** Id of the option this one is enabled by. */
  dependsOn?: string;
  /** With `dependsOn`: enabled while that option is unchecked instead. */
  invert?: boolean;
}

export interface FilenamePromptResult {
  filename: string;
  options: Record<string, boolean>;
}

export function toggleExportDropdown(): void {
  const dd = document.getElementById('exportDropdown');
  if (dd) dd.classList.toggle('visible');
}

/**
 * Show filename prompt with optional extra options (checkboxes).
 * @param defaultName Pre-filled filename
 * @param options Extra checkboxes
 * @returns null if cancelled
 */
export function showFilenamePrompt(defaultName: string, options?: PromptOption[]): Promise<FilenamePromptResult | null> {
  return new Promise((resolve) => {
    // Remove any existing prompt
    const existing = document.getElementById('filenamePrompt');
    if (existing) existing.remove();

    let optionsHtml = '';
    if (options && options.length) {
      optionsHtml =
        '<div class="fn-prompt-options">' +
        options
          .map((o) => {
            const disabledAttr = o.dependsOn ? (o.invert ? '' : ' disabled') : '';
            const depAttr = o.dependsOn ? ` data-depends-on="${escapeHtml(o.dependsOn)}"` : '';
            const invertAttr = o.invert ? ' data-depends-invert="1"' : '';
            const noteHtml = o.note ? `<div class="fn-prompt-option-note">${escapeHtml(o.note)}</div>` : '';
            const initialDisabled = o.dependsOn && o.invert ? ' disabled' : disabledAttr;
            return (
              `<label class="fn-prompt-option${initialDisabled ? ' fn-prompt-option-disabled' : ''}">` +
              `<input type="checkbox" data-option="${escapeHtml(o.id)}"${o.checked ? ' checked' : ''}${initialDisabled}${depAttr}${invertAttr} />` +
              `<span>${escapeHtml(o.label)}</span></label>${noteHtml}`
            );
          })
          .join('') +
        '</div>';
    }

    const overlay = document.createElement('div');
    overlay.id = 'filenamePrompt';
    overlay.className = 'fn-prompt-overlay';
    overlay.innerHTML = `
            <div class="fn-prompt">
                <div class="fn-prompt-title">Export filename</div>
                <input class="fn-prompt-input" type="text" value="${escapeHtml(defaultName)}" spellcheck="false" />
                ${optionsHtml}
                <div class="fn-prompt-actions">
                    <button class="fn-prompt-btn fn-prompt-cancel">Cancel</button>
                    <button class="fn-prompt-btn fn-prompt-confirm">Export</button>
                </div>
            </div>
        `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('.fn-prompt-input') as HTMLInputElement;
    const confirmBtn = overlay.querySelector('.fn-prompt-confirm') as HTMLButtonElement;
    const cancelBtn = overlay.querySelector('.fn-prompt-cancel') as HTMLButtonElement;

    // Select just the name part (before the extension)
    const dotIdx = defaultName.lastIndexOf('.');
    input.focus();
    if (dotIdx > 0) {
      input.setSelectionRange(0, dotIdx);
    } else {
      input.select();
    }

    function collectResult(): FilenamePromptResult | null {
      const filename = input.value.trim() || null;
      if (!filename) return null;
      return { filename, options: collectOptions(overlay) };
    }

    function close(cancelled: boolean): void {
      overlay.remove();
      resolve(cancelled ? null : collectResult());
    }

    confirmBtn.onclick = () => close(false);
    cancelBtn.onclick = () => close(true);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(true);
    });

    wireDependentOptions(overlay);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') close(false);
      if (e.key === 'Escape') close(true);
    });
  });
}

/** Reads the checkbox states of a prompt. */
function collectOptions(overlay: HTMLElement): Record<string, boolean> {
  const opts: Record<string, boolean> = {};
  overlay.querySelectorAll<HTMLInputElement>('[data-option]').forEach((cb) => {
    opts[cb.dataset.option as string] = cb.checked;
  });
  return opts;
}

/** Wire up dependsOn: enable/disable dependent checkboxes. */
function wireDependentOptions(overlay: HTMLElement): void {
  overlay.querySelectorAll<HTMLInputElement>('[data-option]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const id = cb.dataset.option;
      overlay.querySelectorAll<HTMLInputElement>(`[data-depends-on="${id}"]`).forEach((dep) => {
        const invert = dep.dataset.dependsInvert === '1';
        const shouldDisable = invert ? cb.checked : !cb.checked;
        dep.disabled = shouldDisable;
        (dep.closest('label') as HTMLLabelElement).classList.toggle('fn-prompt-option-disabled', shouldDisable);
        if (shouldDisable && !invert) dep.checked = false;
      });
    });
  });
}

/**
 * Show options-only prompt (no filename). Used by clipboard copy for formats with options.
 * @param title Prompt title
 * @returns options map, or null if cancelled
 */
export function showOptionsPrompt(title: string, options: PromptOption[]): Promise<Record<string, boolean> | null> {
  return new Promise((resolve) => {
    const existing = document.getElementById('filenamePrompt');
    if (existing) existing.remove();

    const optionsHtml =
      '<div class="fn-prompt-options">' +
      options
        .map((o) => {
          const disabledAttr = o.dependsOn ? (o.invert ? '' : ' disabled') : '';
          const depAttr = o.dependsOn ? ` data-depends-on="${escapeHtml(o.dependsOn)}"` : '';
          const invertAttr = o.invert ? ' data-depends-invert="1"' : '';
          const noteHtml = o.note ? `<div class="fn-prompt-option-note">${escapeHtml(o.note)}</div>` : '';
          const initialDisabled = o.dependsOn && o.invert ? ' disabled' : disabledAttr;
          return (
            `<label class="fn-prompt-option${initialDisabled ? ' fn-prompt-option-disabled' : ''}">` +
            `<input type="checkbox" data-option="${escapeHtml(o.id)}"${o.checked ? ' checked' : ''}${initialDisabled}${depAttr}${invertAttr} />` +
            `<span>${escapeHtml(o.label)}</span></label>${noteHtml}`
          );
        })
        .join('') +
      '</div>';

    const overlay = document.createElement('div');
    overlay.id = 'filenamePrompt';
    overlay.className = 'fn-prompt-overlay';
    overlay.innerHTML = `
            <div class="fn-prompt">
                <div class="fn-prompt-title">${escapeHtml(title)}</div>
                ${optionsHtml}
                <div class="fn-prompt-actions">
                    <button class="fn-prompt-btn fn-prompt-cancel">Cancel</button>
                    <button class="fn-prompt-btn fn-prompt-confirm">Copy</button>
                </div>
            </div>
        `;
    document.body.appendChild(overlay);

    const confirmBtn = overlay.querySelector('.fn-prompt-confirm') as HTMLButtonElement;
    const cancelBtn = overlay.querySelector('.fn-prompt-cancel') as HTMLButtonElement;

    function close(cancelled: boolean): void {
      overlay.remove();
      resolve(cancelled ? null : collectOptions(overlay));
    }

    confirmBtn.onclick = () => close(false);
    cancelBtn.onclick = () => close(true);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(true);
    });

    wireDependentOptions(overlay);

    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') close(false);
      if (e.key === 'Escape') close(true);
    });
  });
}

// HTML export options.
const HTML_EXPORT_OPTIONS: PromptOption[] = [
  {
    id: 'includeInternalDocs',
    label: 'Include internal documentation',
    checked: true,
    note:
      'When unchecked, strips entity & enum top banners (open points) ' +
      'and attribute internal notes from the exported page. ' +
      'Description is always exported.',
  },
];

/**
 * Build export scope options: "All entities" checkbox + per-root-entity checkboxes.
 * Returns an array of option objects compatible with showFilenamePrompt/showOptionsPrompt.
 */
function buildScopeOptions(): PromptOption[] {
  const roots: string[] = [];
  if (state.apiModel) {
    for (const [name, ent] of Object.entries(state.apiModel)) {
      if (ent.root) roots.push(name);
    }
  }
  roots.sort();
  if (roots.length < 2) return []; // No point showing scope if <2 roots
  const opts: PromptOption[] = [{ id: 'exportAll', label: 'All entities (full export)', checked: true }];
  for (const name of roots) {
    opts.push({ id: 'root_' + name, label: name, checked: true, dependsOn: 'exportAll', invert: true });
  }
  return opts;
}

/**
 * Given collected prompt options, build the `roots=` query param value.
 * Returns empty string when all entities should be exported.
 */
function buildRootsParam(opts: Record<string, boolean> | null): string {
  if (!opts || opts.exportAll) return '';
  const roots: string[] = [];
  for (const [key, val] of Object.entries(opts)) {
    if (key.startsWith('root_') && val) {
      roots.push(key.slice(5));
    }
  }
  return roots.length > 0 ? roots.join(',') : '';
}

export async function editorExport(format: string): Promise<void> {
  // Close dropdown
  const dd = document.getElementById('exportDropdown');
  if (dd) dd.classList.remove('visible');

  // Export scope options (root entity checkboxes)
  const scopeOptions = buildScopeOptions();

  // Format-specific prompt options
  const formatOptions: PromptOption[] =
    format === 'csv'
      ? [
          { id: 'entityGap', label: 'Add empty row between each entity' },
          { id: 'includeEnums', label: 'Export ENUMs' },
          { id: 'includeTechEnums', label: 'Export technical ENUMs', dependsOn: 'includeEnums' },
        ]
      : format === 'html'
        ? HTML_EXPORT_OPTIONS
        : [];

  const promptOptions = [...scopeOptions, ...formatOptions];

  // Determine default filename
  const apiConfig = state.apiConfig;
  const apiName = apiConfig && apiConfig.name ? apiConfig.name.toLowerCase() : 'api';
  const defaultFilename = apiName + '_model.' + format;

  try {
    const result = await showFilenamePrompt(defaultFilename, promptOptions);
    if (!result) return; // cancelled

    // Build query params, including any prompt options
    const params = new URLSearchParams({ format });
    if (apiConfig && apiConfig.dataPath) params.set('model', apiConfig.dataPath.split('/').pop() as string);
    const rootsParam = buildRootsParam(result.options);
    if (rootsParam) params.set('roots', rootsParam);
    if (result.options.entityGap) params.set('entityGap', '1');
    if (result.options.includeEnums) params.set('includeEnums', '1');
    if (result.options.includeTechEnums) params.set('includeTechEnums', '1');
    // HTML: includeInternalDocs defaults to true; only send the flag when explicitly disabled.
    if (format === 'html' && result.options.includeInternalDocs === false) {
      params.set('includeInternalDocs', '0');
    }

    const resp = await fetch('/api/export?' + params.toString());
    if (!resp.ok) {
      const msg = await resp.text();
      throw new Error(msg || `HTTP ${resp.status}`);
    }

    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported: ' + result.filename);
  } catch (err) {
    showToast('Export failed: ' + (err as Error).message, 'error');
  }
}

export async function editorExportToClipboard(format: string): Promise<void> {
  const dd = document.getElementById('exportDropdown');
  if (dd) dd.classList.remove('visible');

  // Export scope options (root entity checkboxes)
  const allOptions = buildScopeOptions();

  try {
    const params = new URLSearchParams({ format });
    const apiConfig = state.apiConfig;
    if (apiConfig && apiConfig.dataPath) params.set('model', apiConfig.dataPath.split('/').pop() as string);

    if (allOptions.length > 0) {
      const opts = await showOptionsPrompt('Copy to clipboard', allOptions);
      if (!opts) return; // cancelled
      const rootsParam = buildRootsParam(opts);
      if (rootsParam) params.set('roots', rootsParam);
    }

    const resp = await fetch('/api/export?' + params.toString());
    if (!resp.ok) {
      const msg = await resp.text();
      throw new Error(msg || `HTTP ${resp.status}`);
    }

    const text = await resp.text();
    await navigator.clipboard.writeText(text);
    showToast('Copied ' + format.toUpperCase() + ' to clipboard');
  } catch (err) {
    showToast('Copy failed: ' + (err as Error).message, 'error');
  }
}

/** Exposes the export functions the toolbar markup calls from inline handlers. */
export function install(): void {
  // These serve inline handlers in the markup (onclick="name(...)" and the like).
  exposeFunctions({
    toggleExportDropdown,
    editorExport,
    editorExportToClipboard,
  });
}

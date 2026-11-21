/**
 * Editor attribute filter: inline search bar inside the entity detail
 * attribute table. Filters rows by attribute name, type, description,
 * codelist, SIVI reference, and notes. Composes with subtype filtering.
 */
import { exposeFunctions } from '../globals.ts';
import { filterBySubtype } from '../editors/entity-render.ts';

interface AttrFilterState {
  debounce: number | undefined;
}

const attrFilter = {} as AttrFilterState;

/**
 * Filter attribute table rows by search query.
 * Composes with the subtype filter — a row is visible only if it
 * passes BOTH the subtype filter and the text filter.
 */
export function filterAttrs(): void {
  const input = document.getElementById('caAttrFilter') as HTMLInputElement | null;
  if (!input) return;

  clearTimeout(attrFilter.debounce);
  attrFilter.debounce = setTimeout(() => {
    // Re-run subtype filter first (it resets visibility, then calls _applyAttrFilter)
    const subtypeSelect = document.getElementById('caSubtypeFilter') as HTMLSelectElement | null;
    const firstDataRow = document.querySelector<HTMLElement>('.ca-attr-table tbody tr[data-entity]');
    const entityName = firstDataRow ? firstDataRow.dataset.entity : null;
    if (entityName && subtypeSelect) {
      filterBySubtype(entityName, subtypeSelect.value);
    } else {
      // No subtype filter — reset all data rows to visible, then apply text filter
      document.querySelectorAll<HTMLElement>('.ca-attr-table tbody tr').forEach((row) => {
        if (!row.classList.contains('ca-section-row') && !row.classList.contains('ca-drop-end-row')) {
          row.style.display = '';
        }
      });
      applyAttrFilter(input.value.trim());
    }
  }, 100);
}

export function applyAttrFilter(query: string): void {
  const rows = document.querySelectorAll<HTMLElement>('.ca-attr-table tbody tr');
  if (!rows.length) return;

  const q = query.toLowerCase();
  if (!q) return; // No text query — leave visibility as-is (subtype filter already set it)

  rows.forEach((row) => {
    // Section rows stay visible
    if (row.classList.contains('ca-section-row') || row.classList.contains('ca-drop-end-row')) {
      return;
    }

    // If already hidden by subtype filter, don't touch
    if (row.style.display === 'none') return;

    const attrName = row.dataset.attr;
    if (!attrName) return;

    // Build searchable text from row content + attr name + constraints
    // (rules render as an icon only, so match the data attribute)
    const text = (row.textContent as string).toLowerCase();
    const nameMatch = attrName.toLowerCase().includes(q);
    const rulesMatch = (row.dataset.constraints || '').toLowerCase().includes(q);

    if (!nameMatch && !rulesMatch && !text.includes(q)) {
      row.style.display = 'none';
    }
  });
}

/**
 * Reset the attribute filter (called when switching entities).
 */
export function resetAttrFilter(): void {
  const input = document.getElementById('caAttrFilter') as HTMLInputElement | null;
  if (input) input.value = '';
}

/** Creates the filter state and exposes the filter handler of the markup. */
export function install(): void {
  attrFilter.debounce = undefined;

  // These serve inline handlers in the markup (onclick="name(...)" and the like).
  exposeFunctions({
    filterAttrs,
  });
}

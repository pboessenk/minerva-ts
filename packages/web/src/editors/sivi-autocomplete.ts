/**
 * SIVI Reference cell: an input with an autocomplete dropdown over the
 * datacat paths.
 */
import { updateAttribute } from './attr-update.ts';
import { _siviAttrInfo, getSiviPaths } from './sivi.ts';
import { renderEntityDetail } from './entity-render.ts';
import { datacat } from './model-access.ts';
import { escapeHtml } from '../base/ui.ts';
import { loadDatacat } from '../base/datacat.ts';

/**
 * Make a SIVI Reference cell editable with autocomplete.
 */
export async function makeSiviAutocomplete(cell: HTMLElement, entityName: string, attrName: string, currentValue: string): Promise<void> {
  if (cell.querySelector('.ca-autocomplete-wrap')) return;

  // Ensure datacat is loaded for autocomplete
  if (!datacat()) {
    await loadDatacat();
  }

  const originalHtml = cell.innerHTML;
  const siviPaths = getSiviPaths();

  // Create autocomplete wrapper (dropdown attached to body for fixed positioning)
  cell.innerHTML = `
        <div class="ca-autocomplete-wrap">
            <input type="text" class="ca-edit-input ca-autocomplete-input" value="${escapeHtml(currentValue || '')}" placeholder="e.g. claim.fileNumber">
        </div>
    `;

  // Create dropdown attached to body
  const dropdown = document.createElement('div');
  dropdown.className = 'ca-autocomplete-dropdown ca-dropdown-fixed';
  dropdown.style.display = 'none';
  document.body.appendChild(dropdown);

  const input = cell.querySelector<HTMLInputElement>('.ca-autocomplete-input')!;
  input.focus();
  input.select();

  const positionDropdown = () => {
    const rect = input.getBoundingClientRect();
    const dropdownHeight = 210; // max-height + some padding
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    dropdown.style.left = rect.left + 'px';
    dropdown.style.minWidth = Math.max(250, rect.width) + 'px';

    if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
      dropdown.style.top = 'auto';
      dropdown.style.bottom = window.innerHeight - rect.top + 2 + 'px';
    } else {
      dropdown.style.bottom = 'auto';
      dropdown.style.top = rect.bottom + 2 + 'px';
    }
  };

  let selectedIndex = -1;

  const updateDropdown = () => {
    const query = input.value.toLowerCase().trim();
    if (!query) {
      dropdown.innerHTML = '';
      dropdown.style.display = 'none';
      return;
    }

    const matches = siviPaths.filter((p) => p.path.toLowerCase().includes(query));

    if (matches.length === 0) {
      dropdown.innerHTML = '<div class="ca-autocomplete-empty">No matches</div>';
      positionDropdown();
      dropdown.style.display = 'block';
      return;
    }

    dropdown.innerHTML = matches
      .map(
        (m, i) => `
            <div class="ca-autocomplete-item${i === selectedIndex ? ' selected' : ''}" data-path="${escapeHtml(m.path)}">
                <div class="ca-ac-main">
                    <span class="ca-ac-path">${escapeHtml(m.path)}</span>
                    ${m.datatype ? `<span class="ca-ac-type">${escapeHtml(m.datatype)}</span>` : ''}
                </div>
                ${m.desc ? `<div class="ca-ac-desc">${escapeHtml(m.desc)}</div>` : ''}
                ${m.etCount && m.etTotal && m.etCount < m.etTotal ? `<div class="ca-ac-subtypes">${m.etCount} of ${m.etTotal} subtypes</div>` : ''}
            </div>
        `,
      )
      .join('');
    positionDropdown();
    dropdown.style.display = 'block';

    // Add click handlers
    dropdown.querySelectorAll<HTMLElement>('.ca-autocomplete-item').forEach((item) => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        input.value = item.dataset.path!;
        save();
      });
    });
  };

  // Picking an item or pressing Enter saves at once; leaving the input saves
  // 150 ms later (so a click on an item lands first); Escape cancels. Only
  // the first of these counts: the others would save again, or save after a
  // cancel, once the input is removed and fires its blur.
  let done = false;
  const save = () => {
    if (done) return;
    done = true;
    const newValue = input.value.trim() || null;
    dropdown.remove();
    if (newValue !== currentValue) {
      if (updateAttribute(entityName, attrName, 'siviReference', newValue)) {
        // Auto-fill name, type, codelist for new empty-name attributes
        if (newValue && attrName === '') {
          const dotIdx = newValue.indexOf('.');
          const derivedName = dotIdx >= 0 ? newValue.substring(dotIdx + 1) : newValue;
          const info = _siviAttrInfo(newValue);
          updateAttribute(entityName, '', 'name', derivedName);
          if (info && info.type) updateAttribute(entityName, derivedName, 'type', info.type);
          if (info && info.codelist) updateAttribute(entityName, derivedName, 'siviCodelist', info.codelist);
        }
        renderEntityDetail(entityName);
      } else {
        cell.innerHTML = originalHtml;
      }
    } else {
      cell.innerHTML = originalHtml;
    }
  };

  const cancel = () => {
    if (done) return;
    done = true;
    dropdown.remove();
    cell.innerHTML = originalHtml;
  };

  input.addEventListener('input', () => {
    selectedIndex = -1;
    updateDropdown();
  });

  input.addEventListener('blur', () => {
    setTimeout(save, 150);
  });

  input.addEventListener('keydown', (e) => {
    const items = dropdown.querySelectorAll<HTMLElement>('.ca-autocomplete-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = Math.min(selectedIndex + 1, items.length - 1);
      updateDropdown();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = Math.max(selectedIndex - 1, -1);
      updateDropdown();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && items[selectedIndex]) {
        input.value = items[selectedIndex]!.dataset.path!;
      }
      save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    } else if (e.key === 'Tab') {
      if (selectedIndex >= 0 && items[selectedIndex]) {
        e.preventDefault();
        input.value = items[selectedIndex]!.dataset.path!;
        save();
      }
    }
  });

  updateDropdown();
}

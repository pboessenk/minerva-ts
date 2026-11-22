/**
 * SIVI Codelist cell: an input with a picker over the shared codelists.
 */
import { updateAttribute } from './attr-update.ts';
import { renderEntityDetail } from './entity-render.ts';
import { codelistList } from './model-access.ts';
import { escapeHtml } from '../base/ui.ts';
import { loadCodelistData } from '../base/model-loader.ts';

/**
 * Make a SIVI Codelist cell editable with a picker.
 */
export async function makeCodelistPicker(cell: HTMLElement, entityName: string, attrName: string, currentValue: string): Promise<void> {
  if (cell.querySelector('.ca-autocomplete-wrap')) return;

  // Ensure codelist data is loaded
  if (!codelistList() || codelistList()!.length === 0) {
    await loadCodelistData();
  }

  const originalHtml = cell.innerHTML;

  cell.innerHTML = `
        <div class="ca-autocomplete-wrap">
            <input type="text" class="ca-edit-input ca-autocomplete-input" value="${escapeHtml(currentValue || '')}" placeholder="e.g. ADNSOZ">
        </div>
    `;

  const dropdown = document.createElement('div');
  dropdown.className = 'ca-autocomplete-dropdown ca-dropdown-fixed';
  dropdown.style.display = 'none';
  document.body.appendChild(dropdown);

  const input = cell.querySelector<HTMLInputElement>('.ca-autocomplete-input')!;
  input.focus();
  input.select();

  const positionDropdown = () => {
    const rect = input.getBoundingClientRect();
    const dropdownHeight = 210;
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
    const query = input.value.toUpperCase().trim();

    const matches = (codelistList() || []).filter((cl) => !query || cl.Name.toUpperCase().includes(query)).slice(0, 15);

    if (matches.length === 0) {
      dropdown.innerHTML = '<div class="ca-autocomplete-empty">No matches</div>';
      positionDropdown();
      dropdown.style.display = 'block';
      return;
    }

    dropdown.innerHTML = matches
      .map((cl, i) => {
        const codes = cl.Code || [];
        const preview = codes
          .slice(0, 3)
          .map((c) => c.CodeValue || c.Value || '')
          .join(', ');
        const more = codes.length > 3 ? `, … (+${codes.length - 3})` : '';
        return `
            <div class="ca-autocomplete-item${i === selectedIndex ? ' selected' : ''}" data-name="${escapeHtml(cl.Name)}">
                <div class="ca-ac-main">
                    <span class="ca-ac-path">${escapeHtml(cl.Name)}</span>
                    <span class="ca-ac-type">${codes.length} codes</span>
                </div>
                ${preview ? `<div class="ca-ac-desc">${escapeHtml(preview + more)}</div>` : ''}
            </div>`;
      })
      .join('');
    positionDropdown();
    dropdown.style.display = 'block';

    dropdown.querySelectorAll<HTMLElement>('.ca-autocomplete-item').forEach((item) => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        input.value = item.dataset.name!;
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
      if (updateAttribute(entityName, attrName, 'siviCodelist', newValue)) {
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
        input.value = items[selectedIndex]!.dataset.name!;
      }
      save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  });

  updateDropdown();
}

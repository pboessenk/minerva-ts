/**
 * "Copy as..." menu of the entity page: JSON example or TypeScript types.
 */
import { _buildEntityJSON, _buildEntityTS } from './entity-code.ts';
import { loadCodelistData } from '../base/model-loader.ts';

export function _toggleCopyMenu(_entityName: string): void {
  const menu = document.getElementById('caCopyMenu');
  if (!menu) return;
  menu.classList.toggle('open');
  if (menu.classList.contains('open')) {
    // Close on outside click
    setTimeout(() => {
      const close = (e: MouseEvent) => {
        if (!menu.contains(e.target as Node) && !menu.previousElementSibling!.contains(e.target as Node)) {
          menu.classList.remove('open');
          document.removeEventListener('click', close);
        }
      };
      document.addEventListener('click', close);
    });
  }
}

function _flashCopyBtn() {
  const btn = document.querySelector('.ca-copy-btn');
  if (btn) {
    btn.classList.add('copied');
    setTimeout(() => btn.classList.remove('copied'), 1500);
  }
  const menu = document.getElementById('caCopyMenu');
  if (menu) menu.classList.remove('open');
}

export async function _doCopy(entityName: string, format: string): Promise<void> {
  const subtypeSelect = document.getElementById('caSubtypeFilter') as HTMLSelectElement | null;
  const subtype = subtypeSelect ? subtypeSelect.value : '__base__';
  if (format === 'ts') {
    await loadCodelistData();
  }
  const text =
    format === 'ts' ? _buildEntityTS(entityName, subtype) : JSON.stringify(_buildEntityJSON(entityName, subtype, new Set()), null, 2);
  try {
    await navigator.clipboard.writeText(text);
    _flashCopyBtn();
  } catch (err) {
    console.error('Failed to copy:', err);
  }
}

/**
 * Column layout of the attribute table: which column groups (SIVI,
 * documentation) are shown, and resizable column widths. Both persist in
 * localStorage.
 */
import { renderEntityDetail } from './entity-render.ts';

interface ColGroups {
  sivi: boolean;
  docs: boolean;
}

// Column group visibility state (persists across re-renders and reloads)
let _colGroups: ColGroups;

export function getColGroups(): ColGroups {
  return _colGroups;
}

export function installColumns(): void {
  _colGroups = (() => {
    try {
      const s = JSON.parse(localStorage.getItem('minerva_colGroups')!);
      if (s) return s;
    } catch {
      /* ignore */
    }
    return { sivi: true, docs: true };
  })();
}

// ── Resizable columns ──
const _colDefaults: Record<string, number> = {
  'col-name': 190,
  'col-type': 80,
  'col-constraints': 44,
  'col-req': 40,
  'col-siviref': 170,
  'col-codelist': 75,
  'col-allowed': 85,
  'col-subtypes': 80,
  'col-sivipeek': 36,
  'col-docspeek': 36,
  'col-desc': 160,
  'col-example': 80,
  'col-notes': 160,
  'col-delete': 32,
};
const _LS_KEY = 'minerva_colWidths';

function _loadColWidths(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(_LS_KEY)!) || {};
  } catch {
    return {};
  }
}
function _saveColWidths(w: Record<string, number>): void {
  try {
    localStorage.setItem(_LS_KEY, JSON.stringify(w));
  } catch {
    /* ignore */
  }
}

function _applyColWidths(table: HTMLElement | null): void {
  if (!table) return;
  const stored = _loadColWidths();
  const ths = Array.from(table.querySelectorAll<HTMLElement>('thead th'));
  const entries = ths.map((th) => {
    const cls = Array.from(th.classList).find((c) => c.startsWith('col-'));
    const weight = cls ? (stored[cls] ?? _colDefaults[cls] ?? 80) : 80;
    return { th, cls, weight };
  });
  const total = entries.reduce((s, e) => s + e.weight, 0);
  entries.forEach((e) => {
    e.th.style.width = ((e.weight / total) * 100).toFixed(2) + '%';
  });
}

export function _initColResize(table: HTMLElement | null): void {
  if (!table) return;
  _applyColWidths(table);
  const ths = Array.from(table.querySelectorAll<HTMLElement>('thead th'));
  for (let i = 0; i < ths.length; i++) {
    const th = ths[i]!;
    const handle = th.querySelector<HTMLElement>('.ca-resize-handle');
    if (!handle) continue;
    const nextTh = ths[i + 1]!;
    if (!nextTh || nextTh.classList.contains('col-delete')) continue;
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const startX = e.clientX;
      const tableW = table.offsetWidth;
      const startPctL = parseFloat(th.style.width);
      const startPctR = parseFloat(nextTh.style.width);
      const onMove = (ev: MouseEvent) => {
        const deltaPct = ((ev.clientX - startX) / tableW) * 100;
        const newL = startPctL + deltaPct;
        const newR = startPctR - deltaPct;
        if (newL >= 2 && newR >= 2) {
          th.style.width = newL.toFixed(2) + '%';
          nextTh.style.width = newR.toFixed(2) + '%';
        }
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        // Convert percentages back to weight units and save
        const stored = _loadColWidths();
        const totalW = ths.reduce((s, t) => {
          const c = Array.from(t.classList).find((cl) => cl.startsWith('col-'));
          return s + (c ? (stored[c] ?? _colDefaults[c] ?? 80) : 80);
        }, 0);
        for (const t of [th, nextTh]) {
          const cls = Array.from(t.classList).find((c) => c.startsWith('col-'));
          if (cls) stored[cls] = Math.round((parseFloat(t.style.width) / 100) * totalW);
        }
        _saveColWidths(stored);
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }
}

export function toggleColGroup(group: keyof ColGroups): void {
  _colGroups[group] = !_colGroups[group];
  try {
    localStorage.setItem('minerva_colGroups', JSON.stringify(_colGroups));
  } catch {
    /* ignore */
  }
  // Re-render to recalculate table layout with correct columns
  const activeEntity = document.querySelector('.ca-attr-table');
  if (activeEntity) {
    const entityName = activeEntity.querySelector<HTMLElement>('tr[data-entity]');
    if (entityName) renderEntityDetail(entityName.dataset.entity!);
  }
}

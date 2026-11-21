/**
 * Drag and drop reordering of the attribute rows (and group headers).
 */
import { _syncAttrsToRawSections } from './groups.ts';
import { renderEntityDetail } from './entity-render.ts';
import { setDirty } from '../base/model-state.ts';
import { state } from '../editor/state.ts';

interface DragState {
  row: HTMLElement;
  entityName: string;
  dropTarget?: HTMLElement;
}

let _dragState: DragState | null;

export function installDragDrop(): void {
  _dragState = null;
}

export function initDragAndDrop(entityName: string): void {
  const tbody = document.querySelector<HTMLElement>('.ca-attr-table tbody');
  if (!tbody) return;

  tbody.addEventListener('mousedown', (e) => {
    const handle = (e.target as Element).closest('.ca-drag-handle');
    if (!handle) return;
    const row = handle.closest('tr');
    if (row) row.setAttribute('draggable', 'true');
  });

  tbody.addEventListener('mouseup', () => {
    tbody.querySelectorAll('tr[draggable]').forEach((r) => r.removeAttribute('draggable'));
  });

  tbody.addEventListener('dragstart', (e) => {
    const row = (e.target as Element).closest<HTMLElement>('tr[draggable]');
    if (!row) return;
    _dragState = { row, entityName };
    row.classList.add('ca-drag-active');
    tbody.classList.add('ca-dragging');
    e.dataTransfer!.effectAllowed = 'move';
    e.dataTransfer!.setData('text/plain', '');
  });

  tbody.addEventListener('dragend', (e) => {
    const row = (e.target as Element).closest('tr[data-attridx]');
    if (row) {
      row.classList.remove('ca-drag-active');
      row.removeAttribute('draggable');
    }
    tbody.classList.remove('ca-dragging');
    tbody.querySelectorAll('.ca-drop-above, .ca-drop-below').forEach((r) => r.classList.remove('ca-drop-above', 'ca-drop-below'));
    _dragState = null;
  });

  tbody.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    const target = (e.target as Element).closest<HTMLElement>('tr[data-attridx]');
    if (!target || !_dragState || target === _dragState.row) return;

    tbody.querySelectorAll('.ca-drop-above').forEach((r) => r.classList.remove('ca-drop-above'));
    target.classList.add('ca-drop-above');
    _dragState.dropTarget = target;
  });

  tbody.addEventListener('dragleave', (e) => {
    const target = (e.target as Element).closest('tr[data-attridx]');
    if (target) target.classList.remove('ca-drop-above');
  });

  tbody.addEventListener('drop', (e) => {
    e.preventDefault();
    if (!_dragState) return;

    const target = _dragState.dropTarget || (e.target as Element).closest<HTMLElement>('tr[data-attridx]');
    if (!target || target === _dragState.row) return;

    const rtEntity = state.apiModel![entityName];
    if (!rtEntity) return;

    const dragIdx = parseInt(_dragState.row.dataset.attridx!, 10);
    const targetIdx = parseInt(target.dataset.attridx!, 10);
    if (Number.isNaN(dragIdx) || Number.isNaN(targetIdx)) return;

    const [item] = rtEntity.attrs.splice(dragIdx, 1) as [import('./types.ts').RtAttr];

    let newIdx: number;
    if (target.classList.contains('ca-drop-end-row')) {
      newIdx = rtEntity.attrs.length;
    } else {
      newIdx = targetIdx;
      if (dragIdx < targetIdx) newIdx--;
    }
    rtEntity.attrs.splice(newIdx, 0, item);

    _syncAttrsToRawSections(entityName);
    setDirty(true);
    renderEntityDetail(entityName);
  });
}

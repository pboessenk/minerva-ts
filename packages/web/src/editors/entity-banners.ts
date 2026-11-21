/**
 * Banners (open points) of an entity: add, delete, change type, edit text.
 */
import type { OpenPoint } from '../editor/model-types.ts';
import { getRawModel } from './model-access.ts';
import { selectApiEntity } from '../editor/sidebar.ts';
import { setDirty } from '../base/model-state.ts';
import { state } from '../editor/state.ts';

function _getBannerList(entityName: string): OpenPoint[] | null {
  const e = state.apiModel![entityName];
  if (!e) return null;
  if (!e.openPoints) e.openPoints = [];
  return e.openPoints;
}

function _syncBannersToModel(entityName: string): void {
  const model = getRawModel()!;
  const ent = model.entities[entityName];
  if (!ent) return;
  ent.openPoints = (state.apiModel![entityName]!.openPoints || []).map((p) => ({ text: p.text, type: p.type }));
  setDirty(true);
}

export function addBanner(entityName: string): void {
  const points = _getBannerList(entityName);
  if (!points) return;
  points.push({ text: 'New note', type: 'info' });
  _syncBannersToModel(entityName);
  selectApiEntity(entityName);
}

export function deleteBanner(entityName: string, idx: number): void {
  const points = _getBannerList(entityName);
  if (!points || idx < 0 || idx >= points.length) return;
  points.splice(idx, 1);
  _syncBannersToModel(entityName);
  selectApiEntity(entityName);
}

export function cycleBannerType(entityName: string, idx: number): void {
  const points = _getBannerList(entityName);
  if (!points || idx < 0 || idx >= points.length) return;
  const cycle: OpenPoint['type'][] = ['info', 'warning', 'error'];
  const cur = cycle.indexOf(points[idx]!.type);
  points[idx]!.type = cycle[(cur + 1) % cycle.length]!;
  _syncBannersToModel(entityName);
  selectApiEntity(entityName);
}

export function editBannerText(entityName: string, idx: number, span: HTMLElement): void {
  const points = _getBannerList(entityName);
  if (!points || idx < 0 || idx >= points.length) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'ca-edit-input';
  input.value = points[idx]!.text;
  span.replaceWith(input);
  input.focus();
  input.select();

  function save() {
    const val = input.value.trim();
    if (val) points![idx]!.text = val;
    _syncBannersToModel(entityName);
    selectApiEntity(entityName);
  }
  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    }
    if (e.key === 'Escape') {
      selectApiEntity(entityName);
    }
  });
}

/**
 * Banners (open points) of an enum: add, delete, change type, edit text.
 */
import type { Banner } from './types.ts';
import { getRawModel } from './model-access.ts';
import { selectApiEntity } from '../editor/sidebar.ts';
import { setDirty } from '../base/model-state.ts';
import { state } from '../editor/state.ts';

function _getEnumBannerList(enumName: string): Banner[] | null {
  const en = state.apiEnums![enumName];
  if (!en) return null;
  if (!en.openPoints) en.openPoints = [];
  return en.openPoints;
}

function _syncEnumBannersToModel(enumName: string): void {
  const model = getRawModel()!;
  const rawEnum = model.enums?.[enumName];
  if (!rawEnum) return;
  rawEnum.openPoints = (state.apiEnums![enumName]!.openPoints || []).map((p) => ({ text: p.text, type: p.type }));
  setDirty(true);
}

export function addEnumBanner(enumName: string): void {
  const points = _getEnumBannerList(enumName);
  if (!points) return;
  points.push({ text: 'New note', type: 'info' });
  _syncEnumBannersToModel(enumName);
  selectApiEntity('enum:' + enumName);
}

export function deleteEnumBanner(enumName: string, idx: number): void {
  const points = _getEnumBannerList(enumName);
  if (!points || idx < 0 || idx >= points.length) return;
  points.splice(idx, 1);
  _syncEnumBannersToModel(enumName);
  selectApiEntity('enum:' + enumName);
}

export function cycleEnumBannerType(enumName: string, idx: number): void {
  const points = _getEnumBannerList(enumName);
  if (!points || idx < 0 || idx >= points.length) return;
  const cycle: Banner['type'][] = ['info', 'warning', 'error'];
  const cur = cycle.indexOf(points[idx]!.type);
  points[idx]!.type = cycle[(cur + 1) % cycle.length]!;
  _syncEnumBannersToModel(enumName);
  selectApiEntity('enum:' + enumName);
}

export function editEnumBannerText(enumName: string, idx: number, span: HTMLElement): void {
  const points = _getEnumBannerList(enumName);
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
    _syncEnumBannersToModel(enumName);
    selectApiEntity('enum:' + enumName);
  }
  input.addEventListener('blur', save);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    }
    if (e.key === 'Escape') {
      selectApiEntity('enum:' + enumName);
    }
  });
}

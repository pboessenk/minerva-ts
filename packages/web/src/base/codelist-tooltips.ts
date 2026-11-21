/**
 * Tooltips of the codelist and entity type viewer. They are also used by the
 * editor, which shows them over attribute cells.
 */
import { exposeFunctions } from '../globals.ts';
import { datacatEntities, loadDatacat } from './datacat.ts';
import {
  codelistData,
  codelistMap,
  type Codelist,
  type EntitySubtype,
  entityTypeData,
  loadCodelistData,
  loadEntityTypeData,
} from './model-loader.ts';
import { escapeHtml } from './ui.ts';
import { loadedModel, state } from '../editor/state.ts';

interface TooltipEnum {
  values?: { value?: string; note?: string; name?: string }[];
}

export function showParentEtTooltip(parentName: string, event: MouseEvent): void {
  const parent = entityTypeData ? entityTypeData[parentName] : null;
  if (!parent) return;

  const tip = document.getElementById('clTooltip') as HTMLElement;
  const subtypes = parent.subtypes || [];
  const preview = subtypes.slice(0, 10);
  const remaining = subtypes.length - preview.length;

  tip.innerHTML = `
        <h4>${escapeHtml(parentName)}</h4>
        <div class="cl-tt-desc">${escapeHtml(parent.description.substring(0, 120))}${parent.description.length > 120 ? '…' : ''}</div>
        <div class="cl-tt-row"><span class="cl-tt-code" style="color:#58a6ff">${subtypes.length} subtypes</span></div>
        ${preview.map((st) => `<div class="cl-tt-row"><span class="cl-tt-code">${escapeHtml(st.name)}</span><span class="cl-tt-val" style="color:#8b949e">${st.attrCount} attrs</span></div>`).join('')}
        ${remaining > 0 ? `<div class="cl-tt-more">+${remaining} more…</div>` : ''}
    `;
  positionClTooltip(event);
  tip.classList.add('visible');
}

export function showEtTooltip(key: string, event: MouseEvent): void {
  const [parentNamePart, ...rest] = key.split('.');
  const parentName = parentNamePart as string;
  const subtypeName = rest.join('.');
  const parent = entityTypeData ? entityTypeData[parentName] : null;
  if (!parent) return;
  const st = (parent.subtypes as EntitySubtype[]).find((s) => s.name === subtypeName);
  if (!st) return;

  const tip = document.getElementById('clTooltip') as HTMLElement;
  const clAttrs = (st.codelistAttrs || []).slice(0, 5);
  const remaining = (st.codelistAttrs || []).length - clAttrs.length;

  tip.innerHTML = `
        <h4>${escapeHtml(parentName)}.${escapeHtml(subtypeName)}</h4>
        <div class="cl-tt-desc">${escapeHtml(st.description.substring(0, 100))}${st.description.length > 100 ? '…' : ''}</div>
        <div class="cl-tt-row"><span class="cl-tt-code" style="color:#58a6ff">${st.attrCount} attrs</span><span class="cl-tt-val">${clAttrs.length > 0 ? clAttrs.length + ' codelist refs' : 'no codelist refs'}</span></div>
        ${clAttrs.map((a) => `<div class="cl-tt-row"><span class="cl-tt-code">${escapeHtml(a.name)}</span><span class="cl-tt-val" style="color:#a78bfa">${escapeHtml(a.codelist)}</span></div>`).join('')}
        ${remaining > 0 ? `<div class="cl-tt-more">+${remaining} more…</div>` : ''}
    `;
  positionClTooltip(event);
  tip.classList.add('visible');
}

export function showSiviTooltip(path: string, event: MouseEvent): void {
  if (!datacatEntities) {
    loadDatacat().then(() => showSiviTooltip(path, event));
    return;
  }
  if (!path) return;
  const dot = path.indexOf('.');
  if (dot < 0) return;
  const entityKey = path.substring(0, dot);
  const attrName = path.substring(dot + 1);

  // Case-insensitive entity lookup
  let entity = null;
  let entityName = entityKey;
  for (const [k, v] of Object.entries(datacatEntities)) {
    if (k.toLowerCase() === entityKey.toLowerCase()) {
      entity = v;
      entityName = k;
      break;
    }
  }
  if (!entity) return;

  // Collect attribute info across all entity types
  let foundAttr = null;
  const foundEtNames = [];
  const totalEts = (entity.entityTypes || []).length;
  for (const et of entity.entityTypes || []) {
    for (const a of et.attrs || []) {
      if (a.name === attrName) {
        if (!foundAttr) foundAttr = a;
        foundEtNames.push(et.name);
        break;
      }
    }
  }
  if (!foundAttr) return;

  const tip = document.getElementById('clTooltip') as HTMLElement;
  const desc = foundAttr.desc || '';
  const subtypeLabel = foundEtNames.length === totalEts ? `all ${totalEts} subtypes` : foundEtNames.join(', ');
  tip.innerHTML = `
        <h4>${escapeHtml(attrName)}</h4>
        ${desc ? `<div class="cl-tt-desc">${escapeHtml(desc.length > 160 ? desc.substring(0, 160) + '…' : desc)}</div>` : ''}
        <div class="cl-tt-row"><span class="cl-tt-code">Entity</span><span class="cl-tt-val">${escapeHtml(entityName)}</span></div>
        <div class="cl-tt-row"><span class="cl-tt-code">Subtypes</span><span class="cl-tt-val">${escapeHtml(subtypeLabel)}</span></div>
        <div class="cl-tt-row"><span class="cl-tt-code">Datatype</span><span class="cl-tt-val">${escapeHtml(foundAttr.datatype || '—')}</span></div>
        ${foundAttr.codelist ? `<div class="cl-tt-row"><span class="cl-tt-code">Codelist</span><span class="cl-tt-val" style="color:#a78bfa">${escapeHtml(foundAttr.codelist)}</span></div>` : ''}
    `;
  positionClTooltip(event);
  tip.classList.add('visible');
}

export function showClTooltip(name: string, event: MouseEvent): void {
  if (!codelistData) {
    // Lazy-load codelist data on first tooltip hover
    loadCodelistData().then(() => showClTooltip(name, event));
    return;
  }
  const cl = codelistMap[name];
  if (!cl) return;
  const tip = document.getElementById('clTooltip') as HTMLElement;
  const codes = cl.Code || [];
  const preview = codes.slice(0, 6);
  const remaining = codes.length - preview.length;

  tip.innerHTML = `
        <h4>${escapeHtml(cl.Name)}</h4>
        <div class="cl-tt-desc">${escapeHtml(cl.Description)}</div>
        ${preview.map((c) => `<div class="cl-tt-row"><span class="cl-tt-code">${escapeHtml(c.CodeValue)}</span><span class="cl-tt-val">${escapeHtml(c.Description)}</span></div>`).join('')}
        ${remaining > 0 ? `<div class="cl-tt-more">+${remaining} more…</div>` : ''}
    `;
  positionClTooltip(event);
  tip.classList.add('visible');
}

export function hideClTooltip(): void {
  (document.getElementById('clTooltip') as HTMLElement).classList.remove('visible');
}

export function showAllowedTooltip(entityName: string, attrName: string, event: MouseEvent): void {
  const rtEntity = loadedModel()[entityName];
  if (!rtEntity) return;
  const attr = rtEntity.attrs.find((a) => a.name === attrName);
  if (!attr || !attr.allowedValues || !attr.allowedValues.length) return;

  // Lazy-load source data if needed
  if (attr.codelist && (!codelistMap || !codelistMap[attr.codelist])) {
    loadCodelistData().then(() => showAllowedTooltip(entityName, attrName, event));
    return;
  }
  if (attr.sivi && attr.sivi.endsWith('.entityType') && !entityTypeData) {
    loadEntityTypeData().then(() => showAllowedTooltip(entityName, attrName, event));
    return;
  }

  const tip = document.getElementById('clTooltip') as HTMLElement;
  const vals = attr.allowedValues;
  const preview = vals.slice(0, 10);
  const remaining = vals.length - preview.length;
  const enumBase = (attr.type || '').replace(/\[\]$/, '');
  const isEnum = !!(state.apiEnums && state.apiEnums[enumBase]);
  let source: string;
  if (attr.codelist) source = attr.codelist;
  else if (attr.sivi && attr.sivi.endsWith('.entityType')) source = attr.sivi.replace('.entityType', '') + ' subtypes';
  else if (isEnum) source = enumBase + ' enum';
  else source = 'values';

  // Build a lookup for descriptions from the source data
  const descMap: Record<string, string> = {};
  if (attr.codelist && codelistMap && codelistMap[attr.codelist]) {
    for (const c of (codelistMap[attr.codelist] as Codelist).Code || []) {
      descMap[c.CodeValue || ''] = c.Description || '';
    }
  } else if (attr.sivi && attr.sivi.endsWith('.entityType') && entityTypeData) {
    const parent = attr.sivi.replace('.entityType', '');
    const entry = entityTypeData[parent];
    if (entry && entry.subtypes) {
      for (const s of entry.subtypes) {
        descMap[s.name || ''] = s.description || '';
      }
    }
  } else if (isEnum) {
    for (const v of ((state.apiEnums as Record<string, TooltipEnum>)[enumBase] as TooltipEnum).values || []) {
      descMap[v.value || ''] = v.note || v.name || '';
    }
  }

  tip.innerHTML = `
        <h4>Allowed ${escapeHtml(source)}</h4>
        ${preview
          .map((v) => {
            const desc = descMap[v] || '';
            return `<div class="cl-tt-row"><span class="cl-tt-code">${escapeHtml(v)}</span>${desc ? `<span class="cl-tt-val">${escapeHtml(desc)}</span>` : ''}</div>`;
          })
          .join('')}
        ${remaining > 0 ? `<div class="cl-tt-more">+${remaining} more…</div>` : ''}
    `;
  positionClTooltip(event);
  tip.classList.add('visible');
}

export function showSiviPeekTooltip(entityName: string, attrName: string, event: MouseEvent): void {
  const rtEntity = loadedModel()[entityName];
  if (!rtEntity) return;
  const attr = rtEntity.attrs.find((a) => a.name === attrName);
  if (!attr) return;

  const tip = document.getElementById('clTooltip') as HTMLElement;
  const rows = [];
  if (attr.sivi)
    rows.push(
      `<div class="cl-tt-row"><span class="cl-tt-code">Reference</span><span class="cl-tt-val">${escapeHtml(attr.sivi)}</span></div>`,
    );
  if (attr.codelist)
    rows.push(
      `<div class="cl-tt-row"><span class="cl-tt-code">Codelist</span><span class="cl-tt-val" style="color:#a78bfa">${escapeHtml(attr.codelist)}</span></div>`,
    );
  if (attr.allowedValues && attr.allowedValues.length) {
    rows.push(
      `<div class="cl-tt-row"><span class="cl-tt-code">Allowed</span><span class="cl-tt-val">${attr.allowedValues.length} values</span></div>`,
    );
  }
  if (attr.applicableSubtypes && attr.applicableSubtypes.length) {
    rows.push(
      `<div class="cl-tt-row"><span class="cl-tt-code">Subtypes</span><span class="cl-tt-val">${escapeHtml(attr.applicableSubtypes.join(', '))}</span></div>`,
    );
  }
  if (!rows.length) {
    rows.push(`<div class="cl-tt-row"><span class="cl-tt-val" style="opacity:0.5">No SIVI data</span></div>`);
  }
  tip.innerHTML = `<h4>${escapeHtml(attrName)}</h4>${rows.join('')}`;
  positionClTooltip(event);
  tip.classList.add('visible');
}

export function showDocsPeekTooltip(entityName: string, attrName: string, event: MouseEvent): void {
  const rtEntity = loadedModel()[entityName];
  if (!rtEntity) return;
  const attr = rtEntity.attrs.find((a) => a.name === attrName);
  if (!attr) return;

  const tip = document.getElementById('clTooltip') as HTMLElement;
  const rows = [];
  if (attr.description)
    rows.push(
      `<div class="cl-tt-row"><span class="cl-tt-code">Desc</span><span class="cl-tt-val">${escapeHtml(attr.description.length > 200 ? attr.description.substring(0, 200) + '\u2026' : attr.description)}</span></div>`,
    );
  if (attr.example)
    rows.push(
      `<div class="cl-tt-row"><span class="cl-tt-code">Example</span><span class="cl-tt-val" style="font-family:monospace">${escapeHtml(attr.example)}</span></div>`,
    );
  if (attr.note)
    rows.push(
      `<div class="cl-tt-row"><span class="cl-tt-code">Notes</span><span class="cl-tt-val">${escapeHtml(attr.note.length > 200 ? attr.note.substring(0, 200) + '\u2026' : attr.note)}</span></div>`,
    );
  if (!rows.length) {
    rows.push(`<div class="cl-tt-row"><span class="cl-tt-val" style="opacity:0.5">No documentation</span></div>`);
  }
  tip.innerHTML = `<h4>${escapeHtml(attrName)}</h4>${rows.join('')}`;
  positionClTooltip(event);
  tip.classList.add('visible');
}

export function showSubtypesTooltip(entityName: string, attrName: string, event: MouseEvent): void {
  const rtEntity = loadedModel()[entityName];
  if (!rtEntity) return;
  const attr = rtEntity.attrs.find((a) => a.name === attrName);
  if (!attr || !attr.applicableSubtypes || !attr.applicableSubtypes.length) return;

  const tip = document.getElementById('clTooltip') as HTMLElement;
  tip.innerHTML = `
        <h4>Applicable subtypes</h4>
        ${attr.applicableSubtypes.map((s) => `<div class="cl-tt-row"><span class="cl-tt-code">${escapeHtml(s)}</span></div>`).join('')}
    `;
  positionClTooltip(event);
  tip.classList.add('visible');
}

export function moveClTooltip(event: MouseEvent): void {
  positionClTooltip(event);
}

function positionClTooltip(event: MouseEvent): void {
  const tip = document.getElementById('clTooltip') as HTMLElement;
  const tipWidth = tip.offsetWidth || 260;
  const tipHeight = tip.offsetHeight || 200;

  // Prefer placing to the right of cursor, fall back to left
  let left = event.clientX + 12;
  if (left + tipWidth > window.innerWidth - 16) {
    left = event.clientX - tipWidth - 12;
  }
  if (left < 8) left = 8;

  let top = event.clientY - 20;
  if (top + tipHeight > window.innerHeight - 16) {
    top = window.innerHeight - tipHeight - 16;
  }
  if (top < 16) top = 16;

  tip.style.left = left + 'px';
  tip.style.top = top + 'px';
}

export function installCodelistTooltips(): void {
  // These serve inline handlers in the markup (onclick="name(...)" and the like).
  exposeFunctions({
    showParentEtTooltip,
    showEtTooltip,
    showSiviTooltip,
    showClTooltip,
    hideClTooltip,
    showAllowedTooltip,
    showSiviPeekTooltip,
    showDocsPeekTooltip,
    showSubtypesTooltip,
    moveClTooltip,
  });
}

/** SIVI list view landing page: the entity overview and the cross-entity attribute search. */
import { exposeFunctions } from '../globals.ts';
import { AFD_MODEL } from './afd-model.ts';
import { datacatEntities, loadDatacat } from './datacat.ts';
import { selectEntity } from './sivi-detail.ts';
import { escapeHtml } from './ui.ts';
import { jsArg } from './html.ts';

/** One attribute of the SIVI catalogue, flattened for searching. */
interface GlobalAttr {
  entity: string;
  name: string;
  datatype: string;
  codelist: string;
  desc: string;
  search: string;
}

const GLOBAL_ATTR_MAX = 200;

let globalAttrIndex: GlobalAttr[] | null;
let globalAttrDebounce: ReturnType<typeof setTimeout> | null;
let activeEntityFilter: string | null;
let attrNameTip: HTMLElement | null;

/* ── Entity Overview (landing page for List view) ── */
export function renderEntityOverview(): void {
  const listView = document.getElementById('listView') as HTMLElement;
  const welcome = document.getElementById('welcomeScreen');
  if (welcome) welcome.style.display = 'none';
  listView.style.display = 'block';
  const sorted = Object.keys(AFD_MODEL).sort();
  let html = '<div class="sivi-overview"><h2>AFD 2.0 Reference Model</h2>';
  html += '<p class="sivi-overview-desc">' + sorted.length + ' entities in the SIVI AFD 2.0 reference model</p>';
  html += '<p class="sivi-overview-version" id="siviVersion"></p>';
  // Tab bar
  html += '<div class="sivi-tab-bar">';
  html += '<button class="sivi-tab active" data-tab="entities" onclick="switchOverviewTab(\'entities\')">Entities</button>';
  html += '<button class="sivi-tab" data-tab="attributes" onclick="switchOverviewTab(\'attributes\')">Attributes</button>';
  html += '</div>';
  // Entities tab
  html += '<div id="siviOvEntities">';
  html += '<input type="text" class="sivi-overview-search" placeholder="Filter entities...">';
  html += '<div class="sivi-overview-grid">';
  sorted.forEach((name) => {
    const e = AFD_MODEL[name] as (typeof AFD_MODEL)[string];
    const parents = e.parentOf.length;
    const children = e.childOf.length;
    html += '<button class="sivi-overview-card" data-entity="' + escapeHtml(name) + '">';
    html += '<div class="sivi-ov-name">' + escapeHtml(name) + '</div>';
    html += '<div class="sivi-ov-desc">' + escapeHtml(e.desc) + '</div>';
    html += '<div class="sivi-ov-stats">';
    if (parents) html += '<span class="sivi-ov-stat">▶ ' + parents + ' children</span>';
    if (children) html += '<span class="sivi-ov-stat">◀ ' + children + ' parents</span>';
    html += '</div></button>';
  });
  html += '</div></div>';
  // Attributes tab
  html += '<div id="siviOvAttrs" style="display:none"></div>';
  html += '</div>';
  listView.innerHTML = html;
  // Load SIVI version
  fetch('/data/version/.sivi-version')
    .then((r) => (r.ok ? r.text() : ''))
    .then((txt) => {
      const el = document.getElementById('siviVersion');
      if (el && txt) el.textContent = 'Version ' + (txt.split(/\r?\n/)[0] as string).trim();
    })
    .catch(() => {});
  listView.querySelectorAll<HTMLElement>('.sivi-overview-card').forEach((card) => {
    card.addEventListener('click', () => selectEntity(card.dataset.entity as string));
  });
  const searchInput = listView.querySelector<HTMLInputElement>('.sivi-overview-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase();
      listView.querySelectorAll<HTMLElement>('.sivi-overview-card').forEach((card) => {
        const name = (card.dataset.entity as string).toLowerCase();
        const desc = (AFD_MODEL[card.dataset.entity as string] || { desc: '' }).desc || '';
        card.style.display = name.includes(q) || desc.toLowerCase().includes(q) ? '' : 'none';
      });
    });
  }
}

function switchOverviewTab(tab: string): void {
  document.querySelectorAll<HTMLElement>('.sivi-overview .sivi-tab').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  const ent = document.getElementById('siviOvEntities');
  const attr = document.getElementById('siviOvAttrs');
  if (ent) ent.style.display = tab === 'entities' ? '' : 'none';
  if (attr) attr.style.display = tab === 'attributes' ? '' : 'none';
  if (tab === 'attributes' && attr && !attr.dataset.init) {
    attr.dataset.init = '1';
    initGlobalAttrTab(attr);
  }
}

async function initGlobalAttrTab(container: HTMLElement): Promise<void> {
  await loadDatacat();
  buildGlobalAttrIndex();
  const total = (globalAttrIndex as GlobalAttr[]).length;
  container.innerHTML =
    '<input type="text" class="sivi-overview-search" id="siviGlobalAttrSearch" placeholder="Search attributes by name, codelist, description...">' +
    '<div class="sivi-ov-attr-count" id="siviGlobalAttrCount">' +
    total +
    ' attributes across all entities — type to search</div>' +
    '<div id="siviGlobalAttrBody"></div>';
  const input = document.getElementById('siviGlobalAttrSearch') as HTMLInputElement;
  input.addEventListener('input', () => {
    if (globalAttrDebounce !== null) clearTimeout(globalAttrDebounce);
    globalAttrDebounce = setTimeout(() => renderGlobalAttrResults(input.value.trim()), 150);
  });
  // Show initial empty prompt
  renderGlobalAttrResults('');
}

function buildGlobalAttrIndex(): void {
  if (globalAttrIndex) return;
  const index: GlobalAttr[] = [];
  globalAttrIndex = index;
  const seen = new Set<string>();
  const entities = datacatEntities as NonNullable<typeof datacatEntities>;
  const names = Object.keys(entities).sort();
  for (const eName of names) {
    const entity = entities[eName] as (typeof entities)[string];
    for (const et of entity.entityTypes || []) {
      for (const a of et.attrs || []) {
        const key = eName + '.' + a.name;
        if (seen.has(key)) continue;
        seen.add(key);
        const desc = a.desc ? a.desc.replace(/^[a-zA-Z]+\.[a-zA-Z]+\.\s*/, '') : '';
        index.push({
          entity: eName,
          name: a.name,
          datatype: a.datatype || '',
          codelist: a.codelist || '',
          desc: desc,
          search: (eName + ' ' + a.name + ' ' + (a.datatype || '') + ' ' + (a.codelist || '') + ' ' + desc).toLowerCase(),
        });
      }
    }
  }
}

function renderGlobalAttrResults(query: string): void {
  const body = document.getElementById('siviGlobalAttrBody');
  const countEl = document.getElementById('siviGlobalAttrCount') as HTMLElement;
  if (!body || !globalAttrIndex) return;
  const index = globalAttrIndex;
  const total = index.length;

  if (!query) {
    activeEntityFilter = null;
    countEl.textContent = total + ' attributes across all entities \u2014 type to search';
    body.innerHTML = '<div class="sivi-ov-attr-prompt">Start typing to search across all ' + total + ' SIVI attributes\u2026</div>';
    return;
  }

  const q = query.toLowerCase();
  // Collect ALL text-matches (uncapped) to build entity chip list
  const allMatches: GlobalAttr[] = [];
  const entitySet = new Set<string>();
  for (const attr of index) {
    if (attr.search.includes(q)) {
      allMatches.push(attr);
      entitySet.add(attr.entity);
    }
  }

  // If active filter no longer has results, clear it
  if (activeEntityFilter && !entitySet.has(activeEntityFilter)) {
    activeEntityFilter = null;
  }

  // Apply entity filter
  const filtered = activeEntityFilter ? allMatches.filter((a) => a.entity === activeEntityFilter) : allMatches;

  const capped = filtered.length > GLOBAL_ATTR_MAX;
  const visible = capped ? filtered.slice(0, GLOBAL_ATTR_MAX) : filtered;

  if (allMatches.length === 0) {
    activeEntityFilter = null;
    countEl.textContent = 'No matching attributes';
    body.innerHTML = '<div class="sivi-ov-attr-prompt">No attributes match \u201c' + escapeHtml(query) + '\u201d</div>';
    return;
  }

  // Count label
  const filterNote = activeEntityFilter
    ? filtered.length + ' in ' + activeEntityFilter + ' (of ' + allMatches.length + ' total)'
    : allMatches.length + ' result' + (allMatches.length !== 1 ? 's' : '');
  countEl.textContent = capped ? filterNote + ' \u2014 showing first ' + GLOBAL_ATTR_MAX : filterNote;

  // Entity chips
  const sortedEntities = Array.from(entitySet).sort();
  let chips = '<div class="sivi-ov-entity-chips">';
  for (const eName of sortedEntities) {
    const eCount = allMatches.filter((a) => a.entity === eName).length;
    const active = activeEntityFilter === eName ? ' active' : '';
    chips +=
      '<button class="sivi-ov-entity-chip' +
      active +
      '" onclick="_toggleEntityFilter(' +
      jsArg(eName) +
      ')">' +
      escapeHtml(eName) +
      ' <span class="sivi-ov-chip-count">' +
      eCount +
      '</span></button>';
  }
  chips += '</div>';

  let rows = '';
  for (const a of visible) {
    const clCell = a.codelist
      ? '<span class="ca-attr-codelist" onclick="event.stopPropagation();hideClTooltip();navigateToCodelist(' +
        jsArg(a.codelist) +
        ')" onmouseenter="showClTooltip(' +
        jsArg(a.codelist) +
        ', event)" onmouseleave="hideClTooltip()" onmousemove="moveClTooltip(event)">' +
        escapeHtml(a.codelist) +
        '</span>'
      : '<span class="sivi-attr-empty">\u2014</span>';
    rows +=
      '<tr>' +
      '<td class="sivi-ov-attr-entity" onclick="selectEntity(' +
      jsArg(a.entity) +
      ')">' +
      escapeHtml(a.entity) +
      '</td>' +
      '<td class="sivi-attr-name" onmouseenter="_showAttrNameTip(this, event)" onmouseleave="_hideAttrNameTip()" onmousemove="_moveAttrNameTip(event)">' +
      escapeHtml(a.name) +
      '</td>' +
      '<td class="sivi-attr-type">' +
      escapeHtml(a.datatype) +
      '</td>' +
      '<td>' +
      clCell +
      '</td>' +
      '<td class="sivi-attr-desc">' +
      escapeHtml(a.desc) +
      '</td>' +
      '</tr>';
  }

  body.innerHTML =
    chips +
    '<table class="sivi-attr-table sivi-global-attr-table">' +
    '<thead><tr><th>Entity</th><th>Name</th><th>Type</th><th>Codelist</th><th>Description</th></tr></thead>' +
    '<tbody>' +
    rows +
    '</tbody></table>';
}

function toggleEntityFilter(eName: string): void {
  activeEntityFilter = activeEntityFilter === eName ? null : eName;
  const input = document.getElementById('siviGlobalAttrSearch') as HTMLInputElement | null;
  renderGlobalAttrResults(input ? input.value.trim() : '');
}

/* Attribute name hover tooltip (only when text is truncated) */
function showAttrNameTip(td: HTMLElement, e: MouseEvent): void {
  if (td.scrollWidth <= td.clientWidth) return; // not truncated
  if (!attrNameTip) {
    attrNameTip = document.createElement('div');
    attrNameTip.className = 'sivi-attr-name-tip';
    document.body.appendChild(attrNameTip);
  }
  attrNameTip.textContent = td.textContent;
  attrNameTip.style.display = 'block';
  moveAttrNameTip(e);
}
function moveAttrNameTip(e: MouseEvent): void {
  if (!attrNameTip || attrNameTip.style.display === 'none') return;
  attrNameTip.style.left = e.clientX + 12 + 'px';
  attrNameTip.style.top = e.clientY - 28 + 'px';
}
function hideAttrNameTip(): void {
  if (attrNameTip) attrNameTip.style.display = 'none';
}

export function installSiviOverview(): void {
  globalAttrIndex = null;
  globalAttrDebounce = null;
  activeEntityFilter = null;
  attrNameTip = null;
  // These serve inline handlers in the markup (onclick="name(...)" and the like).
  exposeFunctions({
    switchOverviewTab,
    _toggleEntityFilter: toggleEntityFilter,
    _showAttrNameTip: showAttrNameTip,
    _moveAttrNameTip: moveAttrNameTip,
    _hideAttrNameTip: hideAttrNameTip,
  });
}

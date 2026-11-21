/**
 * Editor model search: full-text search across the current API model:
 * entity names, attribute names, descriptions, SIVI references, codelists,
 * enum types, notes, and examples.
 */
import { exposeFunctions } from '../globals.ts';
import { refreshIconStrip } from './sidebar.ts';
import { state } from './state.ts';
import { escapeHtml } from '../base/ui.ts';
import { jsArg } from '../base/html.ts';

interface SearchEntry {
  entity: string;
  entityDesc: string;
  attrName: string | null;
  type: string;
  description: string;
  sivi: string;
  codelist: string;
  notes: string;
  example: string;
  /** Lower-cased text the query is matched against. */
  search: string;
}

interface SearchState {
  index: SearchEntry[] | null;
  debounce: number | undefined;
  /** Active entity chip filter. */
  entityFilter: string | null;
}

const search = {} as SearchState;

const SEARCH_MAX = 200;

/**
 * Show the search page. Hides graph / detail, renders into #listView.
 */
export function showSearchView(): void {
  state.apiActiveEntity = '__search__';
  document.querySelectorAll('.ca-entity-btn').forEach((b) => b.classList.remove('active'));
  refreshIconStrip();

  // Hide graph elements
  const caCyEl = document.getElementById('caCy');
  const caGraphLegend = document.getElementById('caGraphLegend');
  const caGraphZoom = document.getElementById('caGraphZoom');
  const graphTooltip = document.getElementById('graphTooltip');
  if (caCyEl) caCyEl.classList.remove('visible', 'with-header');
  if (caGraphLegend) caGraphLegend.style.display = 'none';
  if (caGraphZoom) caGraphZoom.style.display = 'none';
  if (graphTooltip) graphTooltip.classList.remove('visible');

  const index = buildSearchIndex();

  const total = index.length;
  const entityCount = new Set(index.map((e) => e.entity)).size;
  const listView = document.getElementById('listView') as HTMLElement;

  const backLink = '<a href="#" onclick="showApiGraphView();return false;" class="ca-back-link">← Domain Model</a>';

  listView.innerHTML =
    '<div class="ca-search-page">' +
    backLink +
    '<h2 class="ca-search-title">🔎 Search Model</h2>' +
    '<input type="text" class="ca-search-input" id="caSearchInput" placeholder="Search entities, attributes, codelists, SIVI refs…" autofocus>' +
    '<div class="ca-search-count" id="caSearchCount">' +
    total +
    ' attributes across ' +
    entityCount +
    ' entities — type to search</div>' +
    '<div id="caSearchBody"></div>' +
    '</div>';
  listView.style.display = 'block';

  const input = document.getElementById('caSearchInput') as HTMLInputElement;
  input.addEventListener('input', () => {
    clearTimeout(search.debounce);
    search.debounce = setTimeout(() => renderSearchResults(input.value.trim()), 150);
  });
  input.focus();

  renderSearchResults('');
}

/**
 * Build (or rebuild) the search index from apiModel + apiEnums.
 */
function buildSearchIndex(): SearchEntry[] {
  const index: SearchEntry[] = [];
  search.index = index;
  search.entityFilter = null;
  const apiModel = state.apiModel;
  if (!apiModel) return index;

  const entityNames = Object.keys(apiModel);
  for (const eName of entityNames) {
    const e = apiModel[eName];
    if (!e) continue;

    // Entity-level entry (so searching entity name itself works)
    index.push({
      entity: eName,
      entityDesc: e.desc || '',
      attrName: null,
      type: '',
      description: e.desc || '',
      sivi: '',
      codelist: '',
      notes: '',
      example: '',
      search: (eName + ' ' + (e.desc || '')).toLowerCase(),
    });

    // Attribute entries
    for (const a of e.attrs || []) {
      if (a.type === '_section') continue;
      const desc = a.description || '';
      const sivi = a.sivi || '';
      const cl = a.codelist || '';
      const notes = a.note || '';
      const example = a.example || '';
      const allowedName = a.allowedName || '';
      // Include enum values in search when type is an enum
      let enumVals = '';
      const apiEnum = state.apiEnums && state.apiEnums[a.type];
      if (apiEnum) {
        enumVals = apiEnum.values.map((v) => v.value).join(' ');
      }
      // Include allowed values
      const allowed = (a.allowedValues || []).join(' ');

      index.push({
        entity: eName,
        entityDesc: e.desc || '',
        attrName: a.name,
        type: a.type,
        description: desc,
        sivi: sivi,
        codelist: cl,
        notes: notes,
        example: example,
        search: (
          eName +
          ' ' +
          a.name +
          ' ' +
          a.type +
          ' ' +
          desc +
          ' ' +
          sivi +
          ' ' +
          cl +
          ' ' +
          allowedName +
          ' ' +
          notes +
          ' ' +
          example +
          ' ' +
          enumVals +
          ' ' +
          allowed
        ).toLowerCase(),
      });
    }
  }
  return index;
}

/**
 * Render search results into #caSearchBody.
 */
function renderSearchResults(query: string): void {
  const body = document.getElementById('caSearchBody');
  const countEl = document.getElementById('caSearchCount');
  const index = search.index;
  if (!body || !index) return;
  const count = countEl as HTMLElement;

  const total = index.length;
  const entityCount = new Set(index.map((e) => e.entity)).size;

  if (!query) {
    search.entityFilter = null;
    count.textContent = total + ' attributes across ' + entityCount + ' entities — type to search';
    body.innerHTML =
      '<div class="ca-search-prompt">Start typing to search across all entities, attributes, codelists, and SIVI references…</div>';
    return;
  }

  const q = query.toLowerCase();

  // Collect all text-matches
  const allMatches: SearchEntry[] = [];
  const entitySet = new Set<string>();
  for (const entry of index) {
    if (entry.search.includes(q)) {
      allMatches.push(entry);
      entitySet.add(entry.entity);
    }
  }

  // Clear stale entity filter
  if (search.entityFilter && !entitySet.has(search.entityFilter)) {
    search.entityFilter = null;
  }

  // Apply entity filter
  const entityFilter = search.entityFilter;
  const filtered = entityFilter ? allMatches.filter((e) => e.entity === entityFilter) : allMatches;

  const capped = filtered.length > SEARCH_MAX;
  const visible = capped ? filtered.slice(0, SEARCH_MAX) : filtered;

  if (allMatches.length === 0) {
    search.entityFilter = null;
    count.textContent = 'No results';
    body.innerHTML = '<div class="ca-search-prompt">No results for “' + escapeHtml(query) + '”</div>';
    return;
  }

  // Count label
  const filterNote = entityFilter
    ? filtered.length + ' in ' + entityFilter + ' (of ' + allMatches.length + ' total)'
    : allMatches.length + ' result' + (allMatches.length !== 1 ? 's' : '');
  count.textContent = capped ? filterNote + ' — showing first ' + SEARCH_MAX : filterNote;

  // Entity chips
  const sortedEntities = Array.from(entitySet).sort();
  let chips = '<div class="ca-search-chips">';
  for (const eName of sortedEntities) {
    const eCount = allMatches.filter((e) => e.entity === eName).length;
    const active = entityFilter === eName ? ' active' : '';
    chips +=
      '<button class="ca-search-chip' +
      active +
      '" onclick="_toggleSearchEntityFilter(' +
      jsArg(eName) +
      ')">' +
      escapeHtml(eName) +
      ' <span class="ca-search-chip-count">' +
      eCount +
      '</span></button>';
  }
  chips += '</div>';

  // Result rows
  let rows = '';
  for (const r of visible) {
    const rawEntity = r.entity;
    const entityCell = '<td class="ca-search-entity" onclick="selectApiEntity(' + jsArg(rawEntity) + ')">' + escapeHtml(r.entity) + '</td>';

    if (!r.attrName) {
      // Entity-level match
      rows +=
        '<tr class="ca-search-entity-row">' +
        entityCell +
        '<td class="ca-search-attr-name" colspan="4"><em>— entity —</em></td>' +
        '<td class="ca-search-desc">' +
        escapeHtml(r.description) +
        '</td>' +
        '</tr>';
      continue;
    }

    const clCell = r.codelist
      ? '<span class="ca-attr-codelist" onclick="event.stopPropagation();hideClTooltip();navigateToCodelist(' +
        jsArg(r.codelist) +
        ')" onmouseenter="showClTooltip(' +
        jsArg(r.codelist) +
        ', event)" onmouseleave="hideClTooltip()" onmousemove="moveClTooltip(event)">' +
        escapeHtml(r.codelist) +
        '</span>'
      : '<span class="ca-cell-dim">—</span>';

    const siviCell = r.sivi ? '<span class="ca-attr-sivi">' + escapeHtml(r.sivi) + '</span>' : '<span class="ca-cell-dim">—</span>';

    rows +=
      '<tr>' +
      entityCell +
      '<td class="ca-search-attr-name">' +
      escapeHtml(r.attrName) +
      '</td>' +
      '<td class="ca-search-type">' +
      escapeHtml(r.type) +
      '</td>' +
      '<td class="ca-search-codelist">' +
      clCell +
      '</td>' +
      '<td class="ca-search-sivi">' +
      siviCell +
      '</td>' +
      '<td class="ca-search-desc">' +
      escapeHtml(r.description) +
      '</td>' +
      '</tr>';
  }

  body.innerHTML =
    chips +
    '<table class="ca-search-table">' +
    '<thead><tr><th>Entity</th><th>Attribute</th><th>Type</th><th>Codelist</th><th>SIVI</th><th>Description</th></tr></thead>' +
    '<tbody>' +
    rows +
    '</tbody></table>';
}

function toggleSearchEntityFilter(eName: string): void {
  search.entityFilter = search.entityFilter === eName ? null : eName;
  const input = document.getElementById('caSearchInput') as HTMLInputElement | null;
  renderSearchResults(input ? input.value.trim() : '');
}

/**
 * Invalidate the search index (call after model changes).
 */
export function invalidateSearchIndex(): void {
  search.index = null;
}

/** Creates the search state and keeps the functions reachable for the inline handlers of the search markup. */
export function install(): void {
  search.index = null;
  search.debounce = undefined;
  search.entityFilter = null;

  // These serve inline handlers in the markup (onclick="name(...)" and the like).
  exposeFunctions({
    _toggleSearchEntityFilter: toggleSearchEntityFilter,
  });
}

/** Codelist and entity type viewer: sidebar, overview, detail pages and navigation. */
import { exposeFunctions } from '../globals.ts';
import { hideClTooltip, installCodelistTooltips, moveClTooltip, showClTooltip, showParentEtTooltip } from './codelist-tooltips.ts';
import { customDescriptions, ensureCustomDescriptions, persistCustomDescriptions } from './custom-descriptions.ts';
import {
  type EntitySubtype,
  type EntityTypeEntry,
  clActiveCodelist,
  clActiveEntityType,
  clSidebarMode,
  codelistData,
  codelistMap,
  entityTypeData,
  loadCodelistData,
  loadEntityTypeData,
  setActiveCodelist,
  setActiveEntityType,
  setSidebarMode,
} from './model-loader.ts';
import { getAllUsedCodelists, getCodelistUsage, registerView, setView, views } from './registry.ts';
import { hideAllPanels } from './sivi-list.ts';
import { renderSubtypeDescPanel } from './sivi-detail.ts';
import { jsArg } from './html.ts';
import { escapeHtml } from './ui.ts';
import { state } from '../editor/state.ts';
import { buildIconStrip, initSidebarCollapse, refreshIconStrip, sidebarState } from '../editor/sidebar.ts';

export async function loadAndShowCodelists(): Promise<void> {
  await Promise.all([loadCodelistData(), loadEntityTypeData()]);
  buildCodelistSidebar();
  const listView = document.getElementById('listView') as HTMLElement;
  if (clActiveEntityType) {
    listView.style.display = 'block';
    renderEntityTypeDetail(clActiveEntityType);
  } else if (clActiveCodelist) {
    listView.style.display = 'block';
    renderCodelistDetail(clActiveCodelist);
  } else {
    listView.style.display = 'block';
    renderCodelistWelcome();
  }
}

export function buildCodelistSidebar(): void {
  initSidebarCollapse();
  const list = document.getElementById('entityList') as HTMLElement;
  list.innerHTML = '';
  if (!codelistData) {
    if (sidebarState.collapsed) {
      if (!sidebarState.iconStripBuilt) buildIconStrip();
      refreshIconStrip();
    }
    return;
  }

  const q = (document.getElementById('search') as HTMLInputElement).value.toLowerCase();

  // Home / overview button
  const homeBtn = document.createElement('button');
  homeBtn.className = 'cl-home-btn' + (!clActiveCodelist && !clActiveEntityType ? ' active' : '');
  homeBtn.innerHTML = '<span style="font-size:16px;">◉</span> Codelist Overview';
  homeBtn.onclick = () => {
    setActiveCodelist(null);
    setActiveEntityType(null);
    loadAndShowCodelists();
  };
  list.appendChild(homeBtn);

  // Tab toggle: Codes | Entity Types
  const tabRow = document.createElement('div');
  tabRow.className = 'cl-tab-toggle';
  const codesTab = document.createElement('button');
  codesTab.className = 'cl-tab-btn' + (clSidebarMode === 'codes' ? ' active' : '');
  codesTab.textContent = 'Codes';
  codesTab.onclick = () => {
    setSidebarMode('codes');
    buildCodelistSidebar();
  };
  const etTab = document.createElement('button');
  etTab.className = 'cl-tab-btn' + (clSidebarMode === 'entitytypes' ? ' active' : '');
  etTab.textContent = 'Entity Types';
  etTab.onclick = () => {
    setSidebarMode('entitytypes');
    buildCodelistSidebar();
  };
  tabRow.appendChild(codesTab);
  tabRow.appendChild(etTab);
  list.appendChild(tabRow);

  if (clSidebarMode === 'codes') {
    // === CODES LIST ===
    codelistData.forEach((cl) => {
      const matchName = cl.Name.toLowerCase().includes(q);
      const matchDesc = cl.Description.toLowerCase().includes(q);
      const matchCode = cl.Code && cl.Code.some((c) => c.CodeValue.toLowerCase().includes(q) || c.Description.toLowerCase().includes(q));
      if (q && !matchName && !matchDesc && !matchCode) return;

      const btn = document.createElement('button');
      btn.className = 'cl-entity-btn' + (clActiveCodelist === cl.Name ? ' active' : '');
      btn.dataset.entity = cl.Name;
      const count = cl.Code ? cl.Code.length : 0;
      btn.innerHTML = `${escapeHtml(cl.Name)} <span class="cl-badge">${count}</span><span class="cl-desc">${escapeHtml(cl.Description)}</span>`;
      btn.onclick = () => {
        hideClTooltip();
        selectCodelist(cl.Name);
      };
      btn.addEventListener('mouseenter', (e) => showClTooltip(cl.Name, e));
      btn.addEventListener('mouseleave', hideClTooltip);
      btn.addEventListener('mousemove', moveClTooltip);
      list.appendChild(btn);
    });
  } else {
    // === ENTITY TYPES LIST (parent entities only) ===
    if (entityTypeData) {
      const etData = entityTypeData;
      const sortedEntities = Object.keys(etData).sort();
      sortedEntities.forEach((parentName) => {
        const parent = etData[parentName] as EntityTypeEntry;
        if (!parent.subtypes || parent.subtypes.length === 0) return;
        if (parent.subtypes.length === 1 && parent.subtypes[0]?.name === 'default') return;

        // Search filter: match parent name or any subtype
        if (q) {
          const matchP = parentName.toLowerCase().includes(q);
          const matchAnySub = parent.subtypes.some(
            (st) =>
              st.name.toLowerCase().includes(q) ||
              st.description.toLowerCase().includes(q) ||
              (st.codelistAttrs && st.codelistAttrs.some((a) => a.codelist.toLowerCase().includes(q))),
          );
          if (!matchP && !matchAnySub) return;
        }

        const isActive = clActiveEntityType && clActiveEntityType.startsWith(parentName + '.');
        const btn = document.createElement('button');
        btn.className = 'cl-entity-btn' + (isActive ? ' active' : '');
        btn.dataset.entity = parentName;
        btn.innerHTML = `${escapeHtml(parentName)} <span class="cl-et-badge">${parent.subtypes.length} types</span><span class="cl-desc">${escapeHtml(parent.description)}</span>`;
        btn.onclick = () => {
          hideClTooltip();
          selectEntityType(parentName + '._overview');
        };
        btn.addEventListener('mouseenter', (e) => showParentEtTooltip(parentName, e));
        btn.addEventListener('mouseleave', hideClTooltip);
        btn.addEventListener('mousemove', moveClTooltip);
        list.appendChild(btn);
      });
    }
  }
  if (sidebarState.collapsed) {
    if (!sidebarState.iconStripBuilt) buildIconStrip();
    refreshIconStrip();
  }
}

export function selectCodelist(name: string): void {
  setActiveCodelist(name);
  setActiveEntityType(null);
  if (clSidebarMode !== 'codes') {
    setSidebarMode('codes');
    buildCodelistSidebar();
  }
  document.querySelectorAll<HTMLElement>('.cl-entity-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.entity === name);
  });
  document.querySelectorAll('.cl-home-btn').forEach((btn) => btn.classList.remove('active'));
  const listView = document.getElementById('listView') as HTMLElement;
  listView.style.display = 'block';
  renderCodelistDetail(name);
}

export function selectEntityType(key: string): void {
  setActiveEntityType(key);
  setActiveCodelist(null);
  if (clSidebarMode !== 'entitytypes') {
    setSidebarMode('entitytypes');
    buildCodelistSidebar();
  }
  document.querySelectorAll<HTMLElement>('.cl-entity-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.entity === key);
  });
  document.querySelectorAll('.cl-home-btn').forEach((btn) => btn.classList.remove('active'));
  const listView = document.getElementById('listView') as HTMLElement;
  listView.style.display = 'block';
  renderEntityTypeDetail(key);
}

export function renderCodelistWelcome(): void {
  const listView = document.getElementById('listView') as HTMLElement;
  const total = codelistData ? codelistData.length : 0;
  const totalCodes = codelistData ? codelistData.reduce((s, cl) => s + (cl.Code ? cl.Code.length : 0), 0) : 0;

  // Find which codelists are used across all registered API modules
  const usedCodelists = getAllUsedCodelists();

  // EntityType stats
  let totalEtEntities = 0;
  let totalEtSubtypes = 0;
  const etWithMultiple: { name: string; count: number }[] = [];
  if (entityTypeData) {
    Object.entries(entityTypeData).forEach(([name, e]) => {
      if (e.subtypes && e.subtypes.length > 0) {
        // Skip single 'default' subtypes
        if (e.subtypes.length === 1 && e.subtypes[0]?.name === 'default') return;
        totalEtEntities++;
        totalEtSubtypes += e.subtypes.length;
        etWithMultiple.push({ name, count: e.subtypes.length });
      }
    });
    etWithMultiple.sort((a, b) => b.count - a.count);
  }

  listView.innerHTML = `
        <h1 style="color:#a78bfa;">SIVI Codelists & Entity Types</h1>
        <p class="subtitle">Browse all ${total} codelists and ${totalEtSubtypes} entity types from the SIVI AFD Data Catalog</p>

        <div class="stats">
            <div class="stat-card"><div class="value">${total}</div><div class="label">Codelists</div></div>
            <div class="stat-card"><div class="value">${totalCodes.toLocaleString()}</div><div class="label">Total code values</div></div>
            <div class="stat-card"><div class="value">${usedCodelists.size}</div><div class="label">Used in APIs</div></div>
            <div class="stat-card"><div class="value">${totalEtSubtypes}</div><div class="label">Entity Types</div></div>
        </div>

        <div class="section">
            <h3>Codelists referenced by APIs (${usedCodelists.size})</h3>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
                ${[...usedCodelists]
                  .sort()
                  .map((name) => {
                    return `<span class="cl-used-by-chip" onclick="hideClTooltip();selectCodelist(${jsArg(name)})" onmouseenter="showClTooltip(${jsArg(name)}, event)" onmouseleave="hideClTooltip()" onmousemove="moveClTooltip(event)">${escapeHtml(name)}</span>`;
                  })
                  .join('')}
            </div>
        </div>

        ${
          etWithMultiple.length > 0
            ? `
        <div class="section">
            <h3>Entities with subtypes (${totalEtEntities})</h3>
            <p style="color:#8b949e;font-size:12px;margin-bottom:8px;">EntityTypes define structural schema variants — different sets of attributes per subtype.</p>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
                ${etWithMultiple
                  .map(
                    (e) =>
                      `<span class="cl-used-by-chip" style="border-color:#58a6ff44;background:#1f6feb15;color:#58a6ff;" onclick="hideClTooltip();selectEntityType(${jsArg(`${e.name}._overview`)})">${escapeHtml(e.name)} <span style="opacity:0.6">(${e.count})</span></span>`,
                  )
                  .join('')}
            </div>
        </div>`
            : ''
        }

        <p style="color:#484f58;font-size:12px;margin-top:32px;">Use the sidebar search to find any codelist or entity type by name, description, or code value.</p>
    `;
}

export async function renderCodelistDetail(name: string): Promise<void> {
  const cl = codelistMap[name];
  if (!cl) return;
  await ensureCustomDescriptions();

  const listView = document.getElementById('listView') as HTMLElement;
  const codes = cl.Code || [];
  const notes = (customDescriptions && customDescriptions.codeNotes && customDescriptions.codeNotes[name]) || {};

  // Find which API attributes use this codelist (via core.js hooks)
  const usedBy = getCodelistUsage(name);

  const usedByHtml =
    usedBy.length > 0
      ? `
        <div class="cl-used-by">
            <div class="section">
                <h3>Used in APIs (${usedBy.length})</h3>
                <div style="display:flex;flex-wrap:wrap;gap:6px;">
                    ${usedBy.map((u) => `<span class="cl-used-by-chip" onclick="navigateToApiAttr(${jsArg(u.entity)})" title="${escapeHtml(u.entity)}.${escapeHtml(u.attr)}">${escapeHtml(u.entity)}.${escapeHtml(u.attr)}</span>`).join('')}
                </div>
            </div>
        </div>`
      : '';

  const tableRows = codes
    .map((c, i) => {
      const note = notes[c.CodeValue] || '';
      return `
        <tr class="cl-row">
            <td style="color:#484f58;font-size:12px;text-align:right;width:40px;">${i + 1}</td>
            <td><span class="cl-code-value">${escapeHtml(c.CodeValue)}</span></td>
            <td><span class="cl-code-desc">${escapeHtml(c.Description)}</span></td>
            <td class="cl-note-cell" data-codelist="${escapeHtml(name)}" data-code="${escapeHtml(c.CodeValue)}" onclick="_editCodeNote(this)">
                <span class="cl-note-text">${note ? escapeHtml(note) : '<span class="cl-note-empty">click to add</span>'}</span>
            </td>
        </tr>`;
    })
    .join('');

  listView.innerHTML = `
        <a href="#" onclick="clActiveCodelist=null;loadAndShowCodelists();return false;" style="color:#a78bfa;text-decoration:none;font-size:12px;float:right;">← Codelist Overview</a>
        <h1 style="color:#a78bfa;">${escapeHtml(name)}</h1>
        <p class="subtitle">${escapeHtml(cl.Description)}</p>

        <div class="stats">
            <div class="stat-card"><div class="value">${codes.length}</div><div class="label">Code values</div></div>
            ${usedBy.length ? `<div class="stat-card"><div class="value">${usedBy.length}</div><div class="label">API refs</div></div>` : ''}
        </div>

        ${usedByHtml}

        <div class="section">
            <h3>Values (${codes.length})</h3>
            <input type="text" class="cl-search-main" id="clCodeSearch" placeholder="Filter codes..." oninput="filterCodelistTable()">
            <div style="max-height:60vh;overflow-y:auto;border:1px solid #30363d;border-radius:8px;">
                <table class="cl-code-table cl-code-table-notes">
                    <thead><tr><th style="width:40px;">#</th><th>Code</th><th>Description</th><th>Notes</th></tr></thead>
                    <tbody id="clCodeBody">${tableRows}</tbody>
                </table>
            </div>
        </div>
    `;
}

function filterCodelistTable(): void {
  const q = (document.getElementById('clCodeSearch') as HTMLInputElement).value.toLowerCase();
  const rows = document.querySelectorAll<HTMLElement>('#clCodeBody .cl-row');
  rows.forEach((row) => {
    const text = (row.textContent as string).toLowerCase();
    row.style.display = text.includes(q) ? '' : 'none';
  });
}

function editCodeNote(td: HTMLElement): void {
  if (td.querySelector('textarea')) return; // already editing
  const codelist = td.dataset.codelist as string;
  const code = td.dataset.code as string;
  const notes = (customDescriptions && customDescriptions.codeNotes && customDescriptions.codeNotes[codelist]) || {};
  const current = notes[code] || '';
  td.innerHTML = `<textarea class="cl-note-input" rows="2" onblur="_saveCodeNote(this, ${jsArg(codelist)}, ${jsArg(code)})">${escapeHtml(current)}</textarea>`;
  const ta = td.querySelector('textarea') as HTMLTextAreaElement;
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);
}

async function saveCodeNote(textarea: HTMLTextAreaElement, codelist: string, code: string): Promise<void> {
  const val = textarea.value.trim();
  const descriptions = await ensureCustomDescriptions();
  if (!descriptions.codeNotes) descriptions.codeNotes = {};
  const notes = descriptions.codeNotes;
  if (val) {
    notes[codelist] ??= {};
    const forCodelist = notes[codelist];
    forCodelist[code] = val;
  } else {
    const forCodelist = notes[codelist];
    if (forCodelist) {
      delete forCodelist[code];
      if (Object.keys(forCodelist).length === 0) {
        delete notes[codelist];
      }
    }
  }
  await persistCustomDescriptions();
  // Replace textarea with static text
  const td = textarea.parentElement as HTMLElement;
  td.innerHTML = `<span class="cl-note-text">${val ? escapeHtml(val) : '<span class="cl-note-empty">click to add</span>'}</span>`;
}

export async function renderEntityTypeDetail(key: string): Promise<void> {
  const listView = document.getElementById('listView') as HTMLElement;
  const etData = entityTypeData as Record<string, EntityTypeEntry>;

  // Handle entity-level overview (e.g. 'coverage._overview')
  if (key.endsWith('._overview')) {
    const parentName = key.replace('._overview', '');
    const parent = etData[parentName];
    if (!parent) return;

    const subtypes = parent.subtypes || [];
    // Collect all unique codelists across subtypes
    const allCodelists = new Set<string>();
    subtypes.forEach((st) => {
      (st.codelistAttrs || []).forEach((a) => allCodelists.add(a.codelist));
    });

    // Find API entities that reference this parent via entityType (uses global if available)
    const etUsedBy: string[] = [];
    if (state.apiModel) {
      Object.entries(state.apiModel).forEach(([eName, e]) => {
        e.attrs.forEach((a) => {
          if (a.name === 'entityType' && a.sivi && a.sivi.startsWith(parentName + '.')) {
            etUsedBy.push(eName);
          }
        });
      });
    }
    const usedByHtml =
      etUsedBy.length > 0
        ? `
            <div class="section">
                <h3>Referenced in APIs</h3>
                <div style="display:flex;flex-wrap:wrap;gap:6px;">
                    ${etUsedBy.map((n) => `<span class="cl-used-by-chip" onclick="navigateToApiAttr(${jsArg(n)})">${escapeHtml(n)}.entityType</span>`).join('')}
                </div>
            </div>`
        : '';

    listView.innerHTML = `
            <a href="#" onclick="clActiveEntityType=null;loadAndShowCodelists();return false;" style="color:#a78bfa;text-decoration:none;font-size:12px;float:right;">← Overview</a>
            <h1 style="color:#58a6ff;">${escapeHtml(parentName)}</h1>
            <p class="subtitle">${escapeHtml(parent.description)}</p>

            <div class="stats">
                <div class="stat-card"><div class="value">${subtypes.length}</div><div class="label">Subtypes</div></div>
                <div class="stat-card"><div class="value">${allCodelists.size}</div><div class="label">Unique codelists</div></div>
            </div>

            ${usedByHtml}

            <div class="section">
                <h3>Subtypes (${subtypes.length})</h3>
                <input type="text" class="cl-search-main" id="etSubSearch" placeholder="Filter subtypes..." oninput="filterEtSubtypeChips()">
                <div class="et-chip-grid" id="etChipGrid">
                    ${subtypes
                      .map(
                        (st) =>
                          `<span class="et-subtype-chip" data-key="${escapeHtml(`${parentName}.${st.name}`)}" onclick="hideClTooltip();selectEntityType(${jsArg(`${parentName}.${st.name}`)})" onmouseenter="showEtTooltip(${jsArg(`${parentName}.${st.name}`)}, event)" onmouseleave="hideClTooltip()" onmousemove="moveClTooltip(event)">${escapeHtml(st.name)}<span class="et-chip-count">${st.attrCount}</span></span>`,
                      )
                      .join('')}
                </div>
            </div>

            <div class="section">
                <h3>Detail view</h3>
                <div style="max-height:50vh;overflow-y:auto;border:1px solid #30363d;border-radius:8px;">
                    <table class="cl-code-table">
                        <thead><tr><th style="width:40px;">#</th><th>Subtype</th><th>Description</th><th style="text-align:right">Attrs</th><th style="text-align:right">Codelists</th></tr></thead>
                        <tbody id="etSubBody">
                            ${subtypes
                              .map(
                                (st, i) => `
                                <tr class="cl-row et-sub-row" style="cursor:pointer" onclick="selectEntityType(${jsArg(`${parentName}.${st.name}`)})">
                                    <td style="color:#484f58;font-size:12px;text-align:right;">${i + 1}</td>
                                    <td><span class="cl-code-value" style="color:#58a6ff">${escapeHtml(st.name)}</span></td>
                                    <td><span class="cl-code-desc">${escapeHtml(st.description.substring(0, 80))}${st.description.length > 80 ? '…' : ''}</span></td>
                                    <td style="text-align:right;color:#8b949e">${st.attrCount}</td>
                                    <td style="text-align:right;color:#8b949e">${(st.codelistAttrs || []).length}</td>
                                </tr>`,
                              )
                              .join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    return;
  }

  // Individual subtype detail
  const [parentPart, ...rest] = key.split('.');
  const parentName = parentPart as string;
  const subtypeName = rest.join('.');
  const parent = etData[parentName];
  if (!parent) return;
  const parentSubtypes = parent.subtypes as EntitySubtype[];
  const st = parentSubtypes.find((s) => s.name === subtypeName);
  if (!st) return;

  await ensureCustomDescriptions();
  const descPanelHtml = renderSubtypeDescPanel(parentName, subtypeName, st.description || '');

  const codelistAttrs = st.codelistAttrs || [];

  // Build codelist reference table
  let codelistHtml = '';
  if (codelistAttrs.length > 0) {
    codelistHtml = `
            <div class="section">
                <h3>Codelist references (${codelistAttrs.length})</h3>
                <div style="border:1px solid #30363d;border-radius:8px;overflow:hidden;">
                    <table class="cl-code-table">
                        <thead><tr><th>Attribute</th><th>Codelist</th><th>Datatype</th></tr></thead>
                        <tbody>
                            ${codelistAttrs
                              .map(
                                (a) => `
                                <tr class="cl-row">
                                    <td><span class="cl-code-desc">${escapeHtml(a.name)}</span></td>
                                    <td><span class="ca-attr-codelist" onclick="hideClTooltip();selectCodelist(${jsArg(a.codelist)})" onmouseenter="showClTooltip(${jsArg(a.codelist)}, event)" onmouseleave="hideClTooltip()" onmousemove="moveClTooltip(event)">${escapeHtml(a.codelist)}</span></td>
                                    <td style="color:#8b949e">${escapeHtml(a.datatype)}</td>
                                </tr>`,
                              )
                              .join('')}
                        </tbody>
                    </table>
                </div>
            </div>`;
  }

  // Find sibling subtypes for navigation
  const siblings = parentSubtypes.filter((s) => s.name !== subtypeName);
  const siblingHtml =
    siblings.length > 0 && siblings.length < 120
      ? `
        <div class="section">
            <h3>Other ${escapeHtml(parentName)} subtypes (${siblings.length})</h3>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
                ${siblings
                  .map(
                    (s) =>
                      `<span class="et-subtype-chip" onclick="hideClTooltip();selectEntityType(${jsArg(`${parentName}.${s.name}`)})" onmouseenter="showEtTooltip(${jsArg(`${parentName}.${s.name}`)}, event)" onmouseleave="hideClTooltip()" onmousemove="moveClTooltip(event)">${escapeHtml(s.name)}<span class="et-chip-count">${s.attrCount}</span></span>`,
                  )
                  .join('')}
            </div>
        </div>`
      : siblings.length >= 120
        ? `
        <div class="section">
            <h3>Other ${escapeHtml(parentName)} subtypes (${siblings.length})</h3>
            <p style="color:#484f58;font-size:12px;">
                <a href="#" onclick="selectEntityType(${jsArg(`${parentName}._overview`)});return false;" style="color:#58a6ff;text-decoration:none;">View all ${parentSubtypes.length} subtypes →</a>
            </p>
        </div>`
        : '';

  listView.innerHTML = `
        <a href="#" onclick="selectEntityType(${jsArg(`${parentName}._overview`)});return false;" style="color:#58a6ff;text-decoration:none;font-size:12px;float:right;">← All ${escapeHtml(parentName)} subtypes</a>
        <h1 style="color:#58a6ff;">${escapeHtml(parentName)}<span style="color:#c9d1d9">.${escapeHtml(subtypeName)}</span></h1>
        <p class="subtitle">${escapeHtml(st.description)}</p>

        ${descPanelHtml}

        <div class="stats">
            <div class="stat-card"><div class="value">${st.attrCount}</div><div class="label">Attributes</div></div>
            <div class="stat-card"><div class="value">${codelistAttrs.length}</div><div class="label">Codelist refs</div></div>
            <div class="stat-card"><div class="value"><span class="cl-et-parent-tag">${escapeHtml(parentName)}</span></div><div class="label">Parent entity</div></div>
        </div>

        ${codelistHtml}
        ${siblingHtml}
    `;
}

function filterEtSubtypeChips(): void {
  const q = (document.getElementById('etSubSearch') as HTMLInputElement).value.toLowerCase();
  document.querySelectorAll<HTMLElement>('#etChipGrid .et-subtype-chip').forEach((chip) => {
    chip.style.display = (chip.textContent as string).toLowerCase().includes(q) ? '' : 'none';
  });
  // Also filter the detail table
  const rows = document.querySelectorAll<HTMLElement>('#etSubBody .et-sub-row');
  rows.forEach((row) => {
    const text = (row.textContent as string).toLowerCase();
    row.style.display = text.includes(q) ? '' : 'none';
  });
}

export function navigateToCodelist(name: string): void {
  // Switch to codelist view and select the codelist
  setActiveCodelist(name);
  setActiveEntityType(null);
  setView('codelist');
}

export function navigateToEntityType(parentName: string): void {
  // Switch to codelist view and select the entity type overview
  setActiveEntityType(parentName + '._overview');
  setActiveCodelist(null);
  setSidebarMode('entitytypes');
  setView('codelist');
}

/** Switches to the first API view and selects the entity there (if an API view exists). */
export function navigateToApiAttr(entityName: string): void {
  const apiViewId = Object.keys(views).find((id) => views[id]?.category === 'api');
  if (apiViewId !== undefined) {
    state.apiActiveEntity = entityName;
    setView(apiViewId);
  }
}

export function installCodelistViewer(): void {
  installCodelistTooltips();
  // These serve inline handlers in the markup (onclick="name(...)" and the like).
  exposeFunctions({
    loadAndShowCodelists,
    selectCodelist,
    selectEntityType,
    filterCodelistTable,
    _editCodeNote: editCodeNote,
    _saveCodeNote: saveCodeNote,
    filterEtSubtypeChips,
    navigateToCodelist,
    navigateToEntityType,
    navigateToApiAttr,
  });
  registerView('codelist', {
    label: 'Codelists',
    category: 'sivi',
    btnClass: 'codelist-btn',
    async activate() {
      hideAllPanels();
      await loadAndShowCodelists();
    },
    filter() {
      buildCodelistSidebar();
    },
  });
}

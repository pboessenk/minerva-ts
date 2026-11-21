/** SIVI list view: entity detail with its SIVI attribute tables. */
import { exposeFunctions } from '../globals.ts';
import { AFD_MODEL } from './afd-model.ts';
import { customDescriptions, ensureCustomDescriptions, saveCustomSubtypeDesc } from './custom-descriptions.ts';
import { type DatacatEntityType, datacatEntities, loadDatacat } from './datacat.ts';
import { currentView } from './registry.ts';
import { highlightGraphNode } from './sivi-graph.ts';
import { activeEntity, setActiveEntity } from './sivi-state.ts';
import { jsArg } from './html.ts';
import { escapeHtml } from './ui.ts';

/* ── Entity Selection ── */
export async function selectEntity(name: string): Promise<void> {
  setActiveEntity(name);
  document.querySelectorAll<HTMLElement>('.entity-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.entity === name);
  });
  if (currentView === 'list') {
    await renderDetail(name);
  } else {
    highlightGraphNode(name);
  }
}

/* ── List View Detail ── */
export async function renderDetail(name: string): Promise<void> {
  await loadDatacat();
  await ensureCustomDescriptions();
  const e = AFD_MODEL[name] as (typeof AFD_MODEL)[string];
  const listView = document.getElementById('listView') as HTMLElement;
  const welcome = document.getElementById('welcomeScreen');
  if (welcome) welcome.style.display = 'none';
  listView.style.display = 'block';

  const bidir = e.parentOf.filter((c) => e.childOf.includes(c));
  const pureChildren = e.parentOf.filter((c) => !e.childOf.includes(c));
  const pureParents = e.childOf.filter((p) => !e.parentOf.includes(p));
  const selfRef = e.parentOf.includes(name) || e.childOf.includes(name);
  const roles = e.parentOfAsRole || {};
  const roleEntries = Object.entries(roles);

  // Look up SIVI attributes from datacat
  const dcKey = name.charAt(0).toLowerCase() + name.slice(1); // PascalCase → camelCase
  const dcEntity = datacatEntities ? datacatEntities[dcKey] : null;

  let attrHtml = '';
  if (dcEntity && dcEntity.entityTypes.length > 0) {
    const etCount = dcEntity.entityTypes.length;
    if (etCount === 1) {
      // Single type — render directly, no selector needed
      const et = dcEntity.entityTypes[0] as DatacatEntityType;
      attrHtml = `
                <div class="section">
                    <h3>SIVI Attributes <span class="sivi-et-count">${et.attrs.length} attributes</span></h3>
                    ${renderSiviAttrTable(et)}
                </div>`;
    } else {
      // Multiple types — tabbed interface: Overview + Attributes
      const options = dcEntity.entityTypes
        .map((et, i) => `<option value="${i}">${escapeHtml(et.name)} (${et.attrs.length} attrs)</option>`)
        .join('');
      const overviewChips = dcEntity.entityTypes
        .map((et, i) => {
          const chipKey = dcKey + '.' + et.name.toLowerCase();
          const customDesc = (customDescriptions && customDescriptions.subtypes[chipKey]) || '';
          return `<div class="sivi-overview-chip" data-sivi-idx="${i}" data-sivi-search="${escapeHtml((et.name + ' ' + (et.desc || '') + ' ' + customDesc).toLowerCase())}" onclick="selectSiviSubtype(${i})">
                    <span class="sivi-overview-name">${escapeHtml(et.name)}</span>
                    <span class="sivi-overview-count">${et.attrs.length}</span>
                    ${customDesc ? `<span class="sivi-custom-desc-badge">${escapeHtml(customDesc)}</span>` : ''}
                    ${et.desc ? `<span class="sivi-overview-desc">${escapeHtml(et.desc)}</span>` : ''}
                </div>`;
        })
        .join('');
      attrHtml = `
                <div class="section">
                    <h3>SIVI Attributes <span class="sivi-et-count">${etCount} entity types</span></h3>
                    <div class="sivi-tab-bar">
                        <button class="sivi-tab active" data-tab="overview" onclick="switchSiviTab('overview')">Overview</button>
                        <button class="sivi-tab" data-tab="attributes" onclick="switchSiviTab('attributes')">Attributes</button>
                    </div>
                    <div id="siviTabOverview" class="sivi-tab-panel">
                        <input type="text" class="sivi-overview-search" id="siviOverviewSearch" placeholder="Filter entity types..." oninput="filterSiviOverview()">
                        <div class="sivi-overview-grid">${overviewChips}</div>
                    </div>
                    <div id="siviTabAttributes" class="sivi-tab-panel" style="display:none">
                        <div class="sivi-et-selector">
                            <select class="sivi-et-select" id="siviEtSelect" onchange="switchSiviEntityType()">
                                ${options}
                            </select>
                        </div>
                        <div id="siviAttrTableContainer">
                            ${renderSubtypeDescPanel(dcKey, (dcEntity.entityTypes[0] as DatacatEntityType).name, (dcEntity.entityTypes[0] as DatacatEntityType).desc || '')}${renderSiviAttrTable(dcEntity.entityTypes[0] as DatacatEntityType)}
                        </div>
                    </div>
                </div>`;
    }
  } else if (datacatEntities) {
    attrHtml =
      '<div class="section"><h3>SIVI Attributes</h3><span class="empty">No attributes found in SIVI catalog for this entity</span></div>';
  }

  listView.innerHTML = `
        <h1>${escapeHtml(name)}</h1>
        <p class="subtitle">${escapeHtml(e.desc || '')}</p>

        <div class="legend">
            <div class="legend-item"><div class="legend-dot child"></div> Can nest under ${escapeHtml(name)} (child)</div>
            <div class="legend-item"><div class="legend-dot parent"></div> ${escapeHtml(name)} nests under (parent)</div>
            <div class="legend-item"><div class="legend-dot bidir"></div> Bidirectional</div>
            ${roleEntries.length ? '<div class="legend-item"><div class="legend-dot role"></div> Party role-typed ref</div>' : ''}
            ${selfRef ? '<div class="legend-item"><div class="legend-dot self"></div> Self-referencing</div>' : ''}
        </div>

        <div class="stats">
            <div class="stat-card"><div class="value">${e.parentOf.length}</div><div class="label">Children (nest under)</div></div>
            <div class="stat-card"><div class="value">${e.childOf.length}</div><div class="label">Parents (nests under)</div></div>
            <div class="stat-card"><div class="value">${bidir.length}</div><div class="label">Bidirectional</div></div>
            ${roleEntries.length ? `<div class="stat-card"><div class="value">${roleEntries.length}</div><div class="label">Party Roles</div></div>` : ''}
        </div>

        <div class="section">
            <h3>Children — entities that can nest under ${escapeHtml(name)} (${pureChildren.length + bidir.length})</h3>
            <div class="entity-grid">
                ${selfRef && e.parentOf.includes(name) ? `<span class="entity-chip self" onclick="selectEntity(${jsArg(name)})">${escapeHtml(name)} (self)</span>` : ''}
                ${bidir
                  .filter((x) => x !== name)
                  .map((c) => `<span class="entity-chip bidir" onclick="selectEntity(${jsArg(c)})">${escapeHtml(c)} ↔</span>`)
                  .join('')}
                ${pureChildren
                  .filter((x) => x !== name)
                  .map((c) => `<span class="entity-chip child" onclick="selectEntity(${jsArg(c)})">${escapeHtml(c)}</span>`)
                  .join('')}
                ${!pureChildren.length && !bidir.length && !selfRef ? '<span class="empty">No children</span>' : ''}
            </div>
        </div>

        ${
          roleEntries.length
            ? `
        <div class="section">
            <h3>Party Role-Typed Children (${roleEntries.length})</h3>
            <div class="entity-grid">
                ${roleEntries.map(([role, targets]) => `<span class="entity-chip role" title="Used by: ${escapeHtml(targets.join(', '))}">${escapeHtml(role)} → ${escapeHtml(targets.join(', '))}</span>`).join('')}
            </div>
        </div>`
            : ''
        }

        <div class="section">
            <h3>Parents — ${escapeHtml(name)} nests under these entities (${pureParents.length + bidir.length})</h3>
            <div class="entity-grid">
                ${selfRef && e.childOf.includes(name) ? `<span class="entity-chip self" onclick="selectEntity(${jsArg(name)})">${escapeHtml(name)} (self)</span>` : ''}
                ${bidir
                  .filter((x) => x !== name)
                  .map((p) => `<span class="entity-chip bidir" onclick="selectEntity(${jsArg(p)})">${escapeHtml(p)} ↔</span>`)
                  .join('')}
                ${pureParents
                  .filter((x) => x !== name)
                  .map((p) => `<span class="entity-chip parent" onclick="selectEntity(${jsArg(p)})">${escapeHtml(p)}</span>`)
                  .join('')}
                ${!pureParents.length && !bidir.length && !selfRef ? '<span class="empty">No parents</span>' : ''}
            </div>
        </div>

        ${attrHtml}
    `;
}

/* ── SIVI Attribute Table Helpers ── */
export function renderSiviAttrTable(et: DatacatEntityType): string {
  return `
        <div class="sivi-et-label">${escapeHtml(et.desc || '')}</div>
        <input type="text" class="sivi-attr-search" placeholder="Filter attributes..." oninput="filterSiviAttrs(this)">
        <table class="sivi-attr-table">
            <thead><tr><th>Name</th><th>Type</th><th>Codelist</th><th>Description</th></tr></thead>
            <tbody>
                ${et.attrs
                  .map((a) => {
                    const clLink = a.codelist
                      ? `<span class="ca-attr-codelist" onclick="event.stopPropagation();hideClTooltip();navigateToCodelist(${jsArg(a.codelist)})" onmouseenter="showClTooltip(${jsArg(a.codelist)}, event)" onmouseleave="hideClTooltip()" onmousemove="moveClTooltip(event)">${escapeHtml(a.codelist)}</span>`
                      : '<span class="sivi-attr-empty">\u2014</span>';
                    const desc = a.desc ? a.desc.replace(/^[a-zA-Z]+\.[a-zA-Z]+\.\s*/, '') : '';
                    const search = (a.name + ' ' + a.datatype + ' ' + (a.codelist || '') + ' ' + desc).toLowerCase();
                    return `<tr data-sivi-attr-search="${escapeHtml(search)}">
                        <td class="sivi-attr-name">${escapeHtml(a.name)}</td>
                        <td class="sivi-attr-type">${escapeHtml(a.datatype)}</td>
                        <td>${clLink}</td>
                        <td class="sivi-attr-desc">${escapeHtml(desc)}</td>
                    </tr>`;
                  })
                  .join('')}
            </tbody>
        </table>`;
}

export function filterSiviAttrs(input: HTMLInputElement): void {
  const q = (input.value || '').toLowerCase().trim();
  const table = input.nextElementSibling;
  if (!table) return;
  table.querySelectorAll<HTMLElement>('tbody tr').forEach((row) => {
    row.style.display = !q || (row.dataset.siviAttrSearch as string).includes(q) ? '' : 'none';
  });
}

export function renderSubtypeDescPanel(entityName: string, subtypeName: string, siviDesc: string): string {
  const key = entityName.toLowerCase() + '.' + subtypeName.toLowerCase();
  const customDesc = (customDescriptions && customDescriptions.subtypes[key]) || '';
  return `<div class="sivi-subtype-desc-panel">
        <div class="sivi-subtype-desc-row">
            <label class="sivi-subtype-desc-label">SIVI description</label>
            <div class="sivi-subtype-desc-sivi">${siviDesc ? escapeHtml(siviDesc) : '<span class="sivi-attr-empty">\u2014 none</span>'}</div>
        </div>
        <div class="sivi-subtype-desc-row">
            <label class="sivi-subtype-desc-label">Custom description <span class="sivi-subtype-desc-hint">(used in exports when set)</span></label>
            <textarea class="sivi-subtype-desc-input" placeholder="Enter a custom description for this subtype\u2026"
                data-entity="${escapeHtml(entityName)}" data-subtype="${escapeHtml(subtypeName)}"
                onblur="_onCustomDescBlur(this)">${escapeHtml(customDesc)}</textarea>
        </div>
    </div>`;
}

async function onCustomDescBlur(textarea: HTMLTextAreaElement): Promise<void> {
  const entity = textarea.dataset.entity as string;
  const subtype = textarea.dataset.subtype as string;
  const val = textarea.value.trim();
  await saveCustomSubtypeDesc(entity, subtype, val);
  // Update the chip description if visible
  refreshChipCustomDesc(entity, subtype, val);
}

function refreshChipCustomDesc(_entityName: string, subtypeName: string, customDesc: string): void {
  document.querySelectorAll<HTMLElement>('.sivi-overview-chip').forEach((chip) => {
    const nameEl = chip.querySelector('.sivi-overview-name');
    if (nameEl && nameEl.textContent === subtypeName) {
      let badge = chip.querySelector<HTMLElement>('.sivi-custom-desc-badge');
      if (customDesc) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'sivi-custom-desc-badge';
          chip.appendChild(badge);
        }
        badge.textContent = customDesc;
      } else if (badge) {
        badge.remove();
      }
    }
  });
}

function switchSiviEntityType(): void {
  const select = document.getElementById('siviEtSelect') as HTMLSelectElement | null;
  if (!select || !activeEntity || !datacatEntities) return;
  const dcKey = activeEntity.charAt(0).toLowerCase() + activeEntity.slice(1);
  const dcEntity = datacatEntities[dcKey];
  if (!dcEntity) return;
  const et = dcEntity.entityTypes[parseInt(select.value, 10)];
  if (!et) return;
  const descPanel = customDescriptions ? renderSubtypeDescPanel(dcKey, et.name, et.desc || '') : '';
  (document.getElementById('siviAttrTableContainer') as HTMLElement).innerHTML = descPanel + renderSiviAttrTable(et);
}

function switchSiviTab(tab: string): void {
  document.querySelectorAll<HTMLElement>('.sivi-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  (document.getElementById('siviTabOverview') as HTMLElement).style.display = tab === 'overview' ? '' : 'none';
  (document.getElementById('siviTabAttributes') as HTMLElement).style.display = tab === 'attributes' ? '' : 'none';
}

function selectSiviSubtype(index: number): void {
  const select = document.getElementById('siviEtSelect') as HTMLSelectElement | null;
  if (select) select.value = String(index);
  switchSiviEntityType();
  switchSiviTab('attributes');
}

function filterSiviOverview(): void {
  const q = ((document.getElementById('siviOverviewSearch') as HTMLInputElement | null)?.value || '').toLowerCase().trim();
  document.querySelectorAll<HTMLElement>('.sivi-overview-chip').forEach((chip) => {
    chip.style.display = !q || (chip.dataset.siviSearch as string).includes(q) ? '' : 'none';
  });
}

export function installSiviDetail(): void {
  // These serve inline handlers in the markup (onclick="name(...)" and the like).
  exposeFunctions({
    selectEntity,
    filterSiviAttrs,
    _onCustomDescBlur: onCustomDescBlur,
    switchSiviEntityType,
    switchSiviTab,
    selectSiviSubtype,
    filterSiviOverview,
  });
}

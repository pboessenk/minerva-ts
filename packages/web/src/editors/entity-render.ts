/**
 * Entity detail page: header, banners, child entities and the attribute table.
 */
import { _initColResize, getColGroups } from './columns.ts';
import { constraintSummary, constraintsForAttr } from './constraints.ts';
import { _getSiviSubtypeDefaults, _siviExpectedType, isSiviPathValid } from './sivi.ts';
import { _syncEnumEntityType } from './subtype-changes.ts';
import { initDragAndDrop } from './drag-drop.ts';
import { initCellEditing } from './cell-edit.ts';
import { entityTypes } from './model-access.ts';
import { jsArg } from '../base/html.ts';
import { escapeHtml } from '../base/ui.ts';
import { applyAttrFilter } from '../editor/attr-filter.ts';
import { state } from '../editor/state.ts';

/**
 * Filter attribute rows by subtype.
 */
export function filterBySubtype(entityName: string, subtype: string): void {
  const e = state.apiModel![entityName];
  if (!e) return;
  const rows = document.querySelectorAll<HTMLElement>('.ca-attr-table tbody tr');
  rows.forEach((row) => {
    // Section rows are always visible
    if (row.classList.contains('ca-section-row') || row.classList.contains('ca-drop-end-row')) {
      row.style.display = '';
      return;
    }
    const attrName = row.dataset.attr;
    if (!attrName) return;
    const attr = e.attrs.find((a) => a.name === attrName);
    if (!attr) return;
    if (subtype === '__base__') {
      row.style.display = '';
      return;
    }
    if (attr.name === 'entityType') {
      row.style.display = '';
      return;
    }
    const applicable = attr.applicableSubtypes;
    if (!applicable || applicable.length === 0 || applicable.includes(subtype)) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
  // Re-apply text filter on top of subtype filter
  applyAttrFilter((document.getElementById('caAttrFilter') as HTMLInputElement | null)?.value?.trim() || '');
}

export function renderEntityDetail(name: string): void {
  const _colGroups = getColGroups();
  const e = state.apiModel![name];
  if (!e) return;

  const listView = document.getElementById('listView')!;
  const rawName = name;
  const rootChecked = e.root ? ' checked' : '';
  const rootLabel = `<label class="ca-root-toggle"><input type="checkbox"${rootChecked} onchange="toggleEntityRoot(${jsArg(rawName)}, this.checked)"> Root entity</label>`;
  const exclChecked = e.excludeFromInclusion ? ' checked' : '';
  const exclLabel = `<label class="ca-root-toggle" title="When another root is selected for export, operations whose request/response only references this entity (e.g. shared Error schema) will not be pulled into scope."><input type="checkbox"${exclChecked} onchange="toggleEntityExcludeFromInclusion(${jsArg(rawName)}, this.checked)"> Don't pull related operations into scope when filtering</label>`;

  const attrs = e.attrs.filter((a) => a.type !== '_section');
  const siviAttrs = attrs.filter((a) => a.sivi);

  // Children are derived from attributes — show as read-only chips
  const childChips = (e.children || [])
    .map((c) => {
      return `<span class="ca-child-chip">
            <span class="ca-child-name" onclick="selectApiEntity(${jsArg(c.name)})">${escapeHtml(c.name)}</span>
            <span class="ca-card">${escapeHtml(c.card)}</span>
        </span>`;
    })
    .join('');

  let childrenHtml = '';
  if (e.children && e.children.length > 0) {
    childrenHtml = `
            <div class="section">
                <h3>Child entities</h3>
                <div class="ca-children">
                    ${childChips}
                </div>
            </div>`;
  }

  let parentHtml = '';
  if (e.parent) {
    parentHtml = `<span class="ca-parent-link">↑ child of <a href="#" onclick="selectApiEntity(${jsArg(e.parent)});return false;" class="ca-entity-link">${escapeHtml(e.parent)}</a></span>`;
  }
  const backLink = `<a href="#" onclick="showApiGraphView();return false;" class="ca-back-link">← Domain Model</a>`;

  const bannerIcons = { info: 'ℹ', warning: '⚠', error: '✖' };
  const points = e.openPoints || [];
  let openPointHtml = '<div class="ca-banners">';
  points.forEach((p, i) => {
    const t = p.type || 'warning';
    const icon = bannerIcons[t] || '⚠';
    openPointHtml += `
            <div class="ca-banner ca-banner-${escapeHtml(t)}">
                <span class="ca-banner-icon" onclick="cycleBannerType(${jsArg(rawName)}, ${i})" title="Click to change type">${icon}</span>
                <span class="ca-banner-text" onclick="editBannerText(${jsArg(rawName)}, ${i}, this)">${escapeHtml(p.text)}</span>
                <button class="ca-banner-delete" onclick="deleteBanner(${jsArg(rawName)}, ${i})" title="Remove">✕</button>
            </div>`;
  });
  openPointHtml += `<button class="ca-banner-add" onclick="addBanner(${jsArg(rawName)})" title="Add note">+ Add note</button></div>`;

  // Detect subtyped entity (has entityType attr with allowedValues)
  const entityTypeAttr = attrs.find((a) => a.name === 'entityType');
  // Auto-sync allowedValues from enum if not yet populated
  if (
    entityTypeAttr &&
    state.apiEnums &&
    state.apiEnums![entityTypeAttr.type] &&
    (!entityTypeAttr.allowedValues || !entityTypeAttr.allowedValues.length)
  ) {
    _syncEnumEntityType(name);
  }
  const subtypes =
    entityTypeAttr && entityTypeAttr.allowedValues && entityTypeAttr.allowedValues.length > 0 ? entityTypeAttr.allowedValues : null;
  // Compute visible column count based on toggle state
  let totalCols = 6; // Name, Type, Format, Rules, Req, Delete (always visible)
  if (_colGroups.sivi)
    totalCols += subtypes ? 4 : 3; // SIVI Ref, Codelist, Allowed, [Subtypes]
  else totalCols += 1; // SIVI peek column
  if (_colGroups.docs)
    totalCols += 3; // Description, Example, Notes
  else totalCols += 1; // Docs peek column

  let subtypeBarHtml = '';
  if (subtypes) {
    const subtypeCounts: Record<string, number> = {};
    for (const st of subtypes) {
      subtypeCounts[st] = attrs.filter(
        (a) => a.name === 'entityType' || !a.applicableSubtypes || a.applicableSubtypes.length === 0 || a.applicableSubtypes.includes(st),
      ).length;
    }
    const options = subtypes
      .map((st) => `<option value="${escapeHtml(st)}">${escapeHtml(st)} (${subtypeCounts[st]} attrs)</option>`)
      .join('');
    subtypeBarHtml = `
            <div class="ca-subtype-bar">
                <label>View subtype:</label>
                <select id="caSubtypeFilter" onchange="filterBySubtype(${jsArg(rawName)}, this.value)">
                    <option value="__base__" selected>Base (all ${attrs.length} attributes)</option>
                    ${options}
                </select>
            </div>`;
  }

  let attrsHtml = '';
  if (attrs.length > 0) {
    // Build rows with section headers
    let rows = '';
    e.attrs.forEach((a, flatIdx) => {
      if (a.type === '_section') {
        const rawSectionKey = a.name;
        const rawSectionNote = a.note || '';
        rows += `<tr data-attridx="${flatIdx}" data-section-entity="${escapeHtml(name)}" data-section-key="${escapeHtml(a.name)}" class="ca-section-row">
                    <td colspan="${totalCols - 1}" class="ca-section-cell">
                        <span class="ca-drag-handle" title="Drag to reorder">⠿</span>
                        <div class="ca-section-label ca-section-label-editable" onclick="makeGroupEditable(this, ${jsArg(name)}, ${jsArg(rawSectionKey)}, ${jsArg(rawSectionNote)})">${escapeHtml(a.note || '')}</div>
                    </td>
                    <td class="ca-section-delete-cell"><button class="ca-delete-btn" onclick="deleteGroup(${jsArg(name)}, ${jsArg(rawSectionKey)})" title="Delete group">✕</button></td>
                </tr>`;
        return;
      }
      // Detect entityType attributes and make them navigable to Entity Type pages
      const etParent = a.name === 'entityType' && a.sivi && a.sivi.endsWith('.entityType') ? a.sivi.replace('.entityType', '') : null;
      const rawSiviHover = a.sivi || '';
      const siviRef =
        etParent && entityTypes() && entityTypes()![etParent]
          ? `<span class="ca-attr-sivi ca-et-link" onclick="event.stopPropagation();hideClTooltip();navigateToEntityType(${jsArg(etParent)})" onmouseenter="showParentEtTooltip(${jsArg(etParent)}, event)" onmouseleave="hideClTooltip()" onmousemove="moveClTooltip(event)">${escapeHtml(a.sivi)} ↗</span>`
          : a.sivi
            ? `<span class="ca-attr-sivi" onmouseenter="showSiviTooltip(${jsArg(rawSiviHover)}, event)" onmouseleave="hideClTooltip()" onmousemove="moveClTooltip(event)">${escapeHtml(a.sivi)}</span>`
            : '<span class="ca-cell-placeholder">+ sivi ref</span>';
      const codelistBadge = a.codelist
        ? `<span class="ca-attr-codelist" onclick="event.stopPropagation();hideClTooltip();navigateToCodelist(${jsArg(a.codelist)})" onmouseenter="showClTooltip(${jsArg(a.codelist)}, event)" onmouseleave="hideClTooltip()" onmousemove="moveClTooltip(event)">${escapeHtml(a.codelist)}</span>`
        : '<span class="ca-cell-placeholder">+ codelist</span>';
      const noteText = a.note || '';
      const descText = a.description || '';
      const exampleText = a.example || '';
      const rawAttrName = a.name;
      // SIVI validation dot: green = confirmed in datacat, yellow = unmapped
      const siviDot = a.sivi
        ? isSiviPathValid(a.sivi)
          ? '<span class="ca-sivi-dot valid">&#9679;</span>'
          : '<span class="ca-sivi-dot invalid">&#9679;</span>'
        : '<span class="ca-sivi-dot none">&#9675;</span>';
      // SIVI type mismatch detection
      const siviExpected = a.sivi ? _siviExpectedType(a.sivi) : null;
      const typeMismatch = siviExpected && siviExpected !== a.type;
      // Subtypes cell (only for subtyped entities)
      let subtypeCell = '';
      if (subtypes) {
        const siviInfo = a.sivi ? _getSiviSubtypeDefaults(name, a.sivi) : { defaults: [], hasSiviData: false };
        const siviDefs = siviInfo.defaults;
        const current = a.applicableSubtypes && a.applicableSubtypes.length ? a.applicableSubtypes : null;
        // Determine if current differs from SIVI defaults
        let isOverridden = false;
        if (siviInfo.hasSiviData) {
          if (siviDefs.length === 0) {
            // SIVI has data but none of our subtypes match → always overridden
            isOverridden = true;
          } else if (!current) {
            // current = all, SIVI says partial → overridden
            isOverridden = siviDefs.length < subtypes.length;
          } else {
            // Compare sets
            const cs = new Set(current);
            isOverridden = siviDefs.length !== current.length || siviDefs.some((s) => !cs.has(s));
          }
        }
        const overrideCls = isOverridden ? ' ca-st-overridden' : '';
        subtypeCell = current
          ? `<span class="ca-subtype-count${overrideCls}" onmouseenter="showSubtypesTooltip(${jsArg(rawName)}, ${jsArg(rawAttrName)}, event)" onmouseleave="hideClTooltip()" onmousemove="moveClTooltip(event)">${current.length}</span>`
          : `<span class="ca-allowed-all${overrideCls}">all</span>`;
      }
      const subtypeTd =
        subtypes && _colGroups.sivi
          ? `<td class="ca-cell-editable ca-cell-center col-subtypes" data-field="subtypes">${subtypeCell}</td>`
          : '';
      // Rules cell: one popup for every validation constraint the type
      // supports (constraints.ts); a dash when nothing applies.
      const consKeys = constraintsForAttr(a);
      const consSummary = constraintSummary(a);
      const consCell = consKeys.length
        ? `<span class="ca-constraint-icon${consSummary.length ? ' ca-constraint-set' : ''}" title="${consSummary.length ? escapeHtml(consSummary.join('\n')) : 'Add validation rules'}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="9" cy="6" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="8" cy="18" r="2" fill="currentColor"/></svg></span>`
        : '<span class="ca-cell-dim">&mdash;</span>';
      rows += `
                <tr data-entity="${escapeHtml(name)}" data-attr="${escapeHtml(a.name)}" data-attridx="${flatIdx}"${consSummary.length ? ` data-constraints="${escapeHtml(consSummary.join(' '))}"` : ''}>
                    <td class="ca-cell-editable col-name" data-field="name"><div class="ca-name-wrap"><span class="ca-drag-handle" title="Drag to reorder">⠿</span>${siviDot}<span class="ca-attr-name">${escapeHtml(a.name)}</span></div></td>
                    <td class="ca-cell-editable col-type${typeMismatch ? ' ca-type-mismatch' : ''}" data-field="type"${typeMismatch ? ` title="SIVI expects: ${escapeHtml(siviExpected)}"` : ''}><span class="ca-attr-type">${escapeHtml(a.type)}</span></td>
                    <td class="ca-cell-editable col-format" data-field="format"><span class="ca-attr-format">${a.format ? escapeHtml(a.format) : '<span class="ca-cell-dim">(auto)</span>'}</span></td>
                    <td class="ca-cell-editable ca-cell-center col-constraints" data-field="constraints">${consCell}</td>
                    <td class="ca-cell-center col-req"><input type="checkbox" class="ca-attr-required" ${a.required ? 'checked' : ''} onchange="toggleRequired(${jsArg(name)}, ${jsArg(rawAttrName)}, this.checked)"></td>
                    ${_colGroups.sivi ? `<td class="ca-cell-editable col-siviref" data-field="sivi">${siviRef}</td>` : ''}
                    ${_colGroups.sivi ? `<td class="ca-cell-editable col-codelist" data-field="codelist">${codelistBadge}</td>` : ''}
                    ${_colGroups.sivi ? `<td class="ca-cell-editable ca-cell-center col-allowed" data-field="allowed">${a.codelist || (a.sivi && a.sivi.endsWith('.entityType')) || (state.apiEnums && state.apiEnums![(a.type || '').replace(/\[\]$/, '')]) ? (a.allowedValues && a.allowedValues.length ? `<span class="ca-allowed-badge" onmouseenter="showAllowedTooltip(${jsArg(rawName)}, ${jsArg(rawAttrName)}, event)" onmouseleave="hideClTooltip()" onmousemove="moveClTooltip(event)">${a.allowedValues.length}</span>` : `<span class="ca-allowed-all">all</span>`) : '<span class="ca-cell-dim">&mdash;</span>'}</td>` : ''}
                    ${subtypeTd}
                    ${!_colGroups.sivi ? `<td class="ca-cell-center col-sivipeek">${a.sivi ? `<span class="ca-peek-icon" onmouseenter="showSiviPeekTooltip(${jsArg(rawName)}, ${jsArg(rawAttrName)}, event)" onmouseleave="hideClTooltip()" onmousemove="moveClTooltip(event)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></span>` : '<span class="ca-cell-dim">&mdash;</span>'}</td>` : ''}
                    ${_colGroups.docs ? `<td class="ca-cell-editable col-desc" data-field="description"><span class="ca-attr-desc">${descText ? escapeHtml(descText) : a.sivi ? '<span class="ca-cell-placeholder ca-cell-placeholder-sivi" title="Description will be inherited from SIVI on export">+ description (SIVI)</span>' : '<span class="ca-cell-placeholder">+ description</span>'}</span></td>` : ''}
                    ${_colGroups.docs ? `<td class="ca-cell-editable col-example" data-field="example"><code class="ca-attr-example">${exampleText ? escapeHtml(exampleText) : '<span class="ca-cell-placeholder">+ example</span>'}</code></td>` : ''}
                    ${_colGroups.docs ? `<td class="ca-cell-editable col-notes" data-field="notes"><span class="ca-attr-note">${noteText ? escapeHtml(noteText) : '<span class="ca-cell-placeholder">+ notes</span>'}</span></td>` : ''}
                    ${!_colGroups.docs ? `<td class="ca-cell-center col-docspeek">${descText || exampleText || noteText ? `<span class="ca-peek-icon" onmouseenter="showDocsPeekTooltip(${jsArg(rawName)}, ${jsArg(rawAttrName)}, event)" onmouseleave="hideClTooltip()" onmousemove="moveClTooltip(event)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></span>` : '<span class="ca-cell-dim">&mdash;</span>'}</td>` : ''}
                    <td class="ca-cell-center col-delete"><button class="ca-delete-btn" onclick="deleteAttribute(${jsArg(name)}, ${jsArg(rawAttrName)})" title="Delete attribute">✕</button></td>
                </tr>`;
    });

    // Sentinel row: drop target for "move to end"
    rows += `<tr data-attridx="${e.attrs.length}" class="ca-drop-end-row"><td colspan="${totalCols}" class="ca-drop-end-zone">drop here to move to end</td></tr>`;

    const showSivi = _colGroups.sivi;
    const showDocs = _colGroups.docs;
    const subtypesTh = subtypes && showSivi ? '<th class="ca-cell-center col-subtypes">Subtypes</th>' : '';
    const colToggleBar = `
            <div class="ca-colgroup-bar">
                <span class="ca-colgroup-label">Columns:</span>
                <button class="ca-colgroup-btn${showSivi ? ' active' : ''}" data-group="sivi" onclick="toggleColGroup('sivi')">SIVI</button>
                <button class="ca-colgroup-btn${showDocs ? ' active' : ''}" data-group="docs" onclick="toggleColGroup('docs')">Documentation</button>
                <input id="caAttrFilter" class="ca-attr-filter-input" type="text" placeholder="Filter attributes…" oninput="filterAttrs()" autocomplete="off" spellcheck="false">
            </div>`;
    attrsHtml = `
            <div class="section">
                <h3>Attributes (${attrs.length} — ${siviAttrs.length} SIVI-aligned)</h3>
                ${subtypeBarHtml}
                ${colToggleBar}
                <table class="ca-attr-table">
                    <thead><tr>
                        <th class="col-name">Name<div class="ca-resize-handle"></div></th>
                        <th class="col-type">Type<div class="ca-resize-handle"></div></th>
                        <th class="col-format">Format<div class="ca-resize-handle"></div></th>
                        <th class="col-constraints ca-cell-center" title="Validation rules: length, range, items, pattern, default">Rules<div class="ca-resize-handle"></div></th>
                        <th class="col-req ca-cell-center">Req<div class="ca-resize-handle"></div></th>
                        ${showSivi ? '<th class="col-siviref">SIVI Reference<div class="ca-resize-handle"></div></th>' : ''}
                        ${showSivi ? '<th class="col-codelist">Codelist<div class="ca-resize-handle"></div></th>' : ''}
                        ${showSivi ? '<th class="col-allowed ca-cell-center">Allowed<div class="ca-resize-handle"></div></th>' : ''}
                        ${subtypesTh ? subtypesTh.replace('</th>', '<div class="ca-resize-handle"></div></th>') : ''}
                        ${!showSivi ? '<th class="ca-cell-center col-sivipeek">SIVI<div class="ca-resize-handle"></div></th>' : ''}
                        ${showDocs ? '<th class="col-desc">Description<div class="ca-resize-handle"></div></th>' : ''}
                        ${showDocs ? '<th class="col-example">Example<div class="ca-resize-handle"></div></th>' : ''}
                        ${showDocs ? '<th class="col-notes">Notes<div class="ca-resize-handle"></div></th>' : ''}
                        ${!showDocs ? '<th class="ca-cell-center col-docspeek">Docs<div class="ca-resize-handle"></div></th>' : ''}
                        <th class="col-delete"></th>
                    </tr></thead>
                    <tbody>${rows}</tbody>
                </table>
                <div class="ca-add-buttons"><button class="ca-add-attr-btn" onclick="addAttribute(${jsArg(name)})">+ Add Attribute</button><button class="ca-add-attr-btn ca-add-sivi-btn" onclick="addSiviAttribute(${jsArg(name)})">+ Add SIVI Attribute</button><button class="ca-add-attr-btn ca-add-group-btn" onclick="addGroup(${jsArg(name)})">+ Add Group</button></div>
            </div>`;
  } else {
    attrsHtml = `<div class="section"><p class="empty">No attributes defined yet.</p><div class="ca-add-buttons"><button class="ca-add-attr-btn" onclick="addAttribute(${jsArg(name)})">+ Add Attribute</button><button class="ca-add-attr-btn ca-add-sivi-btn" onclick="addSiviAttribute(${jsArg(name)})">+ Add SIVI Attribute</button><button class="ca-add-attr-btn ca-add-group-btn" onclick="addGroup(${jsArg(name)})">+ Add Group</button></div></div>`;
  }

  listView.innerHTML = `
        ${backLink}
        <h1>${escapeHtml(name)}
            <span class="ca-entity-actions">
                <span class="ca-copy-dropdown-wrap">
                    <button class="ca-action-btn ca-copy-btn" onclick="_toggleCopyMenu(${jsArg(rawName)})" title="Copy as..."><svg class="action-icon" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button>
                    <div class="ca-copy-menu" id="caCopyMenu">
                        <button onclick="_doCopy(${jsArg(rawName)},'json')">Copy as JSON</button>
                        <button onclick="_doCopy(${jsArg(rawName)},'ts')">Copy as TypeScript</button>
                    </div>
                </span>
                <button class="ca-action-btn ca-rename-btn" onclick="_promptRenameEntity(${jsArg(rawName)})" title="Rename"><svg class="action-icon" viewBox="0 0 24 24"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg></button>
                <button class="ca-action-btn ca-danger-btn" onclick="deleteEntity(${jsArg(rawName)})" title="Delete"><svg class="action-icon" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2v2"/></svg></button>
            </span>
        </h1>
        <div class="ca-entity-meta">${rootLabel}</div>
        <div class="ca-entity-meta">${exclLabel}</div>
        <p class="subtitle ca-editable-desc" onclick="makeDescriptionEditable(this, ${jsArg(rawName)})">${e.desc ? escapeHtml(e.desc) : '<span class="ca-cell-placeholder">(click to add description)</span>'}</p>
        ${parentHtml}
        <div class="ca-stats-wrap">
            <div class="stats">
                <div class="stat-card"><div class="value">${attrs.length}</div><div class="label">Attributes</div></div>
                <div class="stat-card"><div class="value">${siviAttrs.length}</div><div class="label">SIVI-aligned</div></div>
                <div class="stat-card"><div class="value">${e.children ? e.children.length : 0}</div><div class="label">Child entities</div></div>
            </div>
        </div>
        ${openPointHtml}
        ${childrenHtml}
        ${attrsHtml}
    `;

  // Initialize drag-and-drop on the table
  initDragAndDrop(name);

  // Initialize resizable columns
  _initColResize(listView.querySelector<HTMLElement>('.ca-attr-table'));

  // Delegated click handler for editable cells — reads current value from model
  initCellEditing(name);
}

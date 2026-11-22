/**
 * Editor sidebar: entity tree, enum list, operation list.
 * Collapsible with icon-strip + hover flyouts.
 */
import { exposeFunctions } from '../globals.ts';
import { resizeGraph, showApiGraph } from './graph.ts';
import { showGeneralView } from './general.ts';
import { showSearchView } from './search-page.ts';
import { state } from './state.ts';
import { renderEntityDetail } from '../editors/entity-render.ts';
import { renderApiOperation } from '../operations/op-detail.ts';
import { renderApiExample } from '../operations/example-page.ts';
import { renderApiEnum } from '../editors/enum-render.ts';
import { selectCodelist, selectEntityType } from '../base/codelist-viewer.ts';
import { getCy } from '../base/sivi-graph.ts';
import { setView, currentView, views } from '../base/registry.ts';
import { escapeHtml } from '../base/ui.ts';
import { selectEntity } from '../base/sivi-detail.ts';
import { renderEntityOverview } from '../base/sivi-overview.ts';
import { hideAllPanels } from '../base/sivi-list.ts';
import { setDirty } from '../base/model-state.ts';
import { moveExample } from '../operations/example-order.ts';
import { clActiveCodelist, clActiveEntityType, clSidebarMode, codelistData, entityTypeData, setSidebarMode } from '../base/model-loader.ts';
import { activeEntity, setActiveEntity } from '../base/sivi-state.ts';
import { AFD_MODEL } from '../base/afd-model.ts';

interface SidebarState {
  collapsed: boolean;
  iconStripBuilt: boolean;
  /** { exId, opId, target } while dragging an example. */
  exDragState: ExampleDragState | null;
  /** Swallows the click some browsers emit right after a drop. */
  exSuppressClickUntil: number;
}

interface DropTarget {
  btn: HTMLElement;
  exId: string | null;
  after: boolean;
}

interface ExampleDragState {
  exId: string;
  opId: string;
  target: DropTarget | null;
}

interface TreeItem {
  name: string;
  depth: number;
}

export const sidebarState = {} as SidebarState;

const LS_SIDEBAR = 'minerva_sidebarCollapsed';

export function initSidebarCollapse(): void {
  const btn = document.getElementById('sidebarCollapseBtn');
  if (!btn || btn.dataset.wired) return;
  btn.dataset.wired = '1';

  // Restore saved state (no transition on initial load)
  if (sidebarState.collapsed) {
    const sidebar = btn.closest('.sidebar') as HTMLElement;
    sidebar.style.transition = 'none';
    sidebar.classList.add('collapsed');
    btn.textContent = '»';
    btn.title = 'Expand sidebar';
    if (!sidebarState.iconStripBuilt) buildIconStrip();
    refreshIconStrip();
    updateIconStripVisibility();
    // Re-enable transition after paint
    requestAnimationFrame(() => {
      sidebar.style.transition = '';
    });
  }

  btn.addEventListener('click', () => {
    const sidebar = btn.closest('.sidebar') as HTMLElement;
    sidebarState.collapsed = !sidebarState.collapsed;
    sidebar.classList.toggle('collapsed', sidebarState.collapsed);
    btn.textContent = sidebarState.collapsed ? '»' : '«';
    btn.title = sidebarState.collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    if (sidebarState.collapsed && !sidebarState.iconStripBuilt) buildIconStrip();
    if (sidebarState.collapsed) refreshIconStrip();
    try {
      localStorage.setItem(LS_SIDEBAR, sidebarState.collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
    // Nudge Cytoscape graphs after CSS transition
    sidebar.addEventListener('transitionend', function resize(e) {
      if (e.propertyName !== 'width') return;
      sidebar.removeEventListener('transitionend', resize);
      resizeGraph();
      getCy()?.resize();
    });

    // Hide icon strip for non-API views (SIVI graceful degradation)
    updateIconStripVisibility();
  });
}

function updateIconStripVisibility(): void {
  const strip = document.getElementById('sidebarIconStrip');
  if (!strip) return;
  const view = currentView && views[currentView];
  const cat = view ? view.category : null;
  const apiGroup = document.getElementById('apiIconGroup');
  const siviGroup = document.getElementById('siviIconGroup');

  if (sidebarState.collapsed) {
    strip.style.display = 'flex';
    if (apiGroup) apiGroup.style.display = cat === 'api' ? '' : 'none';
    if (siviGroup) siviGroup.style.display = cat === 'sivi' ? '' : 'none';
  } else {
    strip.style.display = '';
    if (apiGroup) apiGroup.style.display = '';
    if (siviGroup) siviGroup.style.display = 'none';
  }
}

/* ── HTML helpers — generate section content as HTML strings ── */

function entitySectionHTML(): string {
  const tree = buildApiTree();
  const apiModel = state.apiModel as NonNullable<typeof state.apiModel>;
  let html = '';
  tree.forEach((item) => {
    const ent = apiModel[item.name];
    const isActive = state.apiActiveEntity === item.name;
    const isRoot = ent && ent.root;
    const indent = item.depth > 0 ? '<span class="ca-indent">' + '│ '.repeat(item.depth - 1) + '├ </span>' : '';
    const rootMarker = isRoot ? '<span class="ca-root-marker">◉</span> ' : '';
    const attrCount = ent ? ent.attrs.filter((a) => a.type !== '_section').length : 0;
    html += `<button class="ca-entity-btn${isActive ? ' active' : ''}${isRoot ? ' ca-root-entity' : ''}" data-entity="${escapeHtml(item.name)}">${indent}${rootMarker}${escapeHtml(item.name)} <span class="ca-badge">${attrCount}</span></button>`;
  });
  return html;
}

function enumSectionHTML(): string {
  const apiEnums = state.apiEnums;
  if (!apiEnums) return '';
  let html = '';
  Object.keys(apiEnums).forEach((name) => {
    const isActive = state.apiActiveEntity === 'enum:' + name;
    html += `<button class="ca-entity-btn${isActive ? ' active' : ''}" data-entity="enum:${escapeHtml(name)}"><span class="ca-enum-icon">◆</span> ${escapeHtml(name)} <span class="ca-badge">${(apiEnums[name] as { values: unknown[] }).values.length}</span></button>`;
  });
  return html;
}

function endpointSectionHTML(): string {
  if (!state.apiOps) return '';
  let html = '';
  (state.apiOps || []).forEach((op) => {
    const isActive = state.apiActiveEntity === 'op:' + op.id;
    const exCount = (state.apiExamples || []).filter((ex) => ex.operationId === op.id).length;
    const badge = exCount > 0 ? ` <span class="ca-badge">${exCount}</span>` : '';
    html += `<button class="ca-entity-btn${isActive ? ' active' : ''}" data-entity="op:${escapeHtml(op.id)}"><span class="ca-method-badge ca-method-${escapeHtml(op.method.toLowerCase())}">${escapeHtml(op.method)}</span> ${escapeHtml(op.path)}${badge}</button>`;
    const opExamples = (state.apiExamples || []).filter((ex) => ex.operationId === op.id);
    opExamples.forEach((ex) => {
      const exActive = state.apiActiveEntity === 'ex:' + ex.id;
      // The leading glyph sits in a fixed-width slot that swaps to a drag grip on hover
      // (expanded sidebar only; the flyout reuses this markup but is never draggable).
      html += `<button class="ca-entity-btn ca-example-btn${exActive ? ' active' : ''}" data-entity="ex:${escapeHtml(ex.id)}"><span class="ca-indent ca-example-lead"><span class="ca-lead-line">│</span><span class="ca-drag-grip" title="Drag to reorder">⠿</span></span><span class="ca-example-icon">▷</span> ${escapeHtml(ex.summary || ex.id)}</button>`;
    });
  });
  return html;
}

/* ── Wire click handlers on a container of .ca-entity-btn elements ── */
function wireEntityClicks(container: ParentNode): void {
  container.querySelectorAll<HTMLElement>('.ca-entity-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const entity = btn.dataset.entity as string;
      if (entity === '__general__') {
        state.apiActiveEntity = '__general__';
        document
          .querySelectorAll<HTMLElement>('.ca-entity-btn')
          .forEach((b) => b.classList.toggle('active', b.dataset.entity === '__general__'));
        if (sidebarState.collapsed) refreshIconStrip();
        showGeneralView();
      } else if (entity === '__overview__') {
        showApiGraphView();
      } else if (entity === '__search__') {
        showSearchView();
      } else {
        selectApiEntity(entity);
      }
    });
  });
}

/* ── Example drag-and-drop reordering (expanded sidebar only) ──
   Delegated listeners are attached once to #entityList, which survives every
   buildApiSidebar() rebuild; the buttons do not, so only the `draggable` flag is
   re-applied per build. #flyoutEndpoints reuses the same markup but is never made
   draggable. Reordering is same-operation only. */

function initExampleDragAndDrop(list: HTMLElement): void {
  list.querySelectorAll<HTMLElement>('.ca-example-btn').forEach((btn) => {
    btn.draggable = true;
  });
  if (list.dataset.exDragWired) return;
  list.dataset.exDragWired = '1';

  list.addEventListener('dragstart', (e) => {
    const btn = (e.target as Element).closest<HTMLElement>('.ca-example-btn[draggable="true"]');
    if (!btn) return;
    const exId = (btn.dataset.entity || '').slice(3);
    const ex = (state.apiExamples || []).find((x) => x.id === exId);
    if (!ex) {
      e.preventDefault();
      return;
    }
    sidebarState.exDragState = { exId, opId: ex.operationId, target: null };
    btn.classList.add('ca-drag-active');
    const dataTransfer = e.dataTransfer as DataTransfer;
    dataTransfer.effectAllowed = 'move';
    dataTransfer.setData('text/plain', exId); // Firefox needs a payload to start a drag
  });

  list.addEventListener('dragover', (e) => {
    if (!sidebarState.exDragState) return;
    const t = exDropTargetAt(e);
    exClearDropIndicators(list);
    sidebarState.exDragState.target = t;
    if (!t) return; // not prevented: "no drop" cursor, no drop event
    e.preventDefault();
    (e.dataTransfer as DataTransfer).dropEffect = 'move';
    t.btn.classList.add(t.after ? 'ca-drop-below' : 'ca-drop-above');
  });

  list.addEventListener('dragleave', (e) => {
    if (sidebarState.exDragState && (!e.relatedTarget || !list.contains(e.relatedTarget as Node))) {
      exClearDropIndicators(list);
      sidebarState.exDragState.target = null;
    }
  });

  list.addEventListener('drop', (e) => {
    e.preventDefault(); // always: Firefox otherwise navigates to the payload
    const st = sidebarState.exDragState;
    sidebarState.exDragState = null; // dragend cannot reach the list once the row is rebuilt
    exClearDropIndicators(list);
    if (!st || !st.target) return;
    sidebarState.exSuppressClickUntil = performance.now() + 250;
    if (!moveExample(st.exId, st.target.exId, st.target.after)) return; // no-op: no dirty, no rebuild
    setDirty(true);
    buildApiSidebar();
    if (state.apiActiveEntity === 'op:' + st.opId) renderApiOperation(st.opId);
  });

  list.addEventListener('dragend', () => {
    // cancelled drags: Escape, or released elsewhere
    exClearDropIndicators(list);
    list.querySelectorAll('.ca-drag-active').forEach((b) => b.classList.remove('ca-drag-active'));
    sidebarState.exDragState = null;
  });

  // Capture phase runs before the per-button click listeners from wireEntityClicks.
  list.addEventListener(
    'click',
    (e) => {
      if (performance.now() < sidebarState.exSuppressClickUntil) {
        e.stopPropagation();
        e.preventDefault();
      }
    },
    true,
  );
}

/** Drop target under the pointer, or null. The dragged example's own operation row means "make it first". */
function exDropTargetAt(e: DragEvent): DropTarget | null {
  const btn = (e.target as Element).closest<HTMLElement>('.ca-entity-btn');
  if (!btn) return null;
  const ent = btn.dataset.entity || '';
  const { exId, opId } = sidebarState.exDragState as ExampleDragState;
  if (ent === 'op:' + opId) return { btn, exId: null, after: true };
  if (!ent.startsWith('ex:') || ent === 'ex:' + exId) return null;
  const target = (state.apiExamples || []).find((x) => x.id === ent.slice(3));
  if (!target || target.operationId !== opId) return null;
  const r = btn.getBoundingClientRect();
  return { btn, exId: target.id, after: e.clientY > r.top + r.height / 2 };
}

function exClearDropIndicators(list: HTMLElement): void {
  list.querySelectorAll('.ca-drop-above, .ca-drop-below').forEach((b) => b.classList.remove('ca-drop-above', 'ca-drop-below'));
}

/* ── Icon strip (collapsed mode) ── */

export function buildIconStrip(): void {
  const strip = document.getElementById('sidebarIconStrip');
  if (!strip) return;
  const apiColor = (state.apiConfig && state.apiConfig.color) || '';
  const colorStyle = apiColor ? ` style="color:${escapeHtml(apiColor)}"` : '';

  strip.innerHTML = `
      <div id="apiIconGroup" class="icon-group">
        <div class="sidebar-icon-wrap">
            <button class="sidebar-icon" data-icon="general" title="General"${colorStyle}>⚙</button>
            <div class="sidebar-flyout" id="flyoutGeneral"></div>
        </div>
        <div class="sidebar-icon-wrap">
            <button class="sidebar-icon" data-icon="overview" title="Domain Model"${colorStyle}>◎</button>
        </div>
        <div class="sidebar-icon-wrap">
            <button class="sidebar-icon" data-icon="search" title="Search Model"${colorStyle}>⌕</button>
        </div>
        <div class="sidebar-icon-wrap" data-section="entities">
            <button class="sidebar-icon" data-icon="entities" title="Entities">▦</button>
            <div class="sidebar-flyout" id="flyoutEntities"></div>
        </div>
        <div class="sidebar-icon-wrap" data-section="enums">
            <button class="sidebar-icon" data-icon="enums" title="Enums" style="color:#d2a8ff">◆</button>
            <div class="sidebar-flyout" id="flyoutEnums"></div>
        </div>
        <div class="sidebar-icon-wrap" data-section="endpoints">
            <button class="sidebar-icon" data-icon="endpoints" title="Endpoints">⇄</button>
            <div class="sidebar-flyout" id="flyoutEndpoints"></div>
        </div>
      </div>
      <div id="siviIconGroup" class="icon-group" style="display:none">
        <div class="sidebar-icon-wrap">
            <button class="sidebar-icon" data-icon="sivi-switch" title="Switch View" style="color:#58a6ff">⚙</button>
            <div class="sidebar-flyout" id="flyoutSiviSwitch"></div>
        </div>
        <div class="sidebar-icon-wrap">
            <button class="sidebar-icon" data-icon="sivi-list" title="Entities">☰</button>
            <div class="sidebar-flyout" id="flyoutSiviEntities"></div>
        </div>
        <div class="sidebar-icon-wrap">
            <button class="sidebar-icon" data-icon="sivi-graph" title="Graph" style="color:#8b949e">◎</button>
        </div>
        <div class="sidebar-icon-wrap">
            <button class="sidebar-icon" data-icon="sivi-codelist" title="Codelists" style="color:#a78bfa">☷</button>
            <div class="sidebar-flyout" id="flyoutSiviCodelists"></div>
        </div>
      </div>`;

  const icon = (name: string): HTMLElement => strip.querySelector(`[data-icon="${name}"]`) as HTMLElement;

  // API icon clicks
  icon('general').addEventListener('click', () => {
    state.apiActiveEntity = '__general__';
    document
      .querySelectorAll<HTMLElement>('.ca-entity-btn')
      .forEach((b) => b.classList.toggle('active', b.dataset.entity === '__general__'));
    refreshIconStrip();
    showGeneralView();
  });
  icon('overview').addEventListener('click', () => {
    showApiGraphView();
  });
  icon('search').addEventListener('click', () => {
    showSearchView();
  });

  // SIVI icon clicks
  icon('sivi-list').addEventListener('click', () => {
    setView('list');
  });
  icon('sivi-graph').addEventListener('click', () => {
    setView('graph');
  });
  icon('sivi-codelist').addEventListener('click', () => {
    setView('codelist');
  });

  sidebarState.iconStripBuilt = true;
}

export function refreshIconStrip(): void {
  const view = currentView && views[currentView];
  const cat = view ? view.category : null;

  updateIconStripVisibility();

  if (cat === 'api') {
    refreshApiIcons();
  } else if (cat === 'sivi') {
    refreshSiviIcons();
  }
}

/* Shared cog flyout: SIVI views on top, then APIs — used by both icon groups */
function populateCogFlyout(flyout: HTMLElement | null): void {
  if (!flyout) return;
  // SIVI section
  let html = '<div class="flyout-section-label">SIVI</div>';
  ['list', 'graph', 'codelist'].forEach((id) => {
    const v = views[id];
    if (!v) return;
    const active = currentView === id ? ' active' : '';
    html += '<button class="flyout-api-btn' + active + '" data-view="' + escapeHtml(id) + '">' + escapeHtml(v.label) + '</button>';
  });
  // API section
  // API section — grouped when group tags are present
  const apiViews = Object.entries(views).filter(([_, v]) => v.category === 'api');
  if (apiViews.length) {
    type ApiViewEntry = { id: string; v: (typeof apiViews)[number][1] };
    const groupOrder: string[] = [];
    const groupMap: Record<string, ApiViewEntry[]> = {};
    const ungrouped: ApiViewEntry[] = [];
    apiViews.forEach(([id, v]) => {
      const g = v.group || null;
      if (g) {
        if (!groupMap[g]) {
          groupMap[g] = [];
          groupOrder.push(g);
        }
        (groupMap[g] as ApiViewEntry[]).push({ id, v });
      } else {
        ungrouped.push({ id, v });
      }
    });
    groupOrder.forEach((g) => {
      html += '<div class="flyout-section-label" style="margin-top:8px">' + escapeHtml(g) + '</div>';
      (groupMap[g] as ApiViewEntry[]).forEach(({ id, v }) => {
        const active = currentView === id ? ' active' : '';
        const col = v.color || '';
        const style = col
          ? ' style="border-color:' + escapeHtml(col) + (active ? ';background:' + escapeHtml(col) + ';color:#fff' : '') + '"'
          : '';
        html +=
          '<button class="flyout-api-btn' +
          active +
          '"' +
          style +
          ' data-view="' +
          escapeHtml(id) +
          '">' +
          escapeHtml(v.label) +
          '</button>';
      });
    });
    if (ungrouped.length) {
      html += '<div class="flyout-section-label" style="margin-top:8px">APIs</div>';
      ungrouped.forEach(({ id, v }) => {
        const active = currentView === id ? ' active' : '';
        const col = v.color || '';
        const style = col
          ? ' style="border-color:' + escapeHtml(col) + (active ? ';background:' + escapeHtml(col) + ';color:#fff' : '') + '"'
          : '';
        html +=
          '<button class="flyout-api-btn' +
          active +
          '"' +
          style +
          ' data-view="' +
          escapeHtml(id) +
          '">' +
          escapeHtml(v.label) +
          '</button>';
      });
    }
  }
  flyout.innerHTML = html;
  flyout.querySelectorAll<HTMLElement>('.flyout-api-btn').forEach((btn) => {
    btn.addEventListener('click', () => setView(btn.dataset.view as string));
  });
}

function refreshApiIcons(): void {
  const genFlyout = document.getElementById('flyoutGeneral');
  const entFlyout = document.getElementById('flyoutEntities');
  const enumFlyout = document.getElementById('flyoutEnums');
  const epFlyout = document.getElementById('flyoutEndpoints');
  if (!entFlyout) return;
  const enumList = enumFlyout as HTMLElement;
  const epList = epFlyout as HTMLElement;

  populateCogFlyout(genFlyout);

  entFlyout.innerHTML = '<input type="text" class="flyout-search" placeholder="Filter entities...">' + entitySectionHTML();
  enumList.innerHTML = enumSectionHTML();
  epList.innerHTML = endpointSectionHTML();

  // Wire search filter in entities flyout
  const flyoutSearch = entFlyout.querySelector<HTMLInputElement>('.flyout-search');
  if (flyoutSearch) {
    flyoutSearch.addEventListener('input', () => {
      const q = flyoutSearch.value.toLowerCase();
      entFlyout.querySelectorAll<HTMLElement>('.ca-entity-btn').forEach((btn) => {
        btn.style.display = (btn.dataset.entity as string).toLowerCase().includes(q) ? '' : 'none';
      });
    });
    flyoutSearch.addEventListener('click', (e) => e.stopPropagation());
  }

  wireEntityClicks(entFlyout);
  wireEntityClicks(enumList);
  wireEntityClicks(epList);

  // Update icon colors to match current API
  const strip = document.getElementById('sidebarIconStrip');
  if (!strip) return;
  const apiColor = (state.apiConfig && state.apiConfig.color) || '';
  const generalIcon = strip.querySelector<HTMLElement>('[data-icon="general"]');
  const overviewIcon = strip.querySelector<HTMLElement>('[data-icon="overview"]');
  const searchIcon = strip.querySelector<HTMLElement>('[data-icon="search"]');
  if (generalIcon) generalIcon.style.color = apiColor || '';
  if (overviewIcon) overviewIcon.style.color = apiColor || '';
  if (searchIcon) searchIcon.style.color = apiColor || '';

  // Update active icon highlighting
  const active = state.apiActiveEntity;
  strip.querySelectorAll('#apiIconGroup .sidebar-icon').forEach((ic) => ic.classList.remove('active'));
  if (active === '__general__') {
    strip.querySelector('[data-icon="general"]')?.classList.add('active');
  } else if (active === '__search__') {
    strip.querySelector('[data-icon="search"]')?.classList.add('active');
  } else if (!active || active === '__overview__') {
    strip.querySelector('[data-icon="overview"]')?.classList.add('active');
  } else if (active.startsWith('enum:')) {
    strip.querySelector('[data-icon="enums"]')?.classList.add('active');
  } else if (active.startsWith('op:') || active.startsWith('ex:')) {
    strip.querySelector('[data-icon="endpoints"]')?.classList.add('active');
  } else {
    strip.querySelector('[data-icon="entities"]')?.classList.add('active');
  }
}

function refreshSiviIcons(): void {
  const switchFlyout = document.getElementById('flyoutSiviSwitch');
  const entFlyout = document.getElementById('flyoutSiviEntities');
  const clFlyout = document.getElementById('flyoutSiviCodelists');

  // View switcher flyout: same unified cog menu
  populateCogFlyout(switchFlyout);

  // SIVI entities flyout
  if (entFlyout) {
    let html =
      '<button class="entity-btn' +
      (!activeEntity ? ' active' : '') +
      '" data-entity="__overview__"><span style="color:#58a6ff">◎</span> Overview</button>';
    html += '<input type="text" class="flyout-search" placeholder="Filter entities...">';
    Object.keys(AFD_MODEL)
      .sort()
      .forEach((name) => {
        const active = activeEntity === name ? ' active' : '';
        const childCount = (AFD_MODEL[name] as { parentOf: string[] }).parentOf.length;
        html +=
          '<button class="entity-btn' +
          active +
          '" data-entity="' +
          escapeHtml(name) +
          '">' +
          escapeHtml(name) +
          ' <span class="badge">' +
          childCount +
          '</span></button>';
      });
    entFlyout.innerHTML = html;
    // Wire search
    const fs = entFlyout.querySelector<HTMLInputElement>('.flyout-search');
    if (fs) {
      fs.addEventListener('input', () => {
        const q = fs.value.toLowerCase();
        entFlyout.querySelectorAll<HTMLElement>('.entity-btn').forEach((btn) => {
          btn.style.display = (btn.dataset.entity as string).toLowerCase().includes(q) ? '' : 'none';
        });
      });
      fs.addEventListener('click', (e) => e.stopPropagation());
    }
    // Wire clicks
    const overviewEl = entFlyout.querySelector('[data-entity="__overview__"]');
    if (overviewEl) {
      overviewEl.addEventListener('click', () => {
        setActiveEntity(null);
        document
          .querySelectorAll<HTMLElement>('.entity-btn')
          .forEach((b) => b.classList.toggle('active', b.dataset.entity === '__overview__'));
        if (sidebarState.collapsed) refreshIconStrip();
        hideAllPanels();
        renderEntityOverview();
      });
    }
    entFlyout.querySelectorAll<HTMLElement>('.entity-btn:not([data-entity="__overview__"])').forEach((btn) => {
      btn.addEventListener('click', () => selectEntity(btn.dataset.entity as string));
    });
  }

  // Codelists flyout
  if (clFlyout) {
    let html = '<input type="text" class="flyout-search" placeholder="Filter...">';
    html +=
      '<div class="cl-tab-toggle"><button class="cl-tab-btn flyout-cl-tab' +
      (clSidebarMode === 'codes' ? ' active' : '') +
      '" data-mode="codes">Codes</button>';
    html +=
      '<button class="cl-tab-btn flyout-cl-tab' +
      (clSidebarMode === 'entitytypes' ? ' active' : '') +
      '" data-mode="entitytypes">Entity Types</button></div>';
    const entityTypes = entityTypeData;
    if (clSidebarMode === 'codes' && codelistData) {
      codelistData.forEach((cl) => {
        const active = clActiveCodelist === cl.Name ? ' active' : '';
        const count = cl.Code ? cl.Code.length : 0;
        html +=
          '<button class="cl-entity-btn' +
          active +
          '" data-entity="cl:' +
          escapeHtml(cl.Name) +
          '">' +
          escapeHtml(cl.Name) +
          ' <span class="cl-badge">' +
          count +
          '</span><span class="cl-desc">' +
          escapeHtml(cl.Description) +
          '</span></button>';
      });
    } else if (clSidebarMode === 'entitytypes' && entityTypes) {
      Object.keys(entityTypes)
        .sort()
        .forEach((parentName) => {
          const parent = entityTypes[parentName] as NonNullable<typeof entityTypes>[string];
          if (!parent.subtypes || parent.subtypes.length === 0) return;
          if (parent.subtypes.length === 1 && (parent.subtypes[0] as { name: string }).name === 'default') return;
          const isActive = clActiveEntityType && clActiveEntityType.startsWith(parentName + '.') ? ' active' : '';
          html +=
            '<button class="cl-entity-btn' +
            isActive +
            '" data-entity="et:' +
            escapeHtml(parentName) +
            '">' +
            escapeHtml(parentName) +
            ' <span class="cl-et-badge">' +
            parent.subtypes.length +
            ' types</span><span class="cl-desc">' +
            escapeHtml(parent.description) +
            '</span></button>';
        });
    }
    clFlyout.innerHTML = html;
    // Wire tabs
    clFlyout.querySelectorAll<HTMLElement>('.flyout-cl-tab').forEach((tab) => {
      tab.addEventListener('click', (e) => {
        e.stopPropagation();
        setSidebarMode(tab.dataset.mode as 'codes' | 'entitytypes');
        refreshSiviIcons();
      });
    });
    // Wire search
    const fs = clFlyout.querySelector<HTMLInputElement>('.flyout-search');
    if (fs) {
      fs.addEventListener('input', () => {
        const q = fs.value.toLowerCase();
        clFlyout.querySelectorAll<HTMLElement>('.cl-entity-btn').forEach((btn) => {
          const name = (btn.dataset.entity as string).replace(/^(cl:|et:)/, '');
          btn.style.display = name.toLowerCase().includes(q) ? '' : 'none';
        });
      });
      fs.addEventListener('click', (e) => e.stopPropagation());
    }
    // Wire clicks
    clFlyout.querySelectorAll<HTMLElement>('.cl-entity-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ent = btn.dataset.entity as string;
        if (ent.startsWith('cl:')) {
          if (currentView !== 'codelist') setView('codelist');
          selectCodelist(ent.slice(3));
        } else if (ent.startsWith('et:')) {
          if (currentView !== 'codelist') setView('codelist');
          selectEntityType(ent.slice(3) + '._overview');
        }
      });
    });
  }

  // Update SIVI active icon highlighting
  const strip = document.getElementById('sidebarIconStrip');
  if (!strip) return;
  strip.querySelectorAll('#siviIconGroup .sidebar-icon').forEach((ic) => ic.classList.remove('active'));
  if (currentView === 'list') {
    strip.querySelector('[data-icon="sivi-list"]')?.classList.add('active');
  } else if (currentView === 'graph') {
    strip.querySelector('[data-icon="sivi-graph"]')?.classList.add('active');
  } else if (currentView === 'codelist') {
    strip.querySelector('[data-icon="sivi-codelist"]')?.classList.add('active');
  }
}

/* ── Main sidebar builder ── */

export function buildApiSidebar(): void {
  initSidebarCollapse();
  const list = document.getElementById('entityList') as HTMLElement;
  list.innerHTML = '';
  const apiColor = (state.apiConfig && state.apiConfig.color) || '';
  if (apiColor) list.style.setProperty('--api-color', apiColor);

  // General button
  const generalBtn = document.createElement('button');
  generalBtn.className = 'ca-entity-btn' + (state.apiActiveEntity === '__general__' ? ' active' : '');
  generalBtn.dataset.entity = '__general__';
  generalBtn.innerHTML =
    '<span class="ca-overview-icon"' + (apiColor ? ' style="color:' + escapeHtml(apiColor) + '"' : '') + '>⚙</span> General';
  list.appendChild(generalBtn);

  // Overview button
  const overviewBtn = document.createElement('button');
  overviewBtn.className = 'ca-entity-btn' + (!state.apiActiveEntity || state.apiActiveEntity === '__overview__' ? ' active' : '');
  overviewBtn.dataset.entity = '__overview__';
  overviewBtn.innerHTML =
    '<span class="ca-overview-icon"' + (apiColor ? ' style="color:' + escapeHtml(apiColor) + '"' : '') + '>◎</span> Domain Model';
  list.appendChild(overviewBtn);

  // Search button
  const searchBtn = document.createElement('button');
  searchBtn.className = 'ca-entity-btn' + (state.apiActiveEntity === '__search__' ? ' active' : '');
  searchBtn.dataset.entity = '__search__';
  searchBtn.innerHTML =
    '<span class="ca-overview-icon"' + (apiColor ? ' style="color:' + escapeHtml(apiColor) + '"' : '') + '>⌕</span> Search';
  list.appendChild(searchBtn);

  // Entities section
  const sep1 = document.createElement('div');
  sep1.className = 'ca-sidebar-section ca-sidebar-section-row';
  sep1.innerHTML =
    'Entities <button class="ca-sidebar-add-btn" onclick="event.stopPropagation();createEntity()" title="New entity">+</button>';
  list.appendChild(sep1);
  list.insertAdjacentHTML('beforeend', entitySectionHTML());

  // Enums section
  const sep2 = document.createElement('div');
  sep2.className = 'ca-sidebar-section ca-sidebar-section-row';
  sep2.innerHTML = 'Enums <button class="ca-sidebar-add-btn" onclick="event.stopPropagation();createEnum()" title="New enum">+</button>';
  list.appendChild(sep2);
  list.insertAdjacentHTML('beforeend', enumSectionHTML());

  // Endpoints section
  const sep3 = document.createElement('div');
  sep3.className = 'ca-sidebar-section ca-sidebar-section-row';
  sep3.innerHTML =
    'Endpoints <button class="ca-sidebar-add-btn" onclick="event.stopPropagation();createOperation()" title="New endpoint">+</button>';
  list.appendChild(sep3);
  list.insertAdjacentHTML('beforeend', endpointSectionHTML());

  // Wire click handlers on entityList buttons
  wireEntityClicks(list);
  initExampleDragAndDrop(list);

  // Refresh icon strip if collapsed
  if (sidebarState.collapsed) {
    if (!sidebarState.iconStripBuilt) buildIconStrip();
    refreshIconStrip();
  }

  // A rebuild (after an edit, or once a model has loaded) keeps the filter typed in the search box.
  applyApiSidebarFilter();
}

/** Show only the sidebar entries whose name contains the text of the search box. */
export function applyApiSidebarFilter(): void {
  const q = ((document.getElementById('search') as HTMLInputElement | null)?.value ?? '').toLowerCase();
  document.querySelectorAll<HTMLElement>('.ca-entity-btn').forEach((btn) => {
    const entity = btn.dataset.entity || '';
    btn.style.display = entity.toLowerCase().includes(q) ? 'block' : 'none';
  });
}

export function buildApiTree(): TreeItem[] {
  const apiModel = state.apiModel;
  if (!apiModel) return [];
  const result: TreeItem[] = [];
  const visited = new Set<string>();

  function walk(name: string, depth: number): void {
    if (visited.has(name)) return;
    visited.add(name);
    result.push({ name, depth });
    const e = apiModel![name];
    if (e && e.children) {
      e.children.forEach((c) => walk(c.name, depth + 1));
    }
  }

  // Start from a known root if it exists, or infer roots (entities not referenced as children)
  const allChildren = new Set<string>();
  Object.values(apiModel).forEach((e) => {
    if (e.children) e.children.forEach((c) => allChildren.add(c.name));
  });
  const roots = Object.keys(apiModel).filter((n) => !allChildren.has(n));

  // Walk roots in order
  roots.forEach((r) => walk(r, 0));

  // Catch any orphans (in cycles, etc.)
  Object.keys(apiModel).forEach((name) => {
    if (!visited.has(name)) walk(name, 0);
  });

  return result;
}

export function selectApiEntity(name: string): void {
  state.apiActiveEntity = name;
  document.querySelectorAll<HTMLElement>('.ca-entity-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.entity === name);
  });

  // Update icon strip active state
  if (sidebarState.collapsed) refreshIconStrip();

  // Switch from graph to detail
  const caCyEl = document.getElementById('caCy') as HTMLElement;
  const caGraphLegend = document.getElementById('caGraphLegend') as HTMLElement;
  const listView = document.getElementById('listView') as HTMLElement;
  caCyEl.classList.remove('visible', 'with-header');
  caGraphLegend.style.display = 'none';
  const caGraphZoom = document.getElementById('caGraphZoom');
  if (caGraphZoom) caGraphZoom.style.display = 'none';
  (document.getElementById('graphTooltip') as HTMLElement).classList.remove('visible');
  listView.style.display = 'block';

  if (name.startsWith('enum:')) {
    renderApiEnum(name.slice(5));
  } else if (name.startsWith('ex:')) {
    renderApiExample(name.slice(3));
  } else if (name.startsWith('op:')) {
    renderApiOperation(name.slice(3));
  } else {
    renderEntityDetail(name);
  }
}

export function showApiGraphView(): void {
  state.apiActiveEntity = '__overview__';
  document.querySelectorAll<HTMLElement>('.ca-entity-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.entity === '__overview__');
  });
  if (sidebarState.collapsed) refreshIconStrip();
  showApiGraph();
}

/**
 * Creates the sidebar state (restoring the collapsed flag from localStorage),
 * wires the collapse button once the DOM is ready, and exposes the sidebar
 * functions the markup calls from inline handlers.
 */
export function install(): void {
  sidebarState.collapsed = false;
  sidebarState.iconStripBuilt = false;
  sidebarState.exDragState = null;
  sidebarState.exSuppressClickUntil = 0;

  try {
    sidebarState.collapsed = localStorage.getItem(LS_SIDEBAR) === '1';
  } catch {
    /* ignore */
  }

  document.addEventListener('DOMContentLoaded', () => {
    initSidebarCollapse();
    // Keyboard shortcut: Cmd+B (Mac) / Ctrl+B to toggle sidebar
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        const btn = document.getElementById('sidebarCollapseBtn');
        if (btn) btn.click();
      }
    });
    // Hide icon strip when switching to non-API views
    window.addEventListener('hashchange', updateIconStripVisibility);
  });

  // These serve inline handlers in the markup (onclick="name(...)" and the like).
  exposeFunctions({
    selectApiEntity,
    showApiGraphView,
  });
}

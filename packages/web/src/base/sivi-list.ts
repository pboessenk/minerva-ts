/** SIVI list view: the entity sidebar, sidebar filter and panel switching. */
import { exposeFunctions } from '../globals.ts';
import { AFD_MODEL } from './afd-model.ts';
import { views, currentView } from './registry.ts';
import { selectEntity } from './sivi-detail.ts';
import { renderEntityOverview } from './sivi-overview.ts';
import { activeEntity, setActiveEntity } from './sivi-state.ts';
import { escapeHtml } from './ui.ts';
import { buildIconStrip, initSidebarCollapse, refreshIconStrip, sidebarState } from '../editor/sidebar.ts';

export function buildSidebar(): void {
  initSidebarCollapse();
  const list = document.getElementById('entityList') as HTMLElement;
  list.innerHTML = '';

  // Overview button
  const overviewBtn = document.createElement('button');
  overviewBtn.className = 'entity-btn' + (!activeEntity ? ' active' : '');
  overviewBtn.dataset.entity = '__overview__';
  overviewBtn.innerHTML = '<span style="color:#58a6ff">◎</span> Overview';
  overviewBtn.onclick = () => {
    setActiveEntity(null);
    document.querySelectorAll<HTMLElement>('.entity-btn').forEach((b) => b.classList.toggle('active', b.dataset.entity === '__overview__'));
    if (sidebarState.collapsed) refreshIconStrip();
    hideAllPanels();
    renderEntityOverview();
  };
  list.appendChild(overviewBtn);

  const sorted = Object.keys(AFD_MODEL).sort();
  sorted.forEach((name) => {
    const btn = document.createElement('button');
    btn.className = 'entity-btn';
    btn.dataset.entity = name;
    if (activeEntity === name) btn.classList.add('active');
    const childCount = (AFD_MODEL[name] as (typeof AFD_MODEL)[string]).parentOf.length;
    btn.innerHTML = `${escapeHtml(name)} <span class="badge">${childCount}</span>`;
    btn.onclick = () => selectEntity(name);
    list.appendChild(btn);
  });
  if (sidebarState.collapsed) {
    if (!sidebarState.iconStripBuilt) buildIconStrip();
    refreshIconStrip();
  }
}

export function filterEntities(): void {
  // Delegate to the active view's filter if it has one
  const view = currentView ? views[currentView] : undefined;
  if (view && view.filter) {
    view.filter();
    return;
  }
  // Default: filter visible entity buttons
  const q = (document.getElementById('search') as HTMLInputElement).value.toLowerCase();
  document.querySelectorAll<HTMLElement>('#entityList .entity-btn, #entityList .ca-entity-btn').forEach((btn) => {
    const entity = btn.dataset.entity || '';
    btn.style.display = entity.toLowerCase().includes(q) ? 'block' : 'none';
  });
}

/* ── Hide all panels (called before each view activation) ── */
export function hideAllPanels(): void {
  const cyEl = document.getElementById('cy') as HTMLElement;
  const listView = document.getElementById('listView') as HTMLElement;
  const welcome = document.getElementById('welcomeScreen');
  const graphLegend = document.getElementById('graphLegend') as HTMLElement;
  const graphTooltip = document.getElementById('graphTooltip') as HTMLElement;
  const caCyEl = document.getElementById('caCy');
  const caGraphLegend = document.getElementById('caGraphLegend');
  const caGraphZoom = document.getElementById('caGraphZoom');

  cyEl.classList.remove('visible');
  if (caCyEl) caCyEl.classList.remove('visible', 'with-header');
  graphLegend.classList.remove('visible');
  if (caGraphLegend) caGraphLegend.style.display = 'none';
  if (caGraphZoom) caGraphZoom.style.display = 'none';
  graphTooltip.classList.remove('visible');
  listView.style.display = 'none';
  if (welcome) welcome.style.display = 'none';
  (document.getElementById('graphControls') as HTMLElement).classList.remove('visible');
}

export function installSiviList(): void {
  // These serve inline handlers in the markup (onclick="name(...)" and the like).
  exposeFunctions({
    filterEntities,
  });
}

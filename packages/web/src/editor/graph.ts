/**
 * Editor graph: Cytoscape-based domain model graph visualisation.
 */
import { createGraph } from '../base/graph-library.ts';
import { exposeFunctions } from '../globals.ts';
import { selectApiEntity } from './sidebar.ts';
import { loadedModel, state } from './state.ts';
import { escapeHtml } from '../base/ui.ts';
import { getModel } from '../base/model-state.ts';

/** The parts of a cytoscape instance the graph uses. */
export interface CyStyleBuilder {
  selector(selector: string): CyStyleBuilder;
  style(properties: Record<string, string | number>): CyStyleBuilder;
  update(): void;
}

export interface CyElement {
  id(): string;
  addClass(name: string): void;
  removeClass(name: string): void;
}

export interface CyEvent {
  target: CyElement | CyCore;
}

export interface CyCore {
  destroy(): void;
  resize(): void;
  fit(elements?: undefined, padding?: number): void;
  style(): CyStyleBuilder;
  on(event: string, selector: string, handler: (event: CyEvent) => void): void;
  on(event: string, handler: (event: CyEvent) => void): void;
}

interface GraphState {
  cy: CyCore | null;
  scale: number;
  selectedRoot: string | null;
}

const graph = {} as GraphState;

// Base sizes at scale 1.0 (calibrated for screen-sharing readability)
const GRAPH_BASE_SIZES = {
  node: { w: 75, h: 75, border: 4.5, fontSize: 18, textMarginY: 12, textMaxW: 150, outlineW: 3 },
  root: { w: 105, h: 105, border: 6, fontSize: 21 },
  edge: { w: 3, fontSize: 15, arrowScale: 1.5, bgPad: 4.5 },
  hoverBorder: 6,
};

function applyGraphScale(): void {
  if (!graph.cy) return;
  const s = graph.scale;
  const b = GRAPH_BASE_SIZES;
  graph.cy
    .style()
    .selector('node')
    .style({
      width: b.node.w * s,
      height: b.node.h * s,
      'border-width': b.node.border * s,
      'font-size': b.node.fontSize * s + 'px',
      'text-margin-y': b.node.textMarginY * s,
      'text-max-width': b.node.textMaxW * s + 'px',
      'text-outline-width': b.node.outlineW * s,
    })
    .selector('node[?isRoot]')
    .style({
      width: b.root.w * s,
      height: b.root.h * s,
      'border-width': b.root.border * s,
      'font-size': b.root.fontSize * s + 'px',
    })
    .selector('edge')
    .style({
      width: b.edge.w * s,
      'font-size': b.edge.fontSize * s + 'px',
      'arrow-scale': b.edge.arrowScale * s,
      'text-background-padding': b.edge.bgPad * s + 'px',
    })
    .selector('node.ca-hover')
    .style({
      'border-width': b.hoverBorder * s,
    })
    .update();
  const label = document.getElementById('caGraphZoomLabel');
  if (label) label.textContent = Math.round(s * 100) + '%';
}

export function graphScaleUp(): void {
  if (graph.scale >= 3.0) return;
  graph.scale = Math.min(3.0, +(graph.scale + 0.25).toFixed(2));
  applyGraphScale();
}

export function graphScaleDown(): void {
  if (graph.scale <= 0.5) return;
  graph.scale = Math.max(0.5, +(graph.scale - 0.25).toFixed(2));
  applyGraphScale();
}

export function graphScaleReset(): void {
  graph.scale = 1.0;
  applyGraphScale();
}

/** Drops the graph so it is built again from new data on the next show. */
export function resetGraph(): void {
  if (graph.cy) {
    graph.cy.destroy();
    graph.cy = null;
  }
}

/** Lets the graph follow a size change of its container. */
export function resizeGraph(): void {
  if (graph.cy) graph.cy.resize();
}

export function showApiGraph(): void {
  const caCyEl = document.getElementById('caCy') as HTMLElement;
  const listView = document.getElementById('listView') as HTMLElement;
  const caGraphLegend = document.getElementById('caGraphLegend') as HTMLElement;

  // Render info header above the graph
  const m = getModel();
  const title = (m && m.title) || (state.apiConfig && state.apiConfig.name) || 'API';
  const currentColor = (state.apiConfig && state.apiConfig.color) || '#1f6feb';

  // Build root entity dropdown
  const roots = Object.entries(loadedModel())
    .filter(([_, e]) => e.root)
    .map(([n]) => n);
  if (!graph.selectedRoot || !roots.includes(graph.selectedRoot)) {
    graph.selectedRoot = roots[0] || null;
  }
  const rootOptions = roots
    .map((n) => `<option value="${escapeHtml(n)}"${n === graph.selectedRoot ? ' selected' : ''}>${escapeHtml(n)}</option>`)
    .join('');
  const rootDropdown =
    roots.length > 1
      ? `<select class="ca-graph-root-select" id="graphRootSelect">${rootOptions}</select>`
      : roots.length === 1
        ? ''
        : '<span class="ca-graph-no-roots">No root entities defined</span>';

  listView.innerHTML = `
        <div class="ca-graph-header">
            <span class="ca-graph-header-dot" style="background:${escapeHtml(currentColor)}"></span>
            <span class="ca-graph-header-title-ro">${escapeHtml(title)}</span>
            ${rootDropdown}
        </div>
    `;
  listView.style.display = 'block';

  // Root selector
  const rootSelect = document.getElementById('graphRootSelect') as HTMLSelectElement | null;
  if (rootSelect) {
    rootSelect.addEventListener('change', () => {
      graph.selectedRoot = rootSelect.value;
      refreshGraph();
    });
  }

  caCyEl.classList.add('visible', 'with-header');
  caGraphLegend.style.display = 'block';

  const zoomBar = document.getElementById('caGraphZoom');
  if (zoomBar) zoomBar.style.display = 'flex';

  if (!graph.cy) {
    initApiGraph();
  } else {
    graph.cy.resize();
    graph.cy.fit(undefined, 50);
  }
}

export function refreshGraph(): void {
  if (graph.cy) {
    graph.cy.destroy();
    graph.cy = null;
  }
  // If graph is currently visible, re-init it
  const caCyEl = document.getElementById('caCy');
  if (caCyEl && caCyEl.classList.contains('visible')) {
    initApiGraph();
  }
}

interface GraphNode {
  data: {
    id: string;
    label: string;
    attrCount: number;
    isRoot: boolean;
    desc: string;
    hasOpenPoint: boolean;
    openPoints: unknown[];
  };
}

interface GraphEdge {
  data: { id: string; source: string; target: string; card: string; condition: string };
}

export function initApiGraph(): void {
  const apiModel = loadedModel();
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // Collect entities reachable from selected root
  const visibleEntities = new Set<string>();
  if (graph.selectedRoot && apiModel[graph.selectedRoot]) {
    const queue = [graph.selectedRoot];
    while (queue.length) {
      const name = queue.shift() as string;
      if (visibleEntities.has(name)) continue;
      visibleEntities.add(name);
      const ent = apiModel[name];
      if (ent && ent.children) {
        ent.children.forEach((c) => queue.push(c.name));
      }
    }
  }

  // Build nodes from apiModel (only visible entities)
  Object.entries(apiModel).forEach(([name, e]) => {
    if (visibleEntities.size > 0 && !visibleEntities.has(name)) return;

    const attrCount = e.attrs.filter((a) => a.type !== '_section').length;
    const isRoot = e.root || false;

    nodes.push({
      data: {
        id: 'ca-' + name,
        label: name,
        attrCount,
        isRoot,
        desc: e.desc || '',
        hasOpenPoint: !!(e.openPoints && e.openPoints.length),
        openPoints: e.openPoints || [],
      },
    });
  });

  // Build edges from parent→child relationships (only visible entities)
  Object.entries(apiModel).forEach(([name, e]) => {
    if (visibleEntities.size > 0 && !visibleEntities.has(name)) return;
    if (e.children) {
      e.children.forEach((c) => {
        if (visibleEntities.size > 0 && !visibleEntities.has(c.name)) return;
        edges.push({
          data: {
            id: 'ca-e-' + name + '-' + c.name,
            source: 'ca-' + name,
            target: 'ca-' + c.name,
            card: c.card,
            condition: c.condition || '',
          },
        });
      });
    }
  });

  const cy = createGraph<CyCore>({
    container: document.getElementById('caCy'),
    elements: { nodes, edges },
    style: [
      {
        selector: 'node',
        style: {
          label: 'data(label)',
          width: 75,
          height: 75,
          'background-color': '#1f6feb',
          'border-width': 4.5,
          'border-color': '#58a6ff',
          color: '#c9d1d9',
          'font-size': '18px',
          'font-weight': 'bold',
          'text-valign': 'bottom',
          'text-halign': 'center',
          'text-margin-y': 12,
          'font-family': '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
          'text-outline-width': 3,
          'text-outline-color': '#0d1117',
          'text-outline-opacity': 0.9,
          'text-wrap': 'wrap',
          'text-max-width': '150px',
          'transition-property': 'background-color, border-color, border-width, width, height',
          'transition-duration': '0.2s',
          cursor: 'pointer',
        },
      },
      {
        selector: 'node[?isRoot]',
        style: {
          width: 105,
          height: 105,
          'background-color': '#f85149',
          'border-color': '#da3633',
          'border-width': 6,
          'font-size': '21px',
          color: '#f0f6fc',
        },
      },
      {
        selector: 'edge',
        style: {
          width: 3,
          'line-color': '#30363d',
          'target-arrow-color': '#484f58',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'arrow-scale': 1.5,
          opacity: 0.7,
          label: 'data(card)',
          'font-size': '15px',
          color: '#8b949e',
          'text-background-color': '#0d1117',
          'text-background-opacity': 0.85,
          'text-background-padding': '4.5px',
          'text-rotation': 'autorotate',
          'font-family': 'SF Mono, Fira Code, monospace',
        },
      },
      {
        selector: 'node:active',
        style: {
          'overlay-opacity': 0.1,
          'overlay-color': '#58a6ff',
        },
      },
      {
        selector: 'node.ca-hover',
        style: {
          'border-width': 6,
          'border-color': '#f0f6fc',
        },
      },
    ],
    layout: {
      name: 'dagre',
      rankDir: 'TB',
      nodeSep: 80,
      rankSep: 120,
      padding: 60,
      animate: false,
      spacingFactor: 1.2,
    },
    wheelSensitivity: 0.3,
    minZoom: 0.2,
    maxZoom: 3,
  });
  graph.cy = cy;

  // Click → navigate to entity detail
  cy.on('tap', 'node', (evt) => {
    const name = (evt.target as CyElement).id().replace('ca-', '');
    if (loadedModel()[name]) {
      selectApiEntity(name);
    }
  });

  // Hover effects
  cy.on('mouseover', 'node', (evt) => {
    const target = evt.target as CyElement;
    target.addClass('ca-hover');
    const name = target.id().replace('ca-', '');
    const e = loadedModel()[name];
    if (e) {
      const tip = document.getElementById('graphTooltip') as HTMLElement;
      const attrCount = e.attrs.filter((a) => a.type !== '_section').length;
      const siviCount = e.attrs.filter((a) => a.type !== '_section' && a.sivi).length;
      tip.innerHTML = `
                <h4>${escapeHtml(name)}</h4>
                <div class="gt-desc">${escapeHtml(e.desc)}</div>
                <div class="gt-stat">Attributes: <span>${attrCount}</span></div>
                <div class="gt-stat">SIVI-aligned: <span>${siviCount}</span></div>
                ${e.openPoints && e.openPoints.length ? e.openPoints.map((p) => `<div class="gt-open-point">${p.type === 'error' ? '✖' : p.type === 'info' ? 'ℹ' : '⚠'} ${escapeHtml(p.text)}</div>`).join('') : ''}
                <div class="gt-hint">Click to explore attributes</div>
            `;
      tip.classList.add('visible');
    }
  });

  cy.on('mouseout', 'node', (evt) => {
    (evt.target as CyElement).removeClass('ca-hover');
    (document.getElementById('graphTooltip') as HTMLElement).classList.remove('visible');
  });

  // Background click → deselect
  cy.on('tap', (evt) => {
    if (evt.target === graph.cy) {
      (document.getElementById('graphTooltip') as HTMLElement).classList.remove('visible');
    }
  });
}

/** Creates the graph state and exposes the scale controls the markup calls from inline handlers. */
export function install(): void {
  graph.cy = null;
  graph.scale = 1.0;
  graph.selectedRoot = null;

  // These serve inline handlers in the markup (onclick="name(...)" and the like).
  exposeFunctions({
    graphScaleUp,
    graphScaleDown,
    graphScaleReset,
  });
}

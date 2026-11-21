/** SIVI graph view: the AFD entities as a cytoscape graph. */
import { exposeFunctions } from '../globals.ts';
import { AFD_MODEL, type AfdEntity } from './afd-model.ts';
import { type CyCollection, type CyCore, type CyStyleRule, createCytoscape } from './cytoscape-types.ts';
import { activeEntity, setActiveEntity } from './sivi-state.ts';
import { escapeHtml } from './ui.ts';

type EdgeFilter = 'all' | 'children' | 'parents';

let cy: CyCore | null;

/** The graph instance, or null before the graph view was first shown. */
export function getCy(): CyCore | null {
  return cy;
}

let labelsVisible: boolean;
let edgeFilter: EdgeFilter;

/** A reference model entity; callers pass names taken from the model itself. */
function entity(name: string): AfdEntity {
  return AFD_MODEL[name] as AfdEntity;
}

function buildGraphElements(): { nodes: unknown[]; edges: unknown[] } {
  const nodes: unknown[] = [];
  const edges: unknown[] = [];
  const edgeSet = new Set<string>();

  const names = Object.keys(AFD_MODEL);
  // Compute degree for sizing
  const degree: Record<string, number> = {};
  names.forEach((n) => {
    degree[n] = entity(n).parentOf.length + entity(n).childOf.length;
  });
  const maxDeg = Math.max(...Object.values(degree), 1);

  names.forEach((name) => {
    const d = degree[name] as number;
    nodes.push({
      data: {
        id: name,
        label: name,
        degree: d,
        childCount: entity(name).parentOf.length,
        parentCount: entity(name).childOf.length,
        size: 20 + (d / maxDeg) * 40,
      },
    });

    // parentOf edges: parent → child (this entity is parent)
    entity(name).parentOf.forEach((child) => {
      if (child === name) return; // skip self-ref for edges (loop)
      const key = name + '->' + child;
      const revKey = child + '->' + name;
      if (!edgeSet.has(key)) {
        // Check if bidirectional
        const isBidir = entity(child).parentOf && entity(child).parentOf.includes(name);
        edgeSet.add(key);
        edgeSet.add(revKey);
        edges.push({
          data: {
            id: 'e-' + key,
            source: name,
            target: child,
            relType: isBidir ? 'bidir' : 'child',
            sourceIsParent: true,
          },
        });
      }
    });
  });

  return { nodes, edges };
}

/** True once the cytoscape graph has been created. */
export function isGraphCreated(): boolean {
  return cy !== null;
}

export function initGraph(onSelectNode: (name: string) => void): void {
  const { nodes, edges } = buildGraphElements();

  cy = createCytoscape({
    container: document.getElementById('cy'),
    elements: { nodes, edges },
    style: [
      {
        selector: 'node',
        style: {
          label: 'data(label)',
          width: 'data(size)',
          height: 'data(size)',
          'background-color': '#30363d',
          'border-width': 2,
          'border-color': '#484f58',
          color: '#8b949e',
          'font-size': '10px',
          'text-valign': 'bottom',
          'text-halign': 'center',
          'text-margin-y': 6,
          'font-family': '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
          'text-outline-width': 2,
          'text-outline-color': '#0d1117',
          'text-outline-opacity': 0.8,
          'transition-property': 'background-color, border-color, border-width, opacity, width, height',
          'transition-duration': '0.2s',
        },
      },
      {
        selector: 'edge',
        style: {
          width: 1,
          'line-color': '#21262d',
          'target-arrow-color': '#21262d',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'arrow-scale': 0.8,
          opacity: 0.3,
          'transition-property': 'line-color, target-arrow-color, width, opacity',
          'transition-duration': '0.2s',
        },
      },
      // Highlighted selected node
      {
        selector: 'node.highlighted',
        style: {
          'background-color': '#58a6ff',
          'border-color': '#1f6feb',
          'border-width': 3,
          color: '#f0f6fc',
          'font-size': '12px',
          'font-weight': 'bold',
          'z-index': 999,
        },
      },
      // Connected neighbor nodes
      {
        selector: 'node.neighbor-child',
        style: {
          'background-color': '#1f6feb',
          'border-color': '#58a6ff',
          'border-width': 2,
          color: '#58a6ff',
          'font-size': '11px',
          'z-index': 998,
        },
      },
      {
        selector: 'node.neighbor-parent',
        style: {
          'background-color': '#238636',
          'border-color': '#3fb950',
          'border-width': 2,
          color: '#3fb950',
          'font-size': '11px',
          'z-index': 998,
        },
      },
      {
        selector: 'node.neighbor-bidir',
        style: {
          'background-color': '#9e6a03',
          'border-color': '#d29922',
          'border-width': 2,
          color: '#d29922',
          'font-size': '11px',
          'z-index': 998,
        },
      },
      // Dimmed nodes
      {
        selector: 'node.dimmed',
        style: {
          opacity: 0.15,
          color: '#30363d',
        },
      },
      // Active edges
      {
        selector: 'edge.edge-child',
        style: {
          'line-color': '#58a6ff',
          'target-arrow-color': '#58a6ff',
          width: 2,
          opacity: 0.85,
          'z-index': 997,
        },
      },
      {
        selector: 'edge.edge-parent',
        style: {
          'line-color': '#3fb950',
          'target-arrow-color': '#3fb950',
          width: 2,
          opacity: 0.85,
          'z-index': 997,
        },
      },
      {
        selector: 'edge.edge-bidir',
        style: {
          'line-color': '#d29922',
          'target-arrow-color': '#d29922',
          width: 2.5,
          opacity: 0.9,
          'z-index': 997,
          'target-arrow-shape': 'triangle',
          'source-arrow-shape': 'triangle',
          'source-arrow-color': '#d29922',
        },
      },
      // Dimmed edges
      {
        selector: 'edge.dimmed',
        style: {
          opacity: 0.04,
        },
      },
    ] as CyStyleRule[],
    layout: {
      name: 'cose',
      animate: false,
      nodeRepulsion: () => 80000,
      idealEdgeLength: () => 120,
      edgeElasticity: () => 100,
      gravity: 0.25,
      numIter: 1500,
      padding: 40,
    },
    wheelSensitivity: 0.3,
    minZoom: 0.1,
    maxZoom: 4,
  });

  // Click handler
  cy.on('tap', 'node', (evt) => {
    const name = (evt.target as CyCollection).id();
    onSelectNode(name);
  });

  // Hover tooltip
  cy.on('mouseover', 'node', (evt) => {
    const target = evt.target as CyCollection;
    const n = target.id();
    const e = entity(n);
    target.style('cursor', 'pointer');
    showGraphTooltip(n, e);
  });
  cy.on('mouseout', 'node', () => {
    (document.getElementById('graphTooltip') as HTMLElement).classList.remove('visible');
  });

  // Background click = deselect
  cy.on('tap', (evt) => {
    if (evt.target === cy) {
      clearGraphHighlight();
      setActiveEntity(null);
      document.querySelectorAll('.entity-btn').forEach((btn) => btn.classList.remove('active'));
      (document.getElementById('graphTooltip') as HTMLElement).classList.remove('visible');
    }
  });
}

function showGraphTooltip(name: string, e: AfdEntity): void {
  const tip = document.getElementById('graphTooltip') as HTMLElement;
  const bidir = e.parentOf.filter((c) => e.childOf.includes(c));
  tip.innerHTML = `
        <h4>${escapeHtml(name)}</h4>
        ${e.desc ? `<div style="font-size:12px;color:#8b949e;margin-bottom:8px;line-height:1.4;border-bottom:1px solid #21262d;padding-bottom:6px;">${escapeHtml(e.desc)}</div>` : ''}
        <div class="gt-stat">Children: <span>${e.parentOf.length}</span></div>
        <div class="gt-stat">Parents: <span>${e.childOf.length}</span></div>
        <div class="gt-stat">Bidirectional: <span>${bidir.length}</span></div>
        <div class="gt-hint">Click to select &middot; Scroll to zoom</div>
    `;
  tip.classList.add('visible');
}

export function highlightGraphNode(name: string): void {
  const graph = cy;
  if (!graph) return;
  clearGraphHighlight();

  const e = entity(name);
  const selected = graph.getElementById(name);
  const children = new Set(e.parentOf);
  const parents = new Set(e.childOf);
  const bidir = new Set(e.parentOf.filter((c) => e.childOf.includes(c)));

  // Determine visible relationships based on filter
  let visibleChildren: Set<string>, visibleParents: Set<string>;
  if (edgeFilter === 'children') {
    visibleChildren = children;
    visibleParents = new Set<string>();
  } else if (edgeFilter === 'parents') {
    visibleChildren = new Set<string>();
    visibleParents = parents;
  } else {
    visibleChildren = children;
    visibleParents = parents;
  }

  const allConnected = new Set([...visibleChildren, ...visibleParents]);

  // Dim everything first
  graph.elements().addClass('dimmed');

  // Highlight selected
  selected.removeClass('dimmed').addClass('highlighted');

  // Highlight neighbors and edges
  allConnected.forEach((neighbor) => {
    if (neighbor === name) return;
    const node = graph.getElementById(neighbor);
    node.removeClass('dimmed');

    const isBidir = bidir.has(neighbor) && visibleChildren.has(neighbor) && visibleParents.has(neighbor);
    if (isBidir) {
      node.addClass('neighbor-bidir');
    } else if (visibleChildren.has(neighbor)) {
      node.addClass('neighbor-child');
    } else if (visibleParents.has(neighbor)) {
      node.addClass('neighbor-parent');
    }
  });

  // Highlight edges
  graph.edges().forEach((edge) => {
    const src = edge.data('source');
    const tgt = edge.data('target');
    const involves = src === name || tgt === name;
    if (!involves) return;

    const other = src === name ? tgt : src;
    if (!allConnected.has(other)) return;

    edge.removeClass('dimmed');
    const isBidir = bidir.has(other) && visibleChildren.has(other) && visibleParents.has(other);
    if (isBidir) {
      edge.addClass('edge-bidir');
    } else if (visibleChildren.has(other)) {
      edge.addClass('edge-child');
    } else if (visibleParents.has(other)) {
      edge.addClass('edge-parent');
    }
  });

  // Animate to center on selected
  graph.animate({
    center: { eles: selected },
    duration: 300,
  });
}

function clearGraphHighlight(): void {
  if (!cy) return;
  cy.elements().removeClass('dimmed highlighted neighbor-child neighbor-parent neighbor-bidir edge-child edge-parent edge-bidir');
}

function changeLayout(): void {
  if (!cy) return;
  const layoutName = (document.getElementById('layoutSelect') as HTMLSelectElement).value;
  const opts: Record<string, unknown> = { name: layoutName, animate: true, animationDuration: 500, padding: 40 };

  if (layoutName === 'cose') {
    opts.nodeRepulsion = () => 80000;
    opts.idealEdgeLength = () => 120;
    opts.edgeElasticity = () => 100;
    opts.gravity = 0.25;
    opts.numIter = 1500;
    opts.animate = false;
  } else if (layoutName === 'concentric') {
    opts.concentric = (node: CyCollection) => node.data('degree');
    opts.levelWidth = () => 3;
    opts.minNodeSpacing = 40;
  } else if (layoutName === 'breadthfirst') {
    opts.directed = true;
    opts.spacingFactor = 1.2;
  }

  cy.layout(opts).run();

  // Re-apply highlight after layout
  setTimeout(
    () => {
      if (activeEntity) highlightGraphNode(activeEntity);
    },
    layoutName === 'cose' ? 100 : 600,
  );
}

function resetGraphView(): void {
  if (!cy) return;
  cy.fit(undefined, 40);
}

function toggleLabels(): void {
  if (!cy) return;
  labelsVisible = !labelsVisible;
  cy.style()
    .selector('node')
    .style('label', labelsVisible ? 'data(label)' : '')
    .update();
}

function setEdgeFilter(filter: EdgeFilter): void {
  edgeFilter = filter;
  document.querySelectorAll('.edge-filter-btn').forEach((btn) => btn.classList.remove('active'));
  (document.getElementById('ef' + filter.charAt(0).toUpperCase() + filter.slice(1)) as HTMLElement).classList.add('active');
  if (activeEntity) highlightGraphNode(activeEntity);
}

export function installSiviGraph(): void {
  cy = null;
  labelsVisible = true;
  edgeFilter = 'all';
  // These serve inline handlers in the markup (onclick="name(...)" and the like).
  exposeFunctions({
    changeLayout,
    resetGraphView,
    toggleLabels,
    setEdgeFilter,
  });
}

/** SIVI list and graph views, registered as the base views of the editor. */
import { installCustomDescriptions } from './custom-descriptions.ts';
import { installDatacat } from './datacat.ts';
import { registerView } from './registry.ts';
import { installSiviDetail, selectEntity } from './sivi-detail.ts';
import { highlightGraphNode, initGraph, installSiviGraph, isGraphCreated } from './sivi-graph.ts';
import { buildSidebar, hideAllPanels, installSiviList } from './sivi-list.ts';
import { installSiviOverview, renderEntityOverview } from './sivi-overview.ts';
import { activeEntity, installSiviState } from './sivi-state.ts';

/** Registers the 'list' and 'graph' views. */
function registerSiviViews(): void {
  registerView('list', {
    label: 'List',
    category: 'sivi',
    activate() {
      hideAllPanels();
      (document.getElementById('listView') as HTMLElement).style.display = 'block';
      buildSidebar();
      if (!activeEntity) {
        renderEntityOverview();
      }
    },
  });

  registerView('graph', {
    label: 'Graph',
    category: 'sivi',
    activate() {
      hideAllPanels();
      (document.getElementById('cy') as HTMLElement).classList.add('visible');
      (document.getElementById('graphLegend') as HTMLElement).classList.add('visible');
      (document.getElementById('graphControls') as HTMLElement).classList.add('visible');
      buildSidebar();
      if (!isGraphCreated()) initGraph(selectEntity);
      if (activeEntity) highlightGraphNode(activeEntity);
    },
  });
}

export function installSiviViewer(): void {
  installSiviState();
  installDatacat();
  installSiviGraph();
  installCustomDescriptions();
  installSiviOverview();
  installSiviDetail();
  installSiviList();
  registerSiviViews();
}

/**
 * View registry and API module registry.
 *
 * SIVI base views (list, graph, codelist) register here; API modules
 * register dynamically and add their own views, sidebar buttons and hooks.
 */

/** One entry of the sidebar view buttons. */
export interface ViewDef {
  /** Set when the view comes from an API module's `views` list. */
  id?: string;
  /** Button label in the sidebar. */
  label: string;
  /** 'sivi' or 'api'. */
  category: 'sivi' | 'api';
  /** Extra CSS class for the sidebar button. */
  btnClass?: string;
  /** Header the view's button is grouped under (API views). */
  group?: string | null;
  /** Accent colour of the view's button (API views). */
  color?: string;
  /** Called when the view becomes active. */
  activate?: () => void | Promise<void>;
  /** Called when the view is deactivated. */
  deactivate?: () => void;
  /** Filters the sidebar; called from the sidebar search box. */
  filter?: () => void;
}

/** Where a codelist is used: entity.attr of an API module. */
export interface CodelistUsage {
  entity: string;
  attr: string;
  sivi?: string | null;
}

export interface ApiModuleDef {
  /** Display name. */
  name: string;
  /** Header the module's views are grouped under. */
  group?: string | null;
  /** Views to register with the module. */
  views?: (ViewDef & { id: string })[];
  /** Returns where the codelist is used, for the codelist viewer's "used by" data. */
  codelistHook?: (codelistName: string) => CodelistUsage[];
  /** Returns the names of all codelists the module uses. */
  allCodelistsHook?: () => Iterable<string>;
}

/** viewId to view. */
export let views: Record<string, ViewDef>;
/** moduleId to module. */
export let apiModules: Record<string, ApiModuleDef>;
/** Active view id. */
export let currentView: string | null;

/** Registers a view that can be activated with `setView`. */
export function registerView(id: string, opts: ViewDef): void {
  views[id] = opts;
}

/** Registers an API module: its views, and sidebar buttons for them. */
export function registerApiModule(id: string, opts: ApiModuleDef): void {
  apiModules[id] = opts;
  // Register all views provided by this module
  if (opts.views) {
    opts.views.forEach((v) => registerView(v.id, v));
  }
  // Rebuild sidebar buttons to include the new module
  buildViewButtons();
  console.log(`Minerva: registered API module "${opts.name}"`);
}

/** Unregisters an API module and its views. */
export function unregisterApiModule(id: string): void {
  const mod = apiModules[id];
  if (!mod) return;
  if (mod.views) {
    mod.views.forEach((v) => {
      delete views[v.id];
    });
  }
  delete apiModules[id];
  buildViewButtons();
}

/** Switches to a registered view. */
export async function setView(viewId: string): Promise<void> {
  // Deactivate current view
  const active = currentView ? views[currentView] : undefined;
  if (currentView && active && active.deactivate) {
    active.deactivate();
  }
  currentView = viewId;

  // Update button active states
  applyViewButtonColors();

  // Activate new view
  const view = views[viewId];
  if (view && view.activate) {
    await view.activate();
  }

  // Update hash
  window.location.hash = viewId;
}

function viewButton(id: string, v: ViewDef): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'view-btn' + (currentView === id ? ' active' : '');
  btn.dataset.view = id;
  btn.textContent = v.label;
  btn.onclick = () => setView(id);
  return btn;
}

/** Rebuilds the sidebar view buttons: SIVI views first, then API views grouped by `group`. */
export function buildViewButtons(): void {
  const siviContainer = document.getElementById('siviViewButtons');
  const apiContainer = document.getElementById('apiViewButtons');
  const apiLabel = document.getElementById('apiCategoryLabel');
  if (!siviContainer || !apiContainer) return;

  // SIVI buttons
  siviContainer.innerHTML = '';
  Object.entries(views).forEach(([id, v]) => {
    if (v.category !== 'sivi') return;
    siviContainer.appendChild(viewButton(id, v));
  });

  // API buttons, grouped when group tags are present
  apiContainer.innerHTML = '';
  let hasApiViews = false;
  const apiViews = Object.entries(views).filter(([, v]) => v.category === 'api');
  if (apiViews.length) hasApiViews = true;

  // Collect groups in order of first appearance
  const groupOrder: string[] = [];
  const groupMap: Record<string, { id: string; v: ViewDef }[]> = {};
  const ungrouped: { id: string; v: ViewDef }[] = [];
  apiViews.forEach(([id, v]) => {
    const g = v.group || null;
    if (g) {
      let members = groupMap[g];
      if (!members) {
        members = [];
        groupMap[g] = members;
        groupOrder.push(g);
      }
      members.push({ id, v });
    } else {
      ungrouped.push({ id, v });
    }
  });

  // Render grouped APIs
  groupOrder.forEach((g) => {
    const hdr = document.createElement('div');
    hdr.className = 'view-group-header';
    hdr.textContent = g;
    apiContainer.appendChild(hdr);
    const row = document.createElement('div');
    row.className = 'view-toggle view-group-row';
    (groupMap[g] ?? []).forEach(({ id, v }) => {
      row.appendChild(viewButton(id, v));
    });
    apiContainer.appendChild(row);
  });

  // Render ungrouped APIs
  if (ungrouped.length) {
    if (groupOrder.length) {
      const hdr = document.createElement('div');
      hdr.className = 'view-group-header';
      hdr.textContent = 'Other';
      apiContainer.appendChild(hdr);
    }
    const row = document.createElement('div');
    row.className = 'view-toggle';
    ungrouped.forEach(({ id, v }) => {
      row.appendChild(viewButton(id, v));
    });
    apiContainer.appendChild(row);
  }

  // Show/hide the "APIs" label
  if (apiLabel) apiLabel.style.display = hasApiViews ? '' : 'none';

  // Apply colors
  applyViewButtonColors();
}

/**
 * Applies API-specific colours to the sidebar buttons.
 * Active: full background and border in the view's colour.
 * Inactive API: border in the view's colour, transparent background.
 */
export function applyViewButtonColors(): void {
  document.querySelectorAll<HTMLElement>('.view-btn').forEach((btn) => {
    const id = btn.dataset.view;
    const v = id === undefined ? undefined : views[id];
    if (!v) return;
    const isActive = currentView === id;
    btn.classList.toggle('active', isActive);

    // Reset inline styles
    btn.style.borderColor = '';
    btn.style.background = '';
    btn.style.color = '';
    btn.style.opacity = '';

    if (v.color && v.category === 'api') {
      if (isActive) {
        btn.style.borderColor = v.color;
        btn.style.background = v.color + '22';
        btn.style.color = v.color;
      } else {
        btn.style.borderColor = v.color + '44';
        btn.style.color = '#484f58';
      }
    }
  });
}

/** Where the codelist is used, collected from all registered API modules. */
export function getCodelistUsage(codelistName: string): (CodelistUsage & { module: string })[] {
  const results: (CodelistUsage & { module: string })[] = [];
  Object.entries(apiModules).forEach(([id, mod]) => {
    if (mod.codelistHook) {
      const usages = mod.codelistHook(codelistName);
      usages.forEach((u) => results.push({ ...u, module: id }));
    }
  });
  return results;
}

/** All codelist names used across all API modules. */
export function getAllUsedCodelists(): Set<string> {
  const all = new Set<string>();
  Object.values(apiModules).forEach((mod) => {
    if (mod.allCodelistsHook) {
      for (const name of mod.allCodelistsHook()) all.add(name);
    }
  });
  return all;
}

export function installRegistry(): void {
  views = {};
  apiModules = {};
  currentView = null;
}

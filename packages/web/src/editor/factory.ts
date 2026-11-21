/**
 * Editor API module factory: creates a standard API module registration from
 * minimal config. Each register call only needs to supply identity + data path.
 *
 * Usage:
 *   createApiModule('shop', {
 *       label:        'Shop',
 *       dataPath:     '/data/shop_model.json',
 *       fallbackColor:'#da3633'
 *   });
 *
 * Optional hooks object as third argument for per-API overrides:
 *   createApiModule('shop', { ... }, {
 *       afterActivate()  { ... },   // called after standard activation
 *       codelistHook(n)  { ... },   // replaces default codelist hook
 *   });
 */
import { showGeneralView } from './general.ts';
import { showApiGraph } from './graph.ts';
import type { ApiConfig } from './model-types.ts';
import { buildApiSidebar } from './sidebar.ts';
import { loadApiModel, state } from './state.ts';
import { renderEditorToolbar } from './toolbar.ts';
import { renderEntityDetail } from '../editors/entity-render.ts';
import { renderApiOperation } from '../operations/op-detail.ts';
import { renderApiExample } from '../operations/example-page.ts';
import { renderApiEnum } from '../editors/enum-render.ts';
import { initTruncationTooltip } from '../editors/truncation-tooltip.ts';
import { buildSiviPathSet, getSiviPathSet } from '../editors/sivi.ts';
import { loadDatacat, datacatEntities } from '../base/datacat.ts';
import { type ApiModuleDef, type CodelistUsage, applyViewButtonColors, registerApiModule, views } from '../base/registry.ts';
import { getModel } from '../base/model-state.ts';
import { hideAllPanels } from '../base/sivi-list.ts';

/** Identity and data path of an API module. */
export interface ApiModuleConfig {
  label?: string;
  dataPath: string;
  fallbackColor?: string;
  group?: string;
}

/** Per-API overrides. */
export interface ApiModuleHooks {
  afterActivate?(): void;
  afterDeactivate?(): void;
  codelistHook?: ApiModuleDef['codelistHook'];
  allCodelistsHook?: ApiModuleDef['allCodelistsHook'];
}

export function createApiModule(id: string, cfg: ApiModuleConfig, hooks?: ApiModuleHooks): void {
  const viewId = id + 'api';
  const name = cfg.label || id;
  const dataPath = cfg.dataPath;
  const fallbackColor = cfg.fallbackColor || '#8b949e';
  const group = cfg.group || null;
  const h = hooks || {};

  registerApiModule(id, {
    name: name,
    group: group,
    views: [
      {
        id: viewId,
        label: name,
        category: 'api',
        group: group,
        async activate() {
          hideAllPanels();

          state.apiConfig = {
            name: name,
            dataPath: dataPath,
          };
          const apiConfig = (): ApiConfig => state.apiConfig as ApiConfig;

          if (!state.apiModelLoaded || state.loadedModelPath !== apiConfig().dataPath) {
            state.apiActiveEntity = null;
            await loadApiModel(apiConfig().dataPath);
          }
          apiConfig().color = (getModel() && (getModel() as { color?: string }).color) || fallbackColor;
          (views[viewId] as { color?: string }).color = apiConfig().color;
          applyViewButtonColors();

          if (!datacatEntities) {
            await loadDatacat();
          }
          if (!getSiviPathSet()) {
            buildSiviPathSet();
          }

          renderEditorToolbar();
          initTruncationTooltip();
          const toolbar = document.getElementById('editorToolbar');
          if (toolbar) toolbar.style.display = '';
          buildApiSidebar();

          const active = state.apiActiveEntity;
          if (active) {
            (document.getElementById('listView') as HTMLElement).style.display = 'block';
            if (active.startsWith('enum:')) renderApiEnum(active.slice(5));
            else if (active.startsWith('ex:')) renderApiExample(active.slice(3));
            else if (active.startsWith('op:')) renderApiOperation(active.slice(3));
            else if (active === '__general__') showGeneralView();
            else renderEntityDetail(active);
          } else {
            showApiGraph();
          }

          if (h.afterActivate) h.afterActivate();
        },
        deactivate() {
          const toolbar = document.getElementById('editorToolbar');
          if (toolbar) toolbar.style.display = 'none';
          if (h.afterDeactivate) h.afterDeactivate();
        },
        filter() {
          const q = (document.getElementById('search') as HTMLInputElement).value.toLowerCase();
          document.querySelectorAll<HTMLElement>('.ca-entity-btn').forEach((btn) => {
            const entity = btn.dataset.entity || '';
            btn.style.display = entity.toLowerCase().includes(q) ? 'block' : 'none';
          });
        },
      },
    ],
    codelistHook:
      h.codelistHook ||
      ((codelistName) => {
        if (!state.apiModel) return [];
        const usages: CodelistUsage[] = [];
        Object.entries(state.apiModel).forEach(([entityName, e]) => {
          e.attrs.forEach((a) => {
            if (a.codelist === codelistName) {
              usages.push({ entity: entityName, attr: a.name, sivi: a.sivi });
            }
          });
        });
        return usages;
      }),
    allCodelistsHook:
      h.allCodelistsHook ||
      (() => {
        if (!state.apiModel) return [];
        const names = new Set<string>();
        Object.values(state.apiModel).forEach((e) => {
          e.attrs.forEach((a) => {
            if (a.codelist) names.add(a.codelist);
          });
        });
        return [...names];
      }),
  });
}

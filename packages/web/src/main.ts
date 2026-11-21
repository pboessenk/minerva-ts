/**
 * Entry point of the editor.
 *
 * Each part sets itself up in `install()`; the order below matters, because
 * a part may use what the parts before it set up. Parts reach each other
 * through imports; only the inline handlers in the markup go through globals
 * (see globals.ts). Nothing runs at import time, so import cycles are fine.
 */
import { install as installCore, initMinerva } from './base/core.ts';
import { installModelLoader } from './base/model-loader.ts';
import { installSiviViewer } from './base/sivi-viewer.ts';
import { installCodelistViewer } from './base/codelist-viewer.ts';

import { install as installStateShell } from './editor/state.ts';
import { install as installAttrEditor } from './editors/attr-editor.ts';
import { install as installAttrFilterShell } from './editor/attr-filter.ts';
import { install as installComparePageShell } from './editor/compare-page.ts';
import { install as installEntityEditor } from './editors/entity-editor.ts';
import { install as installEnumEditor } from './editors/enum-editor.ts';
import { install as installExampleCsv } from './operations/example-csv.ts';
import { install as installExampleForm } from './operations/example-form.ts';
import { install as installExportShell } from './editor/export.ts';
import { createApiModule } from './editor/factory.ts';
import { install as installGeneralShell } from './editor/general.ts';
import { install as installOpEditor } from './operations/op-editor.ts';
import { install as installSearchPageShell } from './editor/search-page.ts';
import { install as installSidebarShell } from './editor/sidebar.ts';
import { install as installToolbarShell } from './editor/toolbar.ts';
import { install as installGraphShell } from './editor/graph.ts';

import type { ApiModuleConfig } from './editor/factory.ts';
import { readBoot } from './boot.ts';

// Base: view registry, reference catalogue views.
installCore();
installModelLoader();
installSiviViewer();
installCodelistViewer();

// Editor: state first, graph last, the rest in name order.
installStateShell();
installAttrEditor();
installAttrFilterShell();
installComparePageShell();
installEntityEditor();
installEnumEditor();
installExampleCsv();
installExampleForm();
installExportShell();
installGeneralShell();
installOpEditor();
installSearchPageShell();
installSidebarShell();
installToolbarShell();
installGraphShell();

// One editor view per model of the workspace, then route to the address.
for (const model of readBoot().models) createApiModule(model.id, model.config as unknown as ApiModuleConfig);
initMinerva();

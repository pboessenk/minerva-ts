/**
 * Core of the editor: the view registry, the API module registry, the model
 * state manager and the shared helpers (toast, download, escapeHtml).
 *
 * API modules register dynamically and add their own views; the SIVI base
 * views (list, graph, codelist) register through the same registry.
 */
import { AFD_MODEL } from './afd-model.ts';
import { installModelState } from './model-state.ts';
import { installRegistry, setView, views } from './registry.ts';
import { selectEntity } from './sivi-detail.ts';

/** Routes from the address hash: a view, an entity deep link, or the list. */
export function initMinerva(): void {
  const hash = window.location.hash.slice(1);
  if (hash && views[hash]) {
    setView(hash);
  } else if (hash && AFD_MODEL[hash]) {
    // Entity deep-link
    setView('list');
    selectEntity(hash);
  } else {
    setView('list');
  }
}

export function install(): void {
  installRegistry();
  installModelState();
}

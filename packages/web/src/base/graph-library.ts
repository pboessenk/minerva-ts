/**
 * The graph library (cytoscape, with the dagre layout), bundled with the
 * editor at fixed versions instead of loaded from a CDN.
 */
import cytoscape from 'cytoscape';
import cytoscapeDagre from 'cytoscape-dagre';

cytoscape.use(cytoscapeDagre);

/** Creates a graph. Callers describe the part of the API they use with their own types. */
export function createGraph<Core>(options: object): Core {
  return cytoscape(options) as Core;
}

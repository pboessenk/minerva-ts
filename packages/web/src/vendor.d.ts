// The graph libraries ship no type declarations (cytoscape only from 3.31 on).
// The editor describes the part it uses itself (base/cytoscape-types.ts,
// editor/graph.ts); these declarations only make the imports known.

declare module 'cytoscape' {
  interface Cytoscape {
    (options: object): unknown;
    use(extension: unknown): void;
  }
  const cytoscape: Cytoscape;
  export default cytoscape;
}

declare module 'cytoscape-dagre' {
  const extension: unknown;
  export default extension;
}

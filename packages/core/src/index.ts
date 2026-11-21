/**
 * @minerva/core: the model, the reference catalogue and the rules shared by
 * every exporter. No I/O and no platform APIs: this package runs unchanged
 * in Node and in the browser.
 */
export * from './text/index.ts';
export * from './json/index.ts';
export * from './model/index.ts';
export * from './catalog/index.ts';
export * from './export/index.ts';
export {
  ContractDecodeError,
  NilSchemaError,
  buildDriftReport,
  parseOpenApiDocument,
  type CompareOptions,
  type DriftFinding,
  type DriftReport,
  type DriftStats,
  type OaDocument,
} from './compare/index.ts';
export {
  ManifestError,
  decodeManifest,
  discoverModel,
  emptyManifest,
  modelLabel,
  type Manifest,
  type ManifestExports,
  type ManifestModel,
} from './workspace/manifest.ts';

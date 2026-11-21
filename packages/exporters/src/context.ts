import type { CatalogLookups, ExportSettings, Model } from '@minerva/core';

/**
 * Everything an exporter may read. Exporters are pure functions of this
 * value: no clock, no globals, no access to the workspace. That is what
 * makes their output reproducible and lets the same code run in a server,
 * a CLI or a browser. (An exporter may load its own bundled assets, such as
 * a stylesheet, when its module is first imported.)
 */
export interface ExportContext {
  /** The model to export, already narrowed to the requested root entities. */
  readonly model: Model;
  /** Reference-catalogue lookups resolved for this model. */
  readonly lookups: CatalogLookups;
  readonly settings: ExportSettings;
  /** The moment of export, for formats that print one. */
  readonly now: Date;
}

export interface ExportResult {
  /** The document. Encoded as UTF-8 when sent or saved. */
  readonly body: string;
  readonly contentType: string;
  /** Suggested download name. */
  readonly filename: string;
}

/** Thrown by an exporter whose format has not been ported yet. The server answers 501. */
export class NotImplementedError extends Error {
  constructor(format: string) {
    super(`Format not available yet: ${format}`);
    this.name = 'NotImplementedError';
  }
}

/** The part of the cytoscape API the base views use. */
import { createGraph } from './graph-library.ts';

export interface CyStyleRule {
  selector: string;
  style: Record<string, string | number>;
}

export interface CyEventObject {
  /** The element that was hit, or the core itself for a tap on the background. */
  target: CyCollection | CyCore;
}

/** A set of elements; also stands for a single element. */
export interface CyCollection {
  id(): string;
  // biome-ignore lint/suspicious/noExplicitAny: element data is whatever the caller put in.
  data(key: string): any;
  style(name: string, value: string): void;
  addClass(classes: string): CyCollection;
  removeClass(classes: string): CyCollection;
  forEach(fn: (element: CyCollection) => void): void;
}

export interface CyStyleSheet {
  selector(selector: string): CyStyleSheet;
  style(name: string, value: string): CyStyleSheet;
  update(): void;
}

export interface CyCore {
  on(event: string, selector: string, handler: (evt: CyEventObject) => void): void;
  on(event: string, handler: (evt: CyEventObject) => void): void;
  elements(): CyCollection;
  edges(): CyCollection;
  getElementById(id: string): CyCollection;
  animate(options: { center: { eles: CyCollection }; duration: number }): void;
  layout(options: Record<string, unknown>): { run(): void };
  fit(eles: undefined, padding: number): void;
  style(): CyStyleSheet;
  resize(): void;
}

export interface CytoscapeOptions {
  container: HTMLElement | null;
  elements: { nodes: unknown[]; edges: unknown[] };
  style: CyStyleRule[];
  layout: Record<string, unknown>;
  wheelSensitivity: number;
  minZoom: number;
  maxZoom: number;
}

export function createCytoscape(options: CytoscapeOptions): CyCore {
  return createGraph<CyCore>(options);
}

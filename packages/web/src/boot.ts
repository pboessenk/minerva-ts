/**
 * What the server tells the page at load: the models of the workspace. It is
 * embedded in the page as JSON (`<script type="application/json"
 * id="minerva-boot">`), so it is there before any script runs and costs no
 * request.
 */
export interface BootModel {
  id: string;
  /** Options for the model's editor view: label, dataPath, and optionally fallbackColor and group. */
  config: Record<string, string>;
}

export interface Boot {
  /** In sidebar order. */
  models: BootModel[];
}

export function readBoot(): Boot {
  const element = document.getElementById('minerva-boot');
  if (element === null) return { models: [] };
  return JSON.parse(element.textContent ?? '{}') as Boot;
}

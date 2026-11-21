/**
 * The one place where the editor still uses the global (window) scope.
 *
 * Modules reach each other through ES imports. The markup is the exception:
 * it contains inline handlers (`onclick="editorSave()"`, `onchange="..."`,
 * `oninput="..."`), and those look their names up on `window`. A module
 * that renders such markup calls
 *
 * - `exposeFunctions({ editorSave, ... })` for the functions its handlers call;
 * - `exposeState(name, get, set)` for a variable its handlers read or assign
 *   (only the active codelist and entity type of the codelist viewer).
 *
 * The handler attributes are kept as they are so the rendered DOM stays
 * identical. Nothing else may be exposed: other code imports what it needs.
 */
type AnyFunction = (...args: never[]) => unknown;

export function exposeFunctions(functions: Record<string, AnyFunction>): void {
  Object.assign(window, functions);
}

export function exposeState<T>(name: string, get: () => T, set: (value: T) => void): void {
  Object.defineProperty(window, name, { get, set, configurable: true, enumerable: true });
}

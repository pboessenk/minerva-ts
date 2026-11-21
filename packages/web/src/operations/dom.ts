/** Query that must match: the dialog markup is built right before, so a miss is a bug. */
export function must<T extends Element>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error('Missing element: ' + selector);
  return found;
}

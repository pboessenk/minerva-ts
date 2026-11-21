/**
 * String ordering used for every sorted list in exports and validation.
 *
 * Order is by Unicode code point (equivalently: by UTF-8 bytes). It is never
 * locale-aware. JavaScript's default sort compares UTF-16 code units, which
 * puts astral characters (stored as surrogates, 0xD800-0xDFFF) before
 * U+E000-U+FFFF; this comparator corrects that one case.
 */
export function compareStrings(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a.charCodeAt(i);
    const y = b.charCodeAt(i);
    if (x === y) continue;
    const xAstral = x >= 0xd800 && x <= 0xdfff;
    const yAstral = y >= 0xd800 && y <= 0xdfff;
    if (xAstral !== yAstral) return xAstral ? 1 : -1;
    return x - y;
  }
  return a.length - b.length;
}

/** Returns a new array sorted with {@link compareStrings}. */
export function sortStrings(values: Iterable<string>): string[] {
  return [...values].sort(compareStrings);
}

/** The keys of a map or record in {@link compareStrings} order. */
export function sortedKeys(source: ReadonlyMap<string, unknown> | Readonly<Record<string, unknown>>): string[] {
  return sortStrings(source instanceof Map ? source.keys() : Object.keys(source));
}

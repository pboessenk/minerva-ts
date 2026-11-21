/**
 * Conversions between the three spellings of an enum value: its PascalCase
 * name, its snake_case wire value and its spaced label.
 */

/** Convert PascalCase to snake_case: "OrderHandler" → "order_handler" */
export function _toSnakeCase(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

/** Split PascalCase into spaced words: "OrderHandler" → "Order handler" */
export function _splitPascal(s: string): string {
  const spaced = s.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

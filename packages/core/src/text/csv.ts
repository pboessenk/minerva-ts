/**
 * CSV writing (RFC 4180 with LF line endings).
 *
 * A field is quoted when it is the two characters `\.`, contains a comma,
 * quote, carriage return or newline, or starts with white space. An empty
 * field is never quoted, so a record holding one empty field is a blank line.
 */

function needsQuotes(field: string): boolean {
  if (field === '') return false;
  if (field === '\\.') return true;
  if (/[,"\r\n]/.test(field)) return true;
  // Leading white space: space, or any Unicode space character.
  return /^[\s\u{85}]/u.test(field) && !field.startsWith('\u{feff}');
}

function quoteField(field: string): string {
  return '"' + field.replaceAll('"', '""') + '"';
}

export function csvRecord(fields: readonly string[]): string {
  return fields.map((f) => (needsQuotes(f) ? quoteField(f) : f)).join(',') + '\n';
}

export function csvEncode(records: readonly (readonly string[])[]): string {
  return records.map(csvRecord).join('');
}

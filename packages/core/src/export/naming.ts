import type { EnumValue } from '../model/types.ts';
import { toLower, toUpper } from '../text/case.ts';
import { fieldsFunc } from '../text/strings.ts';
import { sliceBytes } from '../text/utf8.ts';

const isAsciiUpper = (ch: string): boolean => ch >= 'A' && ch <= 'Z';
const isAsciiLower = (ch: string): boolean => ch >= 'a' && ch <= 'z';

/**
 * Converts `order_handler`, `Order handler` or `roadVehicle` to PascalCase
 * (`OrderHandler`, `RoadVehicle`).
 *
 * Words are split at spaces, underscores, hyphens and lower-to-upper camel
 * boundaries (ASCII letters only). Each word gets its first *byte*
 * upper-cased and the rest lower-cased; see `text/utf8.ts` for what that
 * means for a word starting with a non-ASCII letter.
 */
export function toPascalCase(s: string): string {
  let expanded = '';
  let previous = '';
  for (const ch of s) {
    if (isAsciiUpper(ch) && isAsciiLower(previous)) expanded += ' ';
    expanded += ch;
    previous = ch;
  }
  const words = fieldsFunc(expanded, (ch) => ch === ' ' || ch === '_' || ch === '-');
  const out = words.map((w) => toUpper(sliceBytes(w, 0, 1)) + toLower(sliceBytes(w, 1))).join('');
  return out === '' ? s : out;
}

/** The code-safe identifier of an enum value: its name, else derived from the label, else from the value. */
export function enumIdent(v: EnumValue): string {
  if (v.name !== '') return v.name;
  return toPascalCase(v.label !== '' ? v.label : v.value);
}

/** Schema name of one subtype of a discriminated entity, e.g. `PartyPrivatePerson`. */
export function subtypeSchemaName(entityName: string, subtype: string): string {
  return entityName + toPascalCase(subtype);
}

/** Schema name for the attributes shared by all subtypes of an entity. */
export function baseSchemaName(entityName: string): string {
  return entityName + 'Base';
}

export function baseSchemaDescription(entityName: string): string {
  return `Shared attributes of all ${entityName} subtypes.`;
}

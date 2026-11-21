import { JsonDecoder, enumIdent, stripInternalKeys, toLower, trimSpace, trimSuffix, type Model } from '@minerva/core';

/**
 * Example payloads as TypeScript object literals.
 *
 * The payload is walked token by token so key order and number spelling
 * survive. Values are typed by the model: a string under an enum-typed
 * attribute becomes a member reference (`Status.Open`), a string under a
 * number or boolean attribute is written bare. Keys and other strings are
 * written between double quotes exactly as they are, without escaping.
 */

export interface LiteralTypes {
  /** Entity name -> attribute name -> attribute type. A later attribute of the same name wins. */
  readonly attributes: ReadonlyMap<string, ReadonlyMap<string, string>>;
  /** Enum name -> wire value -> member identifier. A later value with the same text wins. */
  readonly enumMembers: ReadonlyMap<string, ReadonlyMap<string, string>>;
}

/** The type lookups `formatExampleLiteral` needs, built once per model. */
export function literalTypes(model: Model): LiteralTypes {
  const attributes = new Map<string, Map<string, string>>();
  for (const [name, entity] of model.entities) {
    const types = new Map<string, string>();
    for (const section of entity.sections) {
      for (const a of section.attributes) types.set(a.name, a.type);
    }
    attributes.set(name, types);
  }
  const enumMembers = new Map<string, Map<string, string>>();
  for (const [name, enumeration] of model.enums) {
    const members = new Map<string, string>();
    for (const v of enumeration.values) members.set(v.value, enumIdent(v));
    enumMembers.set(name, members);
  }
  return { attributes, enumMembers };
}

/**
 * Formats an example payload declared as `rootType` (an entity name,
 * possibly followed by `[]`) as a TypeScript literal, indented two spaces
 * per level.
 */
export function formatExampleLiteral(raw: string, rootType: string, types: LiteralTypes): string {
  const stripped = stripInternalKeys(raw);
  const rootEntity = trimSuffix(rootType, '[]');
  // The elements of a top-level array are of the root entity.
  const attributeType = trimSpace(stripped).startsWith('[') ? rootEntity + '[]' : '';
  return writeValue(new JsonDecoder(stripped), rootEntity, attributeType, types, 0) ?? '';
}

/**
 * Writes the next value of `dec`, or returns `undefined` when there is none.
 * Payloads come from a decoded model and are valid JSON; on anything else the
 * output simply stops early.
 *
 * @param entityName The entity whose attributes are the keys of an object value.
 * @param attributeType The declared type of the value, which types scalars and array elements.
 */
function writeValue(dec: JsonDecoder, entityName: string, attributeType: string, types: LiteralTypes, depth: number): string | undefined {
  const token = dec.token();
  if (token === undefined) return undefined;
  switch (token.kind) {
    case 'delim':
      if (token.value === '{') return writeObject(dec, entityName, types, depth);
      if (token.value === '[') return writeArray(dec, trimSuffix(attributeType, '[]'), types, depth);
      return undefined;
    case 'string':
      return writeString(token.value, attributeType, types);
    case 'number':
      return token.text;
    case 'boolean':
      return token.value ? 'true' : 'false';
    case 'null':
      return 'null';
  }
}

function writeObject(dec: JsonDecoder, entityName: string, types: LiteralTypes, depth: number): string {
  const members: string[] = [];
  while (dec.more()) {
    const key = dec.token();
    if (key === undefined || key.kind !== 'string') break;
    // The value's entity is the attribute's type without the array suffix.
    const childType = types.attributes.get(entityName)?.get(key.value) ?? '';
    const value = writeValue(dec, trimSuffix(childType, '[]'), childType, types, depth + 1);
    if (value === undefined) break;
    members.push(`"${key.value}": ${value}`);
  }
  dec.token(); // the closing brace
  return container('{', members, '}', depth);
}

function writeArray(dec: JsonDecoder, elementType: string, types: LiteralTypes, depth: number): string {
  const items: string[] = [];
  while (dec.more()) {
    const value = writeValue(dec, elementType, elementType, types, depth + 1);
    if (value === undefined) break;
    items.push(value);
  }
  dec.token(); // the closing bracket
  return container('[', items, ']', depth);
}

/** One item per line. An empty container still spans two lines: `{\n}`. */
function container(open: string, items: readonly string[], close: string, depth: number): string {
  if (items.length === 0) return `${open}\n${close}`;
  const childIndent = '  '.repeat(depth + 1);
  const lines = items.map((item) => childIndent + item).join(',\n');
  return `${open}\n${lines}\n${'  '.repeat(depth)}${close}`;
}

function writeString(value: string, attributeType: string, types: LiteralTypes): string {
  const baseType = trimSuffix(attributeType, '[]');
  const member = types.enumMembers.get(baseType)?.get(value);
  if (member !== undefined) return `${baseType}.${member}`;
  switch (toLower(baseType)) {
    case 'number':
    case 'integer':
    case 'int':
      return value;
    case 'boolean':
      return toLower(value);
    default:
      return `"${value}"`;
  }
}

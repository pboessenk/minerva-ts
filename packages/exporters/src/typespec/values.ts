import {
  DISCRIMINATOR,
  JsonDecoder,
  allowedTypeName,
  attributesForSubtype,
  enumIdent,
  equalFold,
  hasNamedType,
  stripInternalKeys,
  subtypeSchemaName,
  subtypesOf,
  toLower,
  trimSpace,
  trimSuffix,
  type Attribute,
  type Model,
} from '@minerva/core';
import { escapeValue } from './text.ts';

/**
 * Example payloads as TypeSpec value literals: `#{...}` for objects with
 * unquoted keys, `#[...]` for arrays, `Enum.Member` for enum values and
 * `plainDate.fromISO(...)` for dates, so that `@opExample` values
 * type-check against the operation signature.
 *
 * Values are typed by walking the model alongside the payload. An object
 * whose type is a discriminated entity is typed as the subtype named by its
 * `entityType` member, and members that subtype does not declare are left
 * out (the checker would reject them).
 */
export class ExampleFormatter {
  /** Entity or subtype schema name -> attribute name -> type. */
  readonly #attributeTypes = new Map<string, Map<string, string>>();
  readonly #discriminated = new Set<string>();
  /** Enum name -> value -> member identifier. */
  readonly #enumMembers = new Map<string, Map<string, string>>();

  constructor(model: Model) {
    for (const [entityName, entity] of model.entities) {
      const types = new Map<string, string>();
      for (const section of entity.sections) {
        for (const a of section.attributes) types.set(a.name, valueType(model, entityName, a));
      }
      this.#attributeTypes.set(entityName, types);

      const subtypes = subtypesOf(entity);
      if (subtypes === null) continue;
      this.#discriminated.add(entityName);
      for (const subtype of subtypes) {
        const subtypeTypes = new Map<string, string>();
        for (const a of attributesForSubtype(entity, subtype)) subtypeTypes.set(a.name, valueType(model, entityName, a));
        this.#attributeTypes.set(subtypeSchemaName(entityName, subtype), subtypeTypes);
      }
    }
    for (const [enumName, enumeration] of model.enums) {
      const members = new Map<string, string>();
      for (const v of enumeration.values) members.set(v.value, enumIdent(v));
      this.#enumMembers.set(enumName, members);
    }
  }

  /**
   * Formats a JSON payload whose type is `rootEntity` (or an array of it).
   * Nested lines are indented as if the literal sat at `depth`.
   */
  format(raw: string, rootEntity: string, depth: number): string {
    const stripped = stripInternalKeys(raw);
    const entityName = trimSuffix(rootEntity, '[]');
    // A top-level array is typed by its elements.
    const type = trimSpace(stripped).startsWith('[') ? entityName + '[]' : '';
    return this.#value(new JsonDecoder(stripped), entityName, type, depth) ?? '';
  }

  /** The next value of `dec`, or `undefined` when the payload ends or is malformed. */
  #value(dec: JsonDecoder, entityName: string, type: string, depth: number): string | undefined {
    const token = dec.token();
    if (token === undefined) return undefined;
    switch (token.kind) {
      case 'delim':
        if (token.value === '{') {
          return this.#discriminated.has(entityName)
            ? this.#discriminatedObject(dec, entityName, depth)
            : this.#object(dec, entityName, depth);
        }
        if (token.value === '[') return this.#array(dec, trimSuffix(type, '[]'), depth);
        return '';
      case 'string':
        return this.#string(token.value, type);
      case 'number':
        return token.text;
      case 'boolean':
        return token.value ? 'true' : 'false';
      case 'null':
        return 'null';
    }
  }

  #object(dec: JsonDecoder, entityName: string, depth: number): string {
    const types = this.#attributeTypes.get(entityName);
    const members: string[] = [];
    while (dec.more()) {
      const key = dec.token();
      if (key === undefined || key.kind !== 'string') break;
      const value = this.#member(dec, key.value, types, depth);
      if (value === undefined) break;
      members.push(value);
    }
    dec.token(); // }
    return '#{\n' + block(members, depth) + '}';
  }

  #array(dec: JsonDecoder, elementType: string, depth: number): string {
    const items: string[] = [];
    while (dec.more()) {
      const value = this.#value(dec, elementType, elementType, depth + 1);
      if (value === undefined) break;
      items.push(indent(depth + 1) + value);
    }
    dec.token(); // ]
    return '#[\n' + block(items, depth) + ']';
  }

  /**
   * An object typed as a discriminated entity. The members are read first so
   * that `entityType` can select the subtype wherever it appears; when it
   * names no known subtype the entity's own attributes apply.
   */
  #discriminatedObject(dec: JsonDecoder, entityName: string, depth: number): string {
    const members: Array<{ key: string; raw: string }> = [];
    while (dec.more()) {
      const key = dec.token();
      if (key === undefined || key.kind !== 'string') break;
      const raw = dec.raw();
      if (raw === undefined) break;
      members.push({ key: key.value, raw });
    }
    dec.token(); // }

    let resolved = entityName;
    const discriminator = members.find((m) => m.key === DISCRIMINATOR);
    if (discriminator !== undefined) {
      const subtype = stringValue(discriminator.raw);
      if (subtype !== undefined && subtype !== '' && this.#attributeTypes.has(subtypeSchemaName(entityName, subtype))) {
        resolved = subtypeSchemaName(entityName, subtype);
      }
    }

    const types = this.#attributeTypes.get(resolved);
    const out: string[] = [];
    for (const { key, raw } of members) {
      if (types !== undefined && !types.has(key)) continue;
      out.push(this.#member(new JsonDecoder(raw), key, types, depth) ?? `${indent(depth + 1)}${key}: `);
    }
    return '#{\n' + block(out, depth) + '}';
  }

  /** One `key: value` line of an object at `depth`, typed by the object's attribute types. */
  #member(dec: JsonDecoder, key: string, types: ReadonlyMap<string, string> | undefined, depth: number): string | undefined {
    const type = types?.get(key) ?? '';
    const value = this.#value(dec, trimSuffix(type, '[]'), type, depth + 1);
    return value === undefined ? undefined : `${indent(depth + 1)}${key}: ${value}`;
  }

  #string(value: string, type: string): string {
    const baseType = trimSuffix(type, '[]');
    const member = this.#enumMembers.get(baseType)?.get(value);
    if (member !== undefined) return `${baseType}.${member}`;
    if (equalFold(baseType, 'date')) return `plainDate.fromISO("${value}")`;
    const lower = toLower(baseType);
    if (lower === 'number' || lower === 'integer' || lower === 'int') return value;
    return `"${escapeValue(value)}"`;
  }
}

/**
 * The type an example value of attribute `a` is checked against. An
 * attribute with a named type is typed by that name: named types are unions
 * of string literals, not enums, so their values stay plain strings.
 */
function valueType(model: Model, entityName: string, a: Attribute): string {
  if (!hasNamedType(a)) return a.type;
  const named = allowedTypeName(entityName, a, model);
  return a.type.endsWith('[]') ? named + '[]' : named;
}

function indent(depth: number): string {
  return '  '.repeat(depth);
}

/** The lines of an object or array body; the closing bracket goes on its own line at `depth`. */
function block(lines: readonly string[], depth: number): string {
  return lines.length === 0 ? '' : lines.join(',\n') + '\n' + indent(depth);
}

/** The value of a JSON string literal, or `undefined` for any other value. */
function stringValue(raw: string): string | undefined {
  const token = new JsonDecoder(raw).token();
  return token?.kind === 'string' ? token.value : undefined;
}

import {
  baseSchemaName,
  constraintScope,
  formatFloat,
  hasNamedType,
  replaceAll,
  subtypesOf,
  toLower,
  toPascalCase,
  trimSpace,
  trimSuffix,
  type Attribute,
  type Entity,
  type Model,
} from '@minerva/core';
import { escapePattern, escapeValue } from './text.ts';

/** TypeSpec type of a model type: primitives mapped, everything else (entities, enums) as written. */
function typeSpecType(type: string): string {
  if (type.endsWith('[]')) return typeSpecType(trimSuffix(type, '[]')) + '[]';
  // Single-quoted literal types become double-quoted, as TypeSpec requires.
  const t = type.includes("'") ? replaceAll(type, "'", '"') : type;
  switch (toLower(t)) {
    case 'string':
      return 'string';
    case 'boolean':
      return 'boolean';
    case 'number':
      return 'float64';
    case 'integer':
    case 'int':
      return 'int32';
    case 'date':
      return 'plainDate';
  }
  return t;
}

/**
 * The TypeSpec type of an attribute, before named types and element scalars
 * are substituted, plus the value for a `@format` decorator (empty for none).
 * Most formats select a dedicated scalar; the rest stay a string with
 * `@format`.
 */
export function attributeType(a: Attribute): { type: string; format: string } {
  switch (a.format) {
    case 'int64':
      return { type: 'int64', format: '' };
    case 'float':
      return { type: 'float32', format: '' };
    case 'double':
      return { type: 'float64', format: '' };
    case 'date-time':
      return { type: 'utcDateTime', format: '' };
    case 'date':
      return { type: 'plainDate', format: '' };
    case 'uri':
      return { type: 'url', format: '' };
    case 'byte':
    case 'email':
    case 'uuid':
    case 'password':
      return { type: typeSpecType(a.type), format: a.format };
  }
  return { type: typeSpecType(a.type), format: '' };
}

/** True for the scalars that take `@minValue` and friends and numeric defaults. */
function isNumeric(type: string): boolean {
  return type === 'int32' || type === 'int64' || type === 'float32' || type === 'float64';
}

/**
 * The pattern, length and value-bound decorators for a value of TypeSpec
 * type `type`: the property type of a scalar attribute, or the element type
 * of a primitive array. String bounds apply to plain `string` only, so a
 * string retyped by its format (`plainDate`, `utcDateTime`, `url`) loses them.
 */
export function valueDecorators(a: Attribute, type: string): string[] {
  const scope = constraintScope(a);
  const out: string[] = [];
  if (scope.string && type === 'string') {
    if (a.pattern !== '') out.push(`@pattern("${escapePattern(a.pattern)}")`);
    if (a.minLength !== null) out.push(`@minLength(${a.minLength})`);
    if (a.maxLength !== null) out.push(`@maxLength(${a.maxLength})`);
  }
  if (scope.numeric && isNumeric(type)) {
    if (a.minimum !== null) out.push(`@minValue(${formatFloat(a.minimum)})`);
    if (a.exclusiveMinimum !== null) out.push(`@minValueExclusive(${formatFloat(a.exclusiveMinimum)})`);
    if (a.maximum !== null) out.push(`@maxValue(${formatFloat(a.maximum)})`);
    if (a.exclusiveMaximum !== null) out.push(`@maxValueExclusive(${formatFloat(a.exclusiveMaximum)})`);
  }
  return out;
}

/**
 * The attribute's default as a literal of the property's final type, or an
 * empty string when there is none or it cannot be written as a plain literal
 * (dates, urls, enums, entities, named types, arrays, required properties).
 */
export function defaultLiteral(a: Attribute, type: string): string {
  const value = trimSpace(a.default);
  if (!constraintScope(a).default || value === '') return '';
  if (type === 'string') return `"${escapeValue(value)}"`;
  if (type === 'boolean') return toLower(value);
  if (isNumeric(type)) return value;
  return '';
}

/**
 * A declared scalar carrying the element constraints of a primitive array.
 *
 * TypeSpec cannot decorate the element type of an array property, so a
 * `string[]` with element bounds is exported as a decorated
 * `scalar <Entity><Attribute> extends string;` and the property is typed
 * `<Entity><Attribute>[]`. The OpenAPI emitter turns the scalar into a
 * component schema referenced from `items`.
 */
export interface ElementScalar {
  name: string;
  /** The element type it extends: `string`, `int32`, `float64`, ... */
  base: string;
  decorators: string[];
}

export interface ElementScalars {
  /** In entity order. */
  declarations: ElementScalar[];
  /** {@link elementKey} -> scalar name. */
  byAttribute: Map<string, string>;
}

/** Identifies an attribute for the element-scalar lookup. */
export function elementKey(entityName: string, a: Attribute): string {
  return `${entityName}.${a.name}`;
}

/**
 * The element scalars of all constrained primitive arrays.
 *
 * A scalar is named `<Entity><Attribute>`. When that name is already used by
 * another emitted type (an entity, subtype, base model, enum, union or an
 * earlier scalar) `Item` is appended, then a counter. An attribute name that
 * occurs twice in one entity gets one scalar, from its first occurrence.
 */
export function collectElementScalars(model: Model, entityOrder: readonly string[], taken: ReadonlySet<string>): ElementScalars {
  const used = new Set(taken);
  for (const entityName of entityOrder) {
    if (subtypesOf(model.entities.get(entityName) as Entity) !== null) used.add(baseSchemaName(entityName));
  }
  const declarations: ElementScalar[] = [];
  const byAttribute = new Map<string, string>();
  for (const entityName of entityOrder) {
    for (const section of (model.entities.get(entityName) as Entity).sections) {
      for (const a of section.attributes) {
        const key = elementKey(entityName, a);
        if (byAttribute.has(key) || hasNamedType(a)) continue;
        const { type } = attributeType(a);
        if (!type.endsWith('[]')) continue;
        const base = trimSuffix(type, '[]');
        const decorators = valueDecorators(a, base);
        if (decorators.length === 0) continue;
        const stem = entityName + toPascalCase(a.name);
        let name = stem;
        for (let i = 1; used.has(name); i++) name = stem + 'Item' + (i > 1 ? String(i) : '');
        used.add(name);
        byAttribute.set(key, name);
        declarations.push({ name, base, decorators });
      }
    }
  }
  return { declarations, byAttribute };
}

import { toLower } from '../text/case.ts';
import { sortedKeys } from '../text/compare.ts';
import { quote } from '../text/escape.ts';
import { formatFloat, parseFloatText, parseIntText } from '../text/number.ts';
import { runeCount, trimSpace } from '../text/strings.ts';
import { attributeBase, constraintScope, isIntegerBase, isNumericBase } from './constraints.ts';
import type { Attribute, Model } from './types.ts';

/**
 * Save-time validation.
 *
 * A model is refused when its validation constraints could not be exported
 * faithfully (or TypeSpec would reject them). The editor enforces the same
 * rules in its constraints popup; this guards hand edits and stale tabs.
 *
 * Patterns are deliberately not compiled here: they are ECMA-262 expressions
 * and the editor already checks them with the browser's `RegExp`.
 */

/**
 * One message per problem, entities in name order, or an empty array when
 * the model is consistent.
 */
export function validateModel(model: Model): string[] {
  const errors: string[] = [];
  for (const name of sortedKeys(model.entities)) {
    for (const section of model.entities.get(name)?.sections ?? []) {
      for (const a of section.attributes) {
        for (const message of validateAttributeConstraints(a)) {
          errors.push(`${name}.${a.name}: ${message}`);
        }
      }
    }
  }
  return errors;
}

export function validateAttributeConstraints(a: Attribute): string[] {
  const errors: string[] = [];
  const scope = constraintScope(a);
  const { base } = attributeBase(a.type);
  const hasDefault = trimSpace(a.default) !== '';

  // Applicability: a keyword left on a type that cannot carry it would be
  // dropped silently by every exporter, so refuse it instead.
  if (!scope.string && (a.minLength !== null || a.maxLength !== null)) {
    errors.push('minLength/maxLength only apply to plain string attributes');
  }
  if (!scope.numeric && (a.minimum !== null || a.maximum !== null || a.exclusiveMinimum !== null || a.exclusiveMaximum !== null)) {
    errors.push('minimum/maximum bounds only apply to number and integer attributes');
  }
  if (!scope.array && (a.minItems !== null || a.maxItems !== null)) {
    errors.push('minItems/maxItems only apply to array attributes');
  }
  if (!scope.default && hasDefault) {
    errors.push('default only applies to optional string, number, integer and boolean attributes');
  }

  if (scope.string) errors.push(...checkCountPair('minLength', a.minLength, 'maxLength', a.maxLength));
  if (scope.array) errors.push(...checkCountPair('minItems', a.minItems, 'maxItems', a.maxItems));
  if (scope.numeric) errors.push(...checkBounds(a, isIntegerBase(base)));
  if (scope.default && hasDefault) errors.push(...checkDefault(a, base));
  return errors;
}

/** A non-negative, ordered min/max pair of counts. */
function checkCountPair(minKey: string, min: number | null, maxKey: string, max: number | null): string[] {
  const errors: string[] = [];
  if (min !== null && min < 0) errors.push(`${minKey} must be >= 0`);
  if (max !== null && max < 0) errors.push(`${maxKey} must be >= 0`);
  if (min !== null && max !== null && min > max) errors.push(`${minKey} (${min}) exceeds ${maxKey} (${max})`);
  return errors;
}

/**
 * Numeric bounds: at most one of each inclusive/exclusive pair, a non-empty
 * range, and whole numbers on integer attributes.
 */
function checkBounds(a: Attribute, integral: boolean): string[] {
  const errors: string[] = [];
  if (a.minimum !== null && a.exclusiveMinimum !== null) {
    errors.push('minimum and exclusiveMinimum are mutually exclusive');
  }
  if (a.maximum !== null && a.exclusiveMaximum !== null) {
    errors.push('maximum and exclusiveMaximum are mutually exclusive');
  }
  const low = a.exclusiveMinimum ?? a.minimum;
  const high = a.exclusiveMaximum ?? a.maximum;
  const exclusive = a.exclusiveMinimum !== null || a.exclusiveMaximum !== null;
  if (low !== null && high !== null) {
    if (exclusive && low >= high) {
      errors.push(`lower bound ${formatFloat(low)} must be below upper bound ${formatFloat(high)} when a bound is exclusive`);
    } else if (low > high) {
      errors.push(`lower bound ${formatFloat(low)} exceeds upper bound ${formatFloat(high)}`);
    }
  }
  if (integral) {
    const bounds: [string, number | null][] = [
      ['minimum', a.minimum],
      ['exclusiveMinimum', a.exclusiveMinimum],
      ['maximum', a.maximum],
      ['exclusiveMaximum', a.exclusiveMaximum],
    ];
    for (const [key, value] of bounds) {
      if (value !== null && Math.trunc(value) !== value) {
        errors.push(`${key} must be an integer on ${a.type} attributes`);
      }
    }
  }
  return errors;
}

/** The default must parse as the attribute's type and satisfy its own constraints. */
function checkDefault(a: Attribute, base: string): string[] {
  const value = trimSpace(a.default);
  if (isIntegerBase(base)) {
    const parsed = parseIntText(value);
    if (parsed === null) return [`default ${quote(value)} is not an integer`];
    return checkDefaultInRange(a, Number(parsed));
  }
  if (isNumericBase(base)) {
    const parsed = parseFloatText(value);
    if (parsed === null || !Number.isFinite(parsed)) return [`default ${quote(value)} is not a number`];
    return checkDefaultInRange(a, parsed);
  }
  if (base === 'boolean') {
    const lower = toLower(value);
    return lower === 'true' || lower === 'false' ? [] : [`default ${quote(value)} must be true or false`];
  }
  const errors: string[] = [];
  const length = runeCount(value);
  if (a.minLength !== null && length < a.minLength) {
    errors.push(`default ${quote(value)} is shorter than minLength ${a.minLength}`);
  }
  if (a.maxLength !== null && length > a.maxLength) {
    errors.push(`default ${quote(value)} is longer than maxLength ${a.maxLength}`);
  }
  return errors;
}

function checkDefaultInRange(a: Attribute, value: number): string[] {
  const errors: string[] = [];
  const shown = formatFloat(value);
  if (a.minimum !== null && value < a.minimum) {
    errors.push(`default ${shown} is below minimum ${formatFloat(a.minimum)}`);
  }
  if (a.exclusiveMinimum !== null && value <= a.exclusiveMinimum) {
    errors.push(`default ${shown} is not above exclusiveMinimum ${formatFloat(a.exclusiveMinimum)}`);
  }
  if (a.maximum !== null && value > a.maximum) {
    errors.push(`default ${shown} is above maximum ${formatFloat(a.maximum)}`);
  }
  if (a.exclusiveMaximum !== null && value >= a.exclusiveMaximum) {
    errors.push(`default ${shown} is not below exclusiveMaximum ${formatFloat(a.exclusiveMaximum)}`);
  }
  return errors;
}

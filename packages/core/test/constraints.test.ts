import { describe, expect, it } from 'vitest';
import {
  type ConstraintSubject,
  applicableConstraints,
  constraintScope,
  constraintSummary,
  constraintSummaryParts,
  validateAttributeConstraints,
} from '../src/model/index.ts';

describe('constraint rules', () => {
  it('gives each type its families, in display order', () => {
    expect(applicableConstraints({ type: 'string' })).toEqual(['minLength', 'maxLength', 'pattern', 'default']);
    expect(applicableConstraints({ type: 'integer', required: true })).toEqual([
      'minimum',
      'exclusiveMinimum',
      'maximum',
      'exclusiveMaximum',
    ]);
    expect(applicableConstraints({ type: 'boolean' })).toEqual(['default']);
    expect(applicableConstraints({ type: 'string[]' })).toEqual(['minLength', 'maxLength', 'pattern', 'minItems', 'maxItems']);
    expect(applicableConstraints({ type: 'Pet' })).toEqual([]);
  });

  it('treats a codelist or a value subset as a named type', () => {
    expect(constraintScope({ type: 'string', siviCodelist: 'COLOUR' })).toEqual({
      string: false,
      numeric: false,
      array: false,
      default: false,
    });
    expect(constraintScope({ type: 'string', siviCodelist: '' }).string).toBe(false);
    expect(constraintScope({ type: 'string', allowedValues: ['A'] }).string).toBe(false);
    expect(constraintScope({ type: 'string', siviCodelist: null, allowedValues: [] }).string).toBe(true);
  });

  it('reads an attribute as the editor holds it, with null and absent fields', () => {
    const attr: ConstraintSubject = { type: 'number', required: false, minimum: 0, maximum: null, default: ' 1.50 ', pattern: null };
    expect(constraintSummaryParts(attr)).toEqual(['minimum: 0', 'default: 1.50']);
    expect(constraintSummary({ type: 'boolean', default: 'TRUE' })).toBe('default: true');
    expect(constraintSummary({ type: 'string', minLength: 2, pattern: '^[a-z]+$' })).toBe('minLength: 2; pattern: ^[a-z]+$');
  });

  it('drops a stale constraint the type no longer carries', () => {
    expect(constraintSummary({ type: 'integer', minLength: 3, minimum: 1 })).toBe('minimum: 1');
  });

  it('validates an editor attribute the same way as a saved one', () => {
    expect(validateAttributeConstraints({ type: 'string', minLength: 5, maxLength: 3 })).toEqual(['minLength (5) exceeds maxLength (3)']);
    expect(validateAttributeConstraints({ type: 'integer', minimum: 1.5 })).toEqual(['minimum must be an integer on integer attributes']);
    expect(validateAttributeConstraints({ type: 'number', exclusiveMinimum: 2, maximum: 2 })).toEqual([
      'lower bound 2 must be below upper bound 2 when a bound is exclusive',
    ]);
    expect(validateAttributeConstraints({ type: 'integer', default: '1.0' })).toEqual(['default "1.0" is not an integer']);
    expect(validateAttributeConstraints({ type: 'string', maxLength: 2, default: 'abc' })).toEqual([
      'default "abc" is longer than maxLength 2',
    ]);
    expect(validateAttributeConstraints({ type: 'string', required: true, default: 'x' })).toEqual([
      'default only applies to optional string, number, integer and boolean attributes',
    ]);
    expect(validateAttributeConstraints({ type: 'string', minLength: null, default: null })).toEqual([]);
  });
});

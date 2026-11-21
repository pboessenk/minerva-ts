import type { TypeInfo } from '../types.ts';
import { getEntities, getEnums } from '../model-access.ts';

export const FORM_MAX_DEPTH = 6;

const PRIMITIVES = ['string', 'number', 'integer', 'boolean', 'Date'];

/** Classify an attribute type into a rendering category. */
export function formTypeInfo(attrType: string | undefined): TypeInfo {
  if (!attrType || attrType === '_section') return { kind: 'skip' };

  const isArray = attrType.endsWith('[]');
  const base = isArray ? attrType.slice(0, -2) : attrType;

  // Primitives
  if (PRIMITIVES.includes(base)) {
    return { kind: isArray ? 'primitive-array' : 'primitive', base, isArray };
  }
  // Enum reference
  if (getEnums()?.[base]) {
    return { kind: isArray ? 'enum-array' : 'enum', base, isArray };
  }
  // Entity reference
  if (getEntities()?.[base]) {
    return { kind: isArray ? 'entity-array' : 'entity', base, isArray };
  }
  // Unresolved: render as text
  return { kind: 'unresolved', base, isArray };
}

/** Return a safe CSS class suffix for depth colouring (0-5). */
export function depthClass(depth: number): string {
  return 'ca-form-depth-' + Math.min(depth, 5);
}

export function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

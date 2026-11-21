/** Reads the values of a rendered example form back into a nested object. */
import type { JsonObject, TypeMap } from '../types.ts';
import { formTypeInfo } from './type-info.ts';
import { getEntities } from '../model-access.ts';

/**
 * Walk the form and collect values into a nested object.
 * Also builds a typeMap for reconciliation.
 */
export function collectFormValues(entityName: string, container: HTMLElement): { data: JsonObject; typeMap: TypeMap } {
  const typeMap: TypeMap = {};
  // The collector returns null for an unknown entity; callers then fail on it.
  const data = collectEntity(entityName, container, '', typeMap) as JsonObject;
  return { data, typeMap };
}

function collectEntity(entityName: string, container: HTMLElement, pathPrefix: string, typeMap: TypeMap): JsonObject | null {
  const entity = getEntities()?.[entityName] ?? null;
  if (!entity) return null;

  const result: JsonObject = {};

  for (const attr of entity.attrs) {
    if (attr.type === '_section') continue;

    const info = formTypeInfo(attr.type);
    if (info.kind === 'skip') continue;

    const fieldPath = pathPrefix ? pathPrefix + '.' + attr.name : attr.name;

    switch (info.kind) {
      case 'primitive':
      case 'unresolved': {
        const input = container.querySelector<HTMLInputElement>(`[data-path="${fieldPath}"]`);
        if (!input) break;
        const val = readPrimitiveInput(input, info.base);
        if (val !== null && val !== '' && val !== undefined) {
          result[attr.name] = val;
          typeMap[fieldPath] = attr.type;
        }
        break;
      }

      case 'enum': {
        const sel = container.querySelector<HTMLSelectElement>(`select[data-path="${fieldPath}"]`);
        if (!sel || !sel.value) break;
        result[attr.name] = sel.value;
        typeMap[fieldPath] = attr.type;
        break;
      }

      case 'enum-array': {
        const wrap = container.querySelector(`.ca-form-enum-array-wrap[data-path="${fieldPath}"]`);
        if (!wrap) break;
        const arr = collectTagValues(wrap);
        if (arr.length > 0) {
          result[attr.name] = arr;
          typeMap[fieldPath] = attr.type;
        }
        break;
      }

      case 'entity': {
        const entContainer = container.querySelector<HTMLElement>(`.ca-form-entity-content[data-path="${fieldPath}"]`);
        if (!entContainer || entContainer.dataset.excluded) break;
        const childData = collectEntity(info.base, entContainer, fieldPath, typeMap);
        if (childData && Object.keys(childData).length > 0) {
          result[attr.name] = childData;
          typeMap[fieldPath] = attr.type;
        }
        break;
      }

      case 'entity-array': {
        const arraySection = container.querySelector<HTMLElement>(`.ca-form-array[data-path="${fieldPath}"]`);
        if (!arraySection || arraySection.dataset.excluded) break;
        const items = arraySection.querySelectorAll(':scope > .ca-form-array-items > .ca-form-array-item');
        const arr: JsonObject[] = [];
        items.forEach((item) => {
          const content = item.querySelector<HTMLElement>('.ca-form-entity-content');
          if (!content) return;
          const itemData = collectEntity(info.base, content, '', {});
          if (itemData && Object.keys(itemData).length > 0) {
            arr.push(itemData);
          }
        });
        if (arr.length > 0) {
          result[attr.name] = arr;
          typeMap[fieldPath] = attr.type;
        }
        break;
      }

      case 'primitive-array': {
        // Check codelist-array picker first
        const clWrap = container.querySelector(`.ca-form-cl-array-wrap[data-path="${fieldPath}"]`);
        if (clWrap) {
          const arr = collectTagValues(clWrap);
          if (arr.length > 0) {
            result[attr.name] = arr;
            typeMap[fieldPath] = attr.type;
          }
          break;
        }
        // Fallback: plain comma-separated input
        const input = container.querySelector<HTMLInputElement>(`[data-path="${fieldPath}"]`);
        if (!input || !input.value.trim()) break;
        const parts = input.value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (parts.length > 0) {
          result[attr.name] = parts.map((p) => coercePrimitive(p, info.base));
          typeMap[fieldPath] = attr.type;
        }
        break;
      }
    }
  }

  return result;
}

/** Values of the chips inside a tag-picker wrapper, in DOM order. */
function collectTagValues(wrap: Element): string[] {
  const arr: string[] = [];
  wrap.querySelectorAll<HTMLElement>('.ca-form-enum-tag').forEach((tag) => {
    if (tag.dataset.value) arr.push(tag.dataset.value);
  });
  return arr;
}

function readPrimitiveInput(input: HTMLInputElement, baseType: string): string | number | boolean | null | undefined {
  if (input.dataset.ftype === 'boolean') {
    if (input.indeterminate) return undefined; // not included
    return input.checked;
  }
  if (baseType === 'number' || baseType === 'integer') {
    const v = input.value.trim();
    if (v === '') return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }
  return input.value.trim() || null;
}

function coercePrimitive(val: string, baseType: string): string | number | boolean {
  if (baseType === 'number' || baseType === 'integer') {
    const n = Number(val);
    return Number.isNaN(n) ? val : n;
  }
  if (baseType === 'boolean') return val === 'true';
  return val;
}

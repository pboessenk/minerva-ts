/**
 * Builders of the copyable code of an entity: a JSON example and TypeScript
 * types (with the enums and codelists they refer to).
 */
import { hasNamedType } from '@minerva/core';
import type { ApiAttr } from '../editor/model-types.ts';
import { constraintSubject } from './constraints.ts';
import type { DatacatEntity } from './model-access.ts';
import { codelistByName, datacat } from './model-access.ts';
import { state } from '../editor/state.ts';

function _jsonExampleValue(
  type: string | undefined,
  format: string | null | undefined,
  example: string | null | undefined,
  allowedValues: string[] | null | undefined,
): string | number | boolean {
  const t = (type || 'string').toLowerCase();
  if (t === 'integer' || t === 'int') {
    return example ? parseInt(example, 10) || 0 : 0;
  }
  if (t === 'number' || t === 'float' || t === 'double' || t === 'decimal') {
    return example ? parseFloat(example) || 0.0 : 0.0;
  }
  if (t === 'boolean' || t === 'bool') {
    if (example) return example.toLowerCase() === 'true';
    return false;
  }
  if (example) return example;
  if (allowedValues && allowedValues.length) return allowedValues[0]!;
  if (format === 'date') return '2024-01-01';
  if (format === 'date-time') return '2024-01-01T00:00:00Z';
  if (format === 'email') return 'user@example.com';
  if (format === 'uri' || format === 'url') return 'https://example.com';
  return 'string';
}

export function _buildEntityJSON(entityName: string, subtype: string | null, visited: Set<string>): Record<string, unknown> {
  const e = state.apiModel![entityName];
  if (!e) return {};
  if (visited.has(entityName)) return {};
  visited.add(entityName);

  const entityNames = new Set(Object.keys(state.apiModel!));
  const enumNames = state.apiEnums ? new Set(Object.keys(state.apiEnums!)) : new Set();
  const obj: Record<string, unknown> = {};

  let attrs = e.attrs.filter((a) => a.type !== '_section');
  if (subtype && subtype !== '__base__') {
    attrs = attrs.filter((a) => {
      if (a.name === 'entityType') return true;
      if (!a.applicableSubtypes || a.applicableSubtypes.length === 0) return true;
      return a.applicableSubtypes.includes(subtype);
    });
  }

  for (const a of attrs) {
    const isArray = a.type.endsWith('[]');
    const baseType = isArray ? a.type.slice(0, -2) : a.type;
    if (a.name === 'entityType' && subtype && subtype !== '__base__') {
      obj[a.name] = subtype;
      continue;
    }
    if (entityNames.has(baseType)) {
      const child = _buildEntityJSON(baseType, null, visited);
      obj[a.name] = isArray ? [child] : child;
      continue;
    }
    if (enumNames.has(baseType)) {
      const en = state.apiEnums![baseType]!;
      const val = en.values && en.values.length ? en.values[0]!.value : baseType;
      obj[a.name] = isArray ? [val] : val;
      continue;
    }
    const val = _jsonExampleValue(baseType, a.format, a.example, a.allowedValues);
    obj[a.name] = isArray ? [val] : val;
  }

  visited.delete(entityName);
  return obj;
}

/* ── TypeScript builder ── */

function _toTsType(type: string): string {
  const isArray = type.endsWith('[]');
  const base = isArray ? type.slice(0, -2) : type;
  const lower = base.toLowerCase();
  let mapped: string;
  switch (lower) {
    case 'string':
    case 'date':
      mapped = 'string';
      break;
    case 'boolean':
      mapped = 'boolean';
      break;
    case 'number':
    case 'integer':
    case 'int':
      mapped = 'number';
      break;
    default:
      mapped = base;
  }
  return isArray ? mapped + '[]' : mapped;
}

function _toPascalCase(s: string): string {
  return s.replace(/(^|[^a-zA-Z0-9])([a-z])/g, (_, _p, c: string) => c.toUpperCase());
}

/** Look up SIVI description for a reference like "party.entityType", stripping the entity.subtype prefix. */
function _lookupSiviDesc(siviPath: string): string {
  if (!datacat() || !siviPath) return '';
  const dot = siviPath.indexOf('.');
  if (dot < 0) return '';
  const entityKey = siviPath.substring(0, dot);
  const attrName = siviPath.substring(dot + 1);
  // Case-insensitive entity lookup (datacat keys may differ in casing)
  let dcEntity: DatacatEntity | null = null;
  let entityName = entityKey;
  for (const [k, v] of Object.entries(datacat()!)) {
    if (k.toLowerCase() === entityKey.toLowerCase()) {
      dcEntity = v;
      entityName = k;
      break;
    }
  }
  if (!dcEntity) return '';
  for (const et of dcEntity.entityTypes || []) {
    const a = (et.attrs || []).find((a) => a.name === attrName);
    if (a && a.desc) {
      // Strip "entity.subtype. " prefix
      const prefix = entityName + '.' + et.name + '. ';
      if (a.desc.toLowerCase().startsWith(prefix.toLowerCase())) {
        return a.desc.substring(prefix.length);
      }
      return a.desc;
    }
  }
  return '';
}

export function _buildEntityTS(entityName: string, subtype: string | null): string {
  const e = state.apiModel![entityName];
  if (!e) return '';

  const entityNames = new Set(Object.keys(state.apiModel!));
  const enumNames = state.apiEnums ? new Set(Object.keys(state.apiEnums!)) : new Set();
  const typeLines: string[] = []; // type aliases, enums (emitted first)
  const rootIfaceLines: string[] = []; // root entity interface (emitted second)
  const childIfaceLines: string[] = []; // referenced entity interfaces (emitted last)
  const emittedTypes = new Set<string>();
  const emittedIfaces = new Set<string>();
  const visiting = new Set<string>(); // cycle detection

  function _collectNamedTypes(ownerEntity: string, attrList: ApiAttr[]) {
    for (const a of attrList) {
      const hasNamed = hasNamedType(constraintSubject(a));
      if (!hasNamed) continue;
      // Skip allowed-values alias when the enum itself will be emitted
      if (a.name === 'entityType' && enumNames.has(a.type)) continue;
      const typeName = a.allowedName || ownerEntity + _toPascalCase(a.name);
      if (emittedTypes.has(typeName)) continue;
      emittedTypes.add(typeName);
      let vals = a.allowedValues && a.allowedValues.length ? a.allowedValues : [];
      let clDescs: Record<string, string> | null = null;
      if (a.codelist && codelistByName() && codelistByName()![a.codelist]) {
        const cl = codelistByName()![a.codelist]!;
        const descs: Record<string, string> = {};
        clDescs = descs;
        (cl.Code || []).forEach((c) => {
          descs[c.CodeValue!] = c.Description || '';
        });
        if (!vals.length) {
          vals = (cl.Code || []).map((c) => c.CodeValue!);
        }
      }
      if (vals.length) {
        if (clDescs) {
          typeLines.push('/**');
          if (a.codelist && codelistByName()![a.codelist] && codelistByName()![a.codelist]!.Description) {
            typeLines.push(' * ' + codelistByName()![a.codelist]!.Description);
            typeLines.push(' *');
          }
          typeLines.push(' * | Code | Description |');
          typeLines.push(' * |------|-------------|');
          for (const v of vals) {
            typeLines.push(' * | ' + v + ' | ' + (clDescs[v] || '') + ' |');
          }
          typeLines.push(' */');
        }
        const union = vals.map((v) => "'" + v + "'").join(' | ');
        typeLines.push('export type ' + typeName + ' = ' + union + ';');
        typeLines.push('');
      }
    }
  }

  function _collectEnums(attrList: ApiAttr[]) {
    for (const a of attrList) {
      // Attrs with a named subset alias use the alias as their TS type;
      // the underlying enum is not referenced and should not be emitted.
      const hasNamedAlias = hasNamedType(constraintSubject(a));
      if (hasNamedAlias) continue;
      const isArray = a.type.endsWith('[]');
      const baseType = isArray ? a.type.slice(0, -2) : a.type;
      if (enumNames.has(baseType) && !emittedTypes.has(baseType)) {
        emittedTypes.add(baseType);
        const en = state.apiEnums![baseType]!;
        const union = en.values.map((v) => "'" + v.value + "'").join(' | ');
        // Emit a JSDoc table when any member carries a label or
        // description, mirroring the codelist legend style above so
        // consumers see what each value means at a glance.
        const hasLabels = en.values.some((v) => (v.note && v.note.trim()) || (v.name && v.name.trim() && v.name !== v.value));
        if (hasLabels) {
          typeLines.push('/**');
          if (en.desc) {
            typeLines.push(' * ' + en.desc);
            typeLines.push(' *');
          }
          typeLines.push(' * | Value | Name | Description |');
          typeLines.push(' * |-------|------|-------------|');
          for (const v of en.values) {
            const nm = v.name && v.name !== v.value ? v.name : '';
            typeLines.push(' * | ' + v.value + ' | ' + nm + ' | ' + (v.note || '') + ' |');
          }
          typeLines.push(' */');
        } else if (en.desc) {
          typeLines.push('/** ' + en.desc + ' */');
        }
        typeLines.push('export type ' + baseType + ' = ' + union + ';');
        typeLines.push('');
      }
    }
  }

  function _writeAttr(ownerEntity: string, a: ApiAttr, lines: string[], forceType?: string) {
    const opt = a.required ? '' : '?';
    let tsType = forceType || _toTsType(a.type);
    const hasNamed = hasNamedType(constraintSubject(a));
    if (hasNamed && !forceType) {
      const typeName = a.allowedName || ownerEntity + _toPascalCase(a.name);
      if (a.type.endsWith('[]')) tsType = typeName + '[]';
      else tsType = typeName;
    }
    let desc = a.description || '';
    if (!desc && a.sivi) {
      desc = _lookupSiviDesc(a.sivi);
    }
    const commentParts = [];
    if (desc) commentParts.push(desc);
    if (a.example) commentParts.push('@example ' + a.example);
    const comment = commentParts.length ? ' // ' + commentParts.join(' ') : '';
    lines.push('  ' + a.name + opt + ': ' + tsType + ';' + comment);
  }

  // Recursively emit an entity and all its referenced children
  function _emitEntity(eName: string, st: string | null, isRoot: boolean) {
    if (emittedIfaces.has(eName + (st || '')) || visiting.has(eName)) return;
    visiting.add(eName);

    const ent = state.apiModel![eName];
    if (!ent) {
      visiting.delete(eName);
      return;
    }

    const entAttrs = ent.attrs.filter((a) => a.type !== '_section');
    const etAttr = entAttrs.find((a) => a.name === 'entityType');
    const sts = etAttr && etAttr.allowedValues && etAttr.allowedValues.length ? etAttr.allowedValues : null;

    // Determine which attrs to process for dependency scanning
    let scanAttrs = entAttrs;
    if (st && st !== '__base__' && sts) {
      scanAttrs = entAttrs.filter((a) => {
        if (a.name === 'entityType') return true;
        if (!a.applicableSubtypes || a.applicableSubtypes.length === 0) return true;
        return a.applicableSubtypes.includes(st);
      });
    }

    // Collect types and enums for this entity's attrs
    _collectNamedTypes(eName, scanAttrs);
    _collectEnums(scanAttrs);

    // Recurse into referenced child entities (always non-root)
    for (const a of scanAttrs) {
      const isArray = a.type.endsWith('[]');
      const baseType = isArray ? a.type.slice(0, -2) : a.type;
      if (entityNames.has(baseType) && baseType !== eName) {
        _emitEntity(baseType, null, false);
      }
    }

    // Direct output to root or child buffer
    const out = isRoot ? rootIfaceLines : childIfaceLines;
    if (st && st !== '__base__' && sts) {
      const schemaName = eName + _toPascalCase(st);
      if (!emittedIfaces.has(schemaName)) {
        emittedIfaces.add(schemaName);
        if (ent.desc) out.push('/** ' + ent.desc + ' \u2014 subtype: ' + st + ' */');
        out.push('export interface ' + schemaName + ' {');
        for (const a of scanAttrs) {
          if (a.name === 'entityType') {
            if (a.description) out.push('  /** ' + a.description + ' */');
            out.push("  entityType: '" + st + "';");
            continue;
          }
          _writeAttr(eName, a, out);
        }
        out.push('}');
        out.push('');
      }
    } else if (sts) {
      if (!emittedIfaces.has(eName)) {
        emittedIfaces.add(eName);
        if (ent.desc) out.push('/** ' + ent.desc + ' */');
        const parts = sts.map((s) => eName + _toPascalCase(s));
        out.push('export type ' + eName + ' = ' + parts.join(' | ') + ';');
        out.push('');
        for (const s of sts) {
          const schemaName = eName + _toPascalCase(s);
          emittedIfaces.add(schemaName);
          const stAttrs = entAttrs.filter((a) => {
            if (a.name === 'entityType') return true;
            if (!a.applicableSubtypes || a.applicableSubtypes.length === 0) return true;
            return a.applicableSubtypes.includes(s);
          });
          out.push('export interface ' + schemaName + ' {');
          for (const a of stAttrs) {
            if (a.name === 'entityType') {
              out.push("  entityType: '" + s + "';");
              continue;
            }
            _writeAttr(eName, a, out);
          }
          out.push('}');
          out.push('');
        }
      }
    } else {
      if (!emittedIfaces.has(eName)) {
        emittedIfaces.add(eName);
        if (ent.desc) out.push('/** ' + ent.desc + ' */');
        out.push('export interface ' + eName + ' {');
        for (const a of ent.attrs) {
          if (a.type === '_section') {
            out.push('  // \u2014 ' + a.note + ' \u2014');
            continue;
          }
          _writeAttr(eName, a, out);
        }
        out.push('}');
        out.push('');
      }
    }

    visiting.delete(eName);
  }

  _emitEntity(entityName, subtype, true);

  return [...typeLines, ...rootIfaceLines, ...childIfaceLines].join('\n');
}

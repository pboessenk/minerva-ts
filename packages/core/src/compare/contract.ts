import { compareStrings, sortStrings } from '../text/compare.ts';
import { quote } from '../text/escape.ts';
import { formatFloat } from '../text/number.ts';
import { trimSpace } from '../text/strings.ts';
import {
  decodeOperation,
  decodeSharedParameters,
  type OaDocument,
  type OaMedia,
  type OaOperation,
  type OaParameter,
  type OaSchema,
} from './contract-decode.ts';
import {
  type DriftFinding,
  type IrBody,
  type IrDoc,
  type IrOperation,
  type IrProp,
  type IrSchema,
  finding,
  newBody,
  newDoc,
  newProp,
  newSchema,
} from './ir.ts';
import { canonicalSchemaName, normalizePath, refSchemaName } from './names.ts';
import { type LooseValue, valueText } from './value-text.ts';

/**
 * Contract side of a comparison: an OpenAPI document normalized into the IR.
 *
 * Understands the shapes that TypeSpec and similar emitters produce:
 * namespaced schema names, single-member allOf wrappers around a `$ref`,
 * anyOf with null, 3.1 type arrays, component-level allOf (base schemas),
 * and named primitive schemas.
 */

const HTTP_VERBS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options', 'trace'];

/**
 * A schema the document has no object for (written as JSON null) where one
 * is required. The whole request fails there.
 */
export class NilSchemaError extends Error {
  constructor() {
    super('runtime error: invalid memory address or nil pointer dereference');
    this.name = 'NilSchemaError';
  }
}

function must(s: OaSchema | null | undefined): OaSchema {
  if (s === null || s === undefined) throw new NilSchemaError();
  return s;
}

/** Resolves a 3.1 `type` (a string or a list of strings) to one base type and a nullable flag. */
export function typeAndNullable(t: LooseValue): { base: string; nullable: boolean } {
  if (typeof t === 'string') return { base: t, nullable: false };
  if (!Array.isArray(t)) return { base: '', nullable: false };
  let base = '';
  let nullable = false;
  for (const item of t) {
    if (typeof item !== 'string') continue;
    if (item === 'null') nullable = true;
    else if (base === '') base = item;
  }
  return { base, nullable };
}

const baseTypeOf = (t: LooseValue): string => typeAndNullable(t).base;

/**
 * An object without declared properties: it accepts any JSON object. A
 * schema with allOf members is not open, its properties live in the members.
 */
function isOpenObject(s: OaSchema): boolean {
  if ((s.properties?.size ?? 0) > 0 || (s.enum?.length ?? 0) > 0 || (s.oneOf?.length ?? 0) > 0 || (s.allOf?.length ?? 0) > 0) return false;
  const base = baseTypeOf(s.type);
  return base === 'object' || (base === '' && (s.unevaluatedProperties !== null || s.additionalProperties !== null));
}

/**
 * A bare primitive (string, number, integer or boolean, possibly with format
 * and validation keywords), as emitted for a declared scalar type.
 */
function isPrimitiveSchema(s: OaSchema): boolean {
  if (
    s.ref !== '' ||
    (s.enum?.length ?? 0) > 0 ||
    s.const !== null ||
    (s.properties?.size ?? 0) > 0 ||
    s.items !== null ||
    (s.allOf?.length ?? 0) > 0 ||
    (s.anyOf?.length ?? 0) > 0 ||
    (s.oneOf?.length ?? 0) > 0
  ) {
    return false;
  }
  return ['string', 'number', 'integer', 'boolean'].includes(baseTypeOf(s.type));
}

function putFloat(out: Map<string, string>, key: string, value: number | null): void {
  if (value !== null) out.set(key, formatFloat(value));
}

/**
 * OpenAPI 3.1 writes exclusive bounds as numbers; 3.0 used booleans next to
 * minimum/maximum. Both forms are converted to the 3.1 form.
 */
function exclusiveBound(out: Map<string, string>, inclusiveKey: string, exclusiveKey: string, raw: LooseValue): void {
  if (typeof raw === 'number') {
    out.set(exclusiveKey, formatFloat(raw));
  } else if (raw === true && (out.get(inclusiveKey) ?? '') !== '') {
    out.set(exclusiveKey, out.get(inclusiveKey) as string);
    out.delete(inclusiveKey);
  }
}

/** A default as the model stores it; objects and lists are not comparable and yield an empty string. */
function defaultString(value: LooseValue): string {
  if (typeof value === 'string') return trimSpace(value);
  if (typeof value === 'number') return formatFloat(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return '';
}

/** The validation keywords of a scalar schema as canonical text, or `null` when it has none. */
function constraintMap(s: OaSchema): Map<string, string> | null {
  const out = new Map<string, string>();
  putFloat(out, 'minLength', s.minLength);
  putFloat(out, 'maxLength', s.maxLength);
  putFloat(out, 'minimum', s.minimum);
  putFloat(out, 'maximum', s.maximum);
  exclusiveBound(out, 'minimum', 'exclusiveMinimum', s.exclusiveMinimum);
  exclusiveBound(out, 'maximum', 'exclusiveMaximum', s.exclusiveMaximum);
  const def = defaultString(s.default);
  if (def !== '') out.set('default', def);
  return out.size === 0 ? null : out;
}

class ContractNormalizer {
  readonly doc: OaDocument;
  readonly findings: DriftFinding[] = [];
  /** Raw names referenced as component-level allOf bases. */
  readonly baseRefs = new Set<string>();
  /** Raw names of primitive schemas inlined into properties. */
  readonly scalarRefs = new Set<string>();

  constructor(doc: OaDocument) {
    this.doc = doc;
  }

  get schemas(): Map<string, OaSchema | null> {
    return this.doc.components.schemas ?? new Map();
  }

  /** Classifies a top-level component schema. */
  normalizeSchema(rawName: string, schema: OaSchema | null): IrSchema {
    const s = must(schema);
    const out = newSchema(canonicalSchemaName(rawName), rawName, '');
    out.description = s.description;
    out.siviCode = s.xSiviCode;

    // Component-level allOf (a base class, as TypeSpec `extends` emits it,
    // or hand-written composition): flattened into one effective object so
    // it compares against the model's flat projection. Enum and oneOf keep
    // their own classification.
    if ((s.allOf?.length ?? 0) > 0 && (s.enum?.length ?? 0) === 0 && (s.oneOf?.length ?? 0) === 0) {
      const effective = this.resolveEffectiveObject(s, new Set([rawName]));
      if (effective !== null) {
        out.kind = 'object';
        const required = new Set(effective.required);
        for (const name of sortStrings(effective.props.keys())) {
          const p = this.normalizeProp(out.name, name, effective.props.get(name) as OaSchema | null);
          p.required = required.has(name);
          out.properties.set(name, p);
          out.propOrder.push(name);
        }
        return out;
      }
      this.findings.push(
        finding({
          category: 'unsupported-shape',
          severity: 'info',
          entity: out.name,
          contract: rawName,
          changeNeeded:
            'Component-level allOf could not be flattened (cycle, external ref, or non-object member); compared by its own declared properties only.',
        }),
      );
    }

    if ((s.enum?.length ?? 0) > 0) {
      out.kind = 'enum';
      out.enumValues = (s.enum as LooseValue[]).map(valueText);
    } else if ((s.oneOf?.length ?? 0) > 0) {
      out.kind = 'union';
      for (const variant of s.oneOf as (OaSchema | null)[]) {
        const name = refSchemaName(must(variant).ref);
        if (name !== '') out.oneOf.push(canonicalSchemaName(name));
      }
      if (s.discriminator !== null) out.discriminator = s.discriminator.propertyName;
    } else if ((s.properties?.size ?? 0) > 0) {
      const properties = s.properties as Map<string, OaSchema | null>;
      out.kind = 'object';
      const required = new Set(s.required ?? []);
      for (const name of sortStrings(properties.keys())) {
        const p = this.normalizeProp(out.name, name, properties.get(name) as OaSchema | null);
        p.required = required.has(name);
        out.properties.set(name, p);
        out.propOrder.push(name);
      }
    } else if (baseTypeOf(s.type) === 'object' || s.unevaluatedProperties !== null || s.additionalProperties !== null) {
      // An object without declared properties: open.
      out.kind = 'open';
    } else {
      out.kind = 'other';
      out.baseType = baseTypeOf(s.type);
    }
    return out;
  }

  /**
   * Flattens a schema's allOf chain into one effective object: the union of
   * the members' properties plus the schema's own. Local refs resolve through
   * the document (a base may sort after the schemas extending it) and are
   * recorded in `baseRefs`. Later members override earlier ones, own
   * properties override members, `required` is the union without duplicates.
   *
   * `path` holds the names on the current resolution path; meeting one again
   * is a cycle. Returns `null` for a cycle, an external or dangling ref, or a
   * member that is not a plain object.
   */
  resolveEffectiveObject(s: OaSchema, path: Set<string>): { props: Map<string, OaSchema | null>; required: string[] } | null {
    if ((s.enum?.length ?? 0) > 0 || (s.oneOf?.length ?? 0) > 0 || (s.anyOf?.length ?? 0) > 0) return null;
    const base = baseTypeOf(s.type);
    if (base !== '' && base !== 'object') return null;

    const props = new Map<string, OaSchema | null>();
    const required: string[] = [];
    const addRequired = (names: readonly string[]): void => {
      for (const name of names) if (!required.includes(name)) required.push(name);
    };

    for (const entry of s.allOf ?? []) {
      const member = must(entry);
      let resolved: ReturnType<ContractNormalizer['resolveEffectiveObject']>;
      if (member.ref !== '') {
        const name = refSchemaName(member.ref);
        if (name === '') return null; // external
        if (!this.schemas.has(name)) return null; // dangling
        if (path.has(name)) return null; // cycle
        const target = must(this.schemas.get(name));
        this.baseRefs.add(name);
        path.add(name);
        resolved = this.resolveEffectiveObject(target, path);
        path.delete(name); // a diamond is fine, a cycle is not
      } else {
        resolved = this.resolveEffectiveObject(member, path);
      }
      if (resolved === null) return null;
      for (const [name, schema] of resolved.props) props.set(name, schema);
      addRequired(resolved.required);
    }

    for (const [name, schema] of s.properties ?? []) props.set(name, schema);
    addRequired(s.required ?? []);
    return { props, required };
  }

  normalizeProp(schemaName: string, propName: string, schema: OaSchema | null): IrProp {
    const s = must(schema);
    const p = newProp(propName);
    p.description = s.description;
    p.siviCode = s.xSiviCode;
    this.fillPropType(schemaName, propName, s, p);
    return p;
  }

  /** Unwraps emitter idioms (allOf wrappers, anyOf with null, type arrays) into `p`. */
  fillPropType(schemaName: string, propName: string, s: OaSchema, p: IrProp): void {
    if (s.ref !== '') {
      const name = refSchemaName(s.ref);
      if (name === '') {
        this.findings.push(
          finding({
            category: 'unsupported-shape',
            severity: 'info',
            entity: schemaName,
            property: propName,
            contract: s.ref,
            changeNeeded: 'External or non-component $ref is not compared.',
          }),
        );
        return;
      }
      // A named primitive (a declared scalar with, say, length bounds) is
      // inlined: the model projects such attributes as plain typed
      // properties, never as references.
      if (this.schemas.has(name)) {
        const target = must(this.schemas.get(name));
        if (isPrimitiveSchema(target)) {
          this.scalarRefs.add(name);
          this.fillPropType(schemaName, propName, target, p);
          return;
        }
      }
      p.ref = canonicalSchemaName(name);
      return;
    }

    // allOf wrapper, e.g. {allOf: [{$ref}], description, x-sivi-code}.
    if ((s.allOf?.length ?? 0) > 0) {
      const members = s.allOf as (OaSchema | null)[];
      if (members.length > 1) {
        this.findings.push(
          finding({
            category: 'unsupported-shape',
            severity: 'info',
            entity: schemaName,
            property: propName,
            changeNeeded: 'Multi-member allOf is compared by its first member only.',
          }),
        );
      }
      this.fillPropType(schemaName, propName, must(members[0]), p);
      // Sibling keys of the wrapper win when set.
      if (s.xSiviCode !== '') p.siviCode = s.xSiviCode;
      return;
    }

    // anyOf [T, {type: null}] -> T, nullable.
    if ((s.anyOf?.length ?? 0) > 0) {
      const nonNull: OaSchema[] = [];
      for (const entry of s.anyOf as (OaSchema | null)[]) {
        const variant = must(entry);
        if (typeAndNullable(variant.type).base === 'null') {
          p.nullable = true;
          continue;
        }
        nonNull.push(variant);
      }
      if (nonNull.length >= 1) {
        if (nonNull.length > 1) {
          this.findings.push(
            finding({
              category: 'unsupported-shape',
              severity: 'info',
              entity: schemaName,
              property: propName,
              changeNeeded: 'Multi-variant anyOf is compared by its first variant only.',
            }),
          );
        }
        this.fillPropType(schemaName, propName, nonNull[0] as OaSchema, p);
      }
      return;
    }

    const { base, nullable } = typeAndNullable(s.type);
    if (nullable) p.nullable = true;

    if (base === 'array') {
      p.array = true;
      if (s.items !== null) {
        const item = newProp('');
        this.fillPropType(schemaName, propName, s.items, item);
        p.ref = item.ref;
        p.type = item.type;
        p.format = item.format;
        p.pattern = item.pattern;
        p.enumValues = item.enumValues;
        // Element keywords come from the items (a default there is not a
        // default of the property); item bounds from the array itself.
        p.constraints = item.constraints;
        p.constraints?.delete('default');
      }
      if (s.minItems !== null || s.maxItems !== null) {
        p.constraints ??= new Map();
        putFloat(p.constraints, 'minItems', s.minItems);
        putFloat(p.constraints, 'maxItems', s.maxItems);
      }
      return;
    }

    p.type = base;
    p.format = s.format;
    p.pattern = s.pattern;
    p.constraints = constraintMap(s);
    if ((s.enum?.length ?? 0) > 0) {
      p.enumValues = (s.enum as LooseValue[]).map(valueText);
    } else if (s.const !== null) {
      p.enumValues = [valueText(s.const)];
    }
  }

  normalizeOperation(method: string, path: string, op: OaOperation, shared: readonly OaParameter[]): IrOperation {
    const out: IrOperation = {
      method,
      path: normalizePath(path),
      rawPath: path,
      operationId: op.operationId,
      params: [],
      requestBody: null,
      responses: new Map(),
      respOrder: [],
      tags: op.tags ?? [],
    };
    const opLabel = method + ' ' + path;

    for (const p of [...shared, ...(op.parameters ?? [])]) {
      let type = 'string';
      if (p.schema !== null) {
        const base = baseTypeOf(p.schema.type);
        if (base !== '') type = base;
      }
      out.params.push({ name: p.name, in: p.in, required: p.required, type });
    }

    if (op.requestBody !== null) out.requestBody = this.normalizeBody(opLabel, 'request body', op.requestBody.content);

    const responses = op.responses ?? new Map();
    for (const code of sortStrings(responses.keys())) {
      out.responses.set(code, this.normalizeBody(opLabel, 'response ' + code, responses.get(code)?.content ?? null));
      out.respOrder.push(code);
    }
    return out;
  }

  /** The body schema of a request or response; `null` when there is no content. */
  normalizeBody(opLabel: string, where: string, content: Map<string, OaMedia> | null): IrBody | null {
    if (content === null || content.size === 0) return null;
    // application/json, else the first content type in name order.
    const media = content.get('application/json') ?? (content.get([...content.keys()].sort(compareStrings)[0] as string) as OaMedia);
    if (media.schema === null) return newBody();

    const body = newBody();
    let s: OaSchema = media.schema;
    // A single-member allOf wrapper around the body schema.
    if (s.ref === '' && s.allOf?.length === 1) s = must(s.allOf[0]);

    if (s.ref !== '') {
      const name = refSchemaName(s.ref);
      if (name === '') {
        this.findings.push(
          finding({
            category: 'unsupported-shape',
            severity: 'info',
            operation: opLabel,
            contract: s.ref,
            changeNeeded: 'External $ref in ' + where + ' is not compared.',
          }),
        );
        return body;
      }
      body.ref = canonicalSchemaName(name);
      // A ref to an open schema is still unconstrained.
      if (this.schemas.has(name) && isOpenObject(must(this.schemas.get(name)))) body.unconstrained = true;
    } else if (baseTypeOf(s.type) === 'array') {
      body.array = true;
      if (s.items !== null) {
        let items = s.items;
        if (items.ref === '' && items.allOf?.length === 1) items = must(items.allOf[0]);
        const name = refSchemaName(items.ref);
        if (name !== '') {
          body.ref = canonicalSchemaName(name);
        } else {
          this.findings.push(
            finding({
              category: 'unsupported-shape',
              severity: 'info',
              operation: opLabel,
              changeNeeded: 'Inline array item schema in ' + where + ' is not compared.',
            }),
          );
        }
      }
    } else if (isOpenObject(s)) {
      body.unconstrained = true;
    } else {
      this.findings.push(
        finding({
          category: 'unsupported-shape',
          severity: 'info',
          operation: opLabel,
          changeNeeded: 'Inline schema in ' + where + ' is not compared.',
        }),
      );
    }
    return body;
  }
}

/**
 * Normalizes a parsed OpenAPI document. The findings report shapes that
 * cannot be compared (external refs, multi-member allOf, inline bodies).
 */
export function normalizeContract(doc: OaDocument): { ir: IrDoc; findings: DriftFinding[] } {
  const n = new ContractNormalizer(doc);
  const ir = newDoc(doc.info.title, doc.info.version);

  for (const raw of sortStrings(n.schemas.keys())) {
    const s = n.normalizeSchema(raw, n.schemas.get(raw) as OaSchema | null);
    const previous = ir.schemas.get(s.name);
    if (previous !== undefined) {
      n.findings.push(
        finding({
          category: 'unsupported-shape',
          severity: 'info',
          entity: s.name,
          contract: raw,
          changeNeeded: `Contract schemas ${quote(previous.rawName)} and ${quote(raw)} both map to canonical name ${quote(s.name)}; only the first is compared.`,
        }),
      );
      continue;
    }
    ir.schemas.set(s.name, s);
    ir.schemaOrder.push(s.name);
  }
  // allOf bases are structural: their properties were flattened into the
  // schemas extending them, and the flat model never defines a base. Marked
  // so they are not reported as missing; likewise inlined primitives.
  for (const raw of n.baseRefs) {
    const s = ir.schemas.get(canonicalSchemaName(raw));
    if (s !== undefined) s.isAllOfBase = true;
  }
  for (const raw of n.scalarRefs) {
    const s = ir.schemas.get(canonicalSchemaName(raw));
    if (s !== undefined) s.isScalarRef = true;
  }

  const paths = doc.paths ?? new Map();
  for (const path of sortStrings(paths.keys())) {
    const item = paths.get(path) ?? null;
    // Path-level parameters apply to every operation of the item.
    const sharedNode = item?.get('parameters');
    const shared = sharedNode !== undefined ? decodeSharedParameters(sharedNode) : [];
    for (const verb of HTTP_VERBS) {
      const node = item?.get(verb);
      if (node === undefined) continue;
      const method = verb.toUpperCase();
      const op = decodeOperation(node);
      if (typeof op === 'string') {
        n.findings.push(
          finding({
            category: 'unsupported-shape',
            severity: 'info',
            operation: method + ' ' + path,
            changeNeeded: 'Could not parse this contract operation: ' + op,
          }),
        );
        continue;
      }
      const irOp = n.normalizeOperation(method, path, op, shared);
      const key = irOp.method + ' ' + irOp.path;
      ir.operations.set(key, irOp);
      ir.opOrder.push(key);
    }
  }

  return { ir, findings: n.findings };
}

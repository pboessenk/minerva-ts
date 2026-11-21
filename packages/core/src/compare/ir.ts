/**
 * The intermediate representation both sides of a contract comparison are
 * normalized into, and the findings and report the comparison produces.
 *
 * The model side is projected with exactly the rules of the OpenAPI export,
 * so the comparison sees the model as that export would emit it and mapping
 * differences cannot show up as drift.
 */

export type SchemaKind = 'object' | 'enum' | 'union' | 'open' | 'other';

export interface IrDoc {
  title: string;
  version: string;
  /** Keyed by schema name (model) or canonical name (contract). */
  schemas: Map<string, IrSchema>;
  schemaOrder: string[];
  /** Keyed by `METHOD <normalized path>`. */
  operations: Map<string, IrOperation>;
  /**
   * Operation keys in document order. On the contract side two paths can
   * normalize to the same key; the key is then listed twice and the map
   * holds the later operation.
   */
  opOrder: string[];
}

export interface IrSchema {
  /** Canonical name: the namespace prefix is stripped. */
  name: string;
  /** Name as written, e.g. `Ns.Document`. */
  rawName: string;
  /** Empty only transiently, while a contract schema is being classified. */
  kind: SchemaKind | '';
  /** For kind `other`: the underlying primitive type. */
  baseType: string;
  description: string;
  properties: Map<string, IrProp>;
  /** Property names in order; on the model side a duplicated attribute name is listed twice. */
  propOrder: string[];
  enumValues: string[];
  /** SIVI codelist code (`x-sivi-code` on the contract side). */
  siviCode: string;
  /** For kind `union`: the variant schema names. */
  oneOf: string[];
  discriminator: string;
  /** Model side: a subtype schema of a discriminated union. */
  isSubtype: boolean;
  /** Contract side: referenced as a component-level allOf base. */
  isAllOfBase: boolean;
  /** Contract side: a primitive schema inlined into the properties that reference it. */
  isScalarRef: boolean;
}

export interface IrProp {
  name: string;
  /** Primitive OpenAPI type; empty when `ref` is set. */
  type: string;
  format: string;
  pattern: string;
  /** Validation keywords as canonical text, keyed like `CONSTRAINT_KEYS`; `null` when there are none. */
  constraints: Map<string, string> | null;
  /** Canonical schema name when the property references a schema. */
  ref: string;
  array: boolean;
  required: boolean;
  nullable: boolean;
  /** Inline enum or const values. */
  enumValues: string[];
  siviCode: string;
  description: string;
}

export interface IrOperation {
  method: string;
  /** Normalized: see `normalizePath`. */
  path: string;
  rawPath: string;
  operationId: string;
  params: IrParam[];
  requestBody: IrBody | null;
  /** Status code -> body; `null` for a response without content. */
  responses: Map<string, IrBody | null>;
  respOrder: string[];
  tags: string[];
}

export interface IrParam {
  name: string;
  in: string;
  type: string;
  required: boolean;
}

export interface IrBody {
  /** Canonical schema name; empty for an inline schema or none. */
  ref: string;
  array: boolean;
  /** An open object: any JSON is accepted. */
  unconstrained: boolean;
}

export function newSchema(name: string, rawName: string, kind: SchemaKind | ''): IrSchema {
  return {
    name,
    rawName,
    kind,
    baseType: '',
    description: '',
    properties: new Map(),
    propOrder: [],
    enumValues: [],
    siviCode: '',
    oneOf: [],
    discriminator: '',
    isSubtype: false,
    isAllOfBase: false,
    isScalarRef: false,
  };
}

export function newProp(name: string): IrProp {
  return {
    name,
    type: '',
    format: '',
    pattern: '',
    constraints: null,
    ref: '',
    array: false,
    required: false,
    nullable: false,
    enumValues: [],
    siviCode: '',
    description: '',
  };
}

export function newBody(): IrBody {
  return { ref: '', array: false, unconstrained: false };
}

export function newDoc(title: string, version: string): IrDoc {
  return { title, version, schemas: new Map(), schemaOrder: [], operations: new Map(), opOrder: [] };
}

// ── Findings and report ──

export type Severity = 'error' | 'warn' | 'info';

/**
 * One difference between model and contract. Empty strings and empty lists
 * mean "not applicable" and are left out of the JSON form.
 */
export interface DriftFinding {
  category: string;
  severity: Severity;
  entity: string;
  property: string;
  /** `METHOD /path` as written on the side that reports it. */
  operation: string;
  /** Response status code. */
  code: string;
  /** The value on the model side. */
  model: string;
  /** The value on the contract side. */
  contract: string;
  onlyInModel: string[];
  onlyInContract: string[];
  changeNeeded: string;
}

export type FindingInit = Pick<DriftFinding, 'category' | 'severity' | 'changeNeeded'> & Partial<DriftFinding>;

export function finding(init: FindingInit): DriftFinding {
  return {
    category: init.category,
    severity: init.severity,
    entity: init.entity ?? '',
    property: init.property ?? '',
    operation: init.operation ?? '',
    code: init.code ?? '',
    model: init.model ?? '',
    contract: init.contract ?? '',
    onlyInModel: init.onlyInModel ?? [],
    onlyInContract: init.onlyInContract ?? [],
    changeNeeded: init.changeNeeded,
  };
}

export interface DriftStats {
  errors: number;
  warnings: number;
  infos: number;
  modelSchemas: number;
  contractSchemas: number;
  matchedSchemas: number;
  modelOperations: number;
  contractOperations: number;
  matchedOperations: number;
}

export interface DriftReport {
  modelTitle: string;
  modelVersion: string;
  contractTitle: string;
  contractVersion: string;
  stats: DriftStats;
  /** Sorted: see `sortFindings`. */
  findings: DriftFinding[];
}

export interface CompareOptions {
  /** Also report differing descriptions of schemas and properties. */
  includeDescriptions: boolean;
}

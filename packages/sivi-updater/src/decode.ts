import type { ClCode, ClItem, DcAttribute, DcEntity, DcEntityType } from './types.ts';

/**
 * Lenient decoding of the catalogue files: unknown keys are ignored, keys
 * match case-insensitively, `null` leaves the default, and a value of the
 * wrong type is an error (the file is then rejected as a whole).
 */

type Obj = Record<string, unknown>;

export class DecodeError extends Error {}

function isObject(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function typeName(v: unknown): string {
  if (Array.isArray(v)) return 'array';
  if (v === null) return 'null';
  return typeof v === 'object' ? 'object' : typeof v;
}

/** Calls `visit(field, value)` for every key of `obj` that names one of `fields`. */
function eachField(obj: Obj, fields: readonly string[], visit: (field: string, value: unknown) => void): void {
  for (const [key, value] of Object.entries(obj)) {
    const field = fields.includes(key) ? key : fields.find((f) => f.toLowerCase() === key.toLowerCase());
    if (field !== undefined && value !== null) visit(field, value);
  }
}

/** Rejects a value of the wrong type: `codelist.Name: expected string, found number`. */
function mismatch(what: string, expected: string, v: unknown): DecodeError {
  return new DecodeError(`${what}: expected ${expected}, found ${typeName(v)}`);
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw mismatch(what, 'string', v);
  return v.toWellFormed();
}

function arr<T>(v: unknown, what: string, item: (x: unknown) => T): T[] {
  if (!Array.isArray(v)) throw mismatch(what, 'array', v);
  return v.map(item);
}

function struct(v: unknown, what: string): Obj {
  if (v === null) return {};
  if (!isObject(v)) throw mismatch(what, 'object', v);
  return v;
}

function decodeCode(v: unknown): ClCode {
  const out: ClCode = { CodeValue: '', Description: '' };
  eachField(struct(v, 'code'), ['CodeValue', 'Description'], (f, x) => {
    if (f === 'CodeValue') out.CodeValue = str(x, 'code.CodeValue');
    else out.Description = str(x, 'code.Description');
  });
  return out;
}

export function decodeClItem(v: unknown): ClItem {
  const out: ClItem = { Name: '', Description: '', Code: null };
  eachField(struct(v, 'codelist'), ['Name', 'Description', 'Code'], (f, x) => {
    if (f === 'Name') out.Name = str(x, 'codelist.Name');
    else if (f === 'Description') out.Description = str(x, 'codelist.Description');
    else out.Code = arr(x, 'codelist.Code', decodeCode);
  });
  return out;
}

function decodeAttribute(v: unknown): DcAttribute {
  const out: DcAttribute = { Name: '', Description: '', Datatype: '', Codelist: '', AFD1: '' };
  eachField(struct(v, 'attribute'), ['Name', 'Description', 'Datatype', 'Codelist', 'AFD1'], (f, x) => {
    out[f as keyof DcAttribute] = str(x, `attribute.${f}`);
  });
  return out;
}

function decodeEntityType(v: unknown): DcEntityType {
  const out: DcEntityType = { Name: '', Description: '', Attribute: [] };
  eachField(struct(v, 'entityType'), ['Name', 'Description', 'Attribute'], (f, x) => {
    if (f === 'Name') out.Name = str(x, 'entityType.Name');
    else if (f === 'Description') out.Description = str(x, 'entityType.Description');
    else out.Attribute = arr(x, 'entityType.Attribute', decodeAttribute);
  });
  return out;
}

export function decodeDcEntity(v: unknown): DcEntity {
  const out: DcEntity = { Name: '', Description: '', EntityType: [] };
  eachField(struct(v, 'entity'), ['Name', 'Description', 'EntityType'], (f, x) => {
    if (f === 'Name') out.Name = str(x, 'entity.Name');
    else if (f === 'Description') out.Description = str(x, 'entity.Description');
    else out.EntityType = arr(x, 'entity.EntityType', decodeEntityType);
  });
  return out;
}

/** `{"Items": [...]}` of codelist.json. */
export function decodeCodelistWrapper(v: unknown): ClItem[] {
  let items: ClItem[] = [];
  eachField(struct(v, 'codelist file'), ['Items'], (_f, x) => {
    items = arr(x, 'Items', decodeClItem);
  });
  return items;
}

/** `{"Entity": [...]}` of datacat.json. */
export function decodeDatacatWrapper(v: unknown): DcEntity[] {
  let items: DcEntity[] = [];
  eachField(struct(v, 'datacat file'), ['Entity'], (_f, x) => {
    items = arr(x, 'Entity', decodeDcEntity);
  });
  return items;
}

/** Parses and decodes one catalogue file; throws on bad JSON or a type mismatch. */
export function decodeText<T>(text: string, decode: (v: unknown) => T): T {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch (e) {
    throw new DecodeError(e instanceof Error ? e.message : String(e));
  }
  return decode(root);
}

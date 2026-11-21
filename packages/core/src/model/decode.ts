import { type JsonNode, JsonSyntaxError, parseJson } from '../json/parse.ts';
import { DecodeContext, type Decoder, boolean, float, integer, list, mapOf, optional, rawText, string, struct } from '../json/typed.ts';
import type {
  Attribute,
  Changelog,
  ChangelogEntry,
  ChangelogRelease,
  Child,
  CompareSource,
  Contact,
  Entity,
  Enum,
  EnumValue,
  Example,
  Model,
  ModelExportSettings,
  OpenPoint,
  Operation,
  OperationResponse,
  Parameter,
  Section,
  Security,
  Server,
} from './types.ts';

/** The model file could not be read as a model. `message` says where and why. */
export class ModelDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelDecodeError';
  }
}

const contact = struct<Contact>({ name: string, email: string, url: string });
const security = struct<Security>({ enabled: boolean, bearerFormat: string, description: string });
const server = struct<Server>({ url: string, description: string });
const changelogEntry = struct<ChangelogEntry>({ category: string, text: string });
const changelogRelease = struct<ChangelogRelease>({ version: string, date: string, entries: list(changelogEntry) });
const changelog = struct<Changelog>({ open: list(changelogEntry), releases: list(changelogRelease) });
const compareSource = struct<CompareSource>({ id: string, label: string, path: string });
const openPoint = struct<OpenPoint>({ text: string, type: string });

const attribute = struct<Attribute>({
  name: string,
  type: string,
  format: string,
  pattern: string,
  minLength: optional(integer),
  maxLength: optional(integer),
  minimum: optional(float),
  maximum: optional(float),
  exclusiveMinimum: optional(float),
  exclusiveMaximum: optional(float),
  minItems: optional(integer),
  maxItems: optional(integer),
  default: string,
  required: boolean,
  description: string,
  example: string,
  siviReference: optional(string),
  siviCodelist: optional(string),
  allowedValues: list(string),
  allowedName: string,
  applicableSubtypes: list(string),
  notes: string,
});

const section = struct<Section>({ name: optional(string), attributes: list(attribute) });
const child = struct<Child>({ name: string, cardinality: string, condition: string, propertyName: string });

const entity = struct<Entity>({
  description: string,
  root: boolean,
  excludeFromInclusion: boolean,
  children: list(child),
  sections: list(section),
  openPoints: list(openPoint),
});

const enumValue = struct<EnumValue>({ name: string, value: string, label: string, description: string });
const enumeration = struct<Enum>({ description: string, values: list(enumValue), openPoints: list(openPoint) });

const parameter = struct<Parameter>({
  name: string,
  in: string,
  type: string,
  required: boolean,
  description: string,
});

const operationResponse = struct<OperationResponse>({
  description: string,
  schema: string,
  responseBodyArray: boolean,
});

const operation = struct<Operation>({
  id: string,
  method: string,
  path: string,
  summary: string,
  description: string,
  tags: list(string),
  requestBody: string,
  requestBodyArray: boolean,
  parameters: list(parameter),
  responses: mapOf(operationResponse),
});

const example = struct<Example>({
  id: string,
  operationId: string,
  technicalName: string,
  summary: string,
  parameterValues: mapOf(string),
  request: rawText,
  response: rawText,
  responseCode: string,
});

const exportSettings = struct<ModelExportSettings>({ namespace: string, primaryRoot: string });

const model: Decoder<Model> = struct<Model>({
  version: string,
  color: string,
  title: string,
  subtitle: string,
  lastModified: string,
  servers: list(server),
  security: optional(security),
  contact: optional(contact),
  changelog: optional(changelog),
  compareSources: list(compareSource),
  entities: mapOf(entity),
  enums: mapOf(enumeration),
  operations: list(operation),
  examples: list(example),
  codelistNames: mapOf(string),
  export: exportSettings,
});

/**
 * Reads a model file.
 *
 * @throws ModelDecodeError when the text is not JSON or a value has the
 * wrong type. Missing keys never fail; see `json/typed.ts` for the rules.
 */
export function decodeModel(text: string): Model {
  let root: JsonNode;
  try {
    root = parseJson(text);
  } catch (err) {
    if (err instanceof JsonSyntaxError) throw new ModelDecodeError(`${err.message} (offset ${err.offset})`);
    throw err;
  }
  const ctx = new DecodeContext(text);
  const decoded = model(root, '', ctx);
  if (ctx.error !== undefined) throw new ModelDecodeError(ctx.error);
  return decoded;
}

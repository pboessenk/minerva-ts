/**
 * Editor shared state.
 *
 * Generic model state used by all API modules. Each API populates it when
 * activated; the generic editor modules read it. Unconverted scripts reach
 * the same variables as globals (`apiModel`, `apiEnums`, ...), see `install`.
 */
import { resetGraph } from './graph.ts';
import type {
  ApiAttr,
  ApiChild,
  ApiConfig,
  ApiEntity,
  ApiEnum,
  ApiEnumMap,
  ApiExample,
  ApiModelMap,
  ApiOperation,
  Cardinality,
  OpenPoint,
  OpenPointType,
  RawModel,
  RawOpenPoint,
} from './model-types.ts';
import { pickConstraints } from '../editors/constraints.ts';
import { storeModel } from '../base/model-state.ts';

export interface EditorState {
  /** Runtime entities map: { Name: { desc, children, attrs, ... } } */
  apiModel: ApiModelMap | null;
  /** Runtime enums map: { Name: { desc, values } } */
  apiEnums: ApiEnumMap | null;
  /** Shared codelist type names: { CODE: 'CoverageCode', ... } */
  apiCodelistNames: Record<string, string> | null;
  /** Runtime operations: [ { id, method, path, ... } ] */
  apiOps: ApiOperation[] | null;
  /** Runtime examples: [ { id, operationId, summary, request, response } ] */
  apiExamples: ApiExample[] | null;
  /** Currently selected entity/enum/op/example (e.g. "Order", "enum:Role", "op:createOrder", "ex:basic-order") */
  apiActiveEntity: string | null;
  /** Whether any model is loaded */
  apiModelLoaded: boolean;
  /** Which model path is currently loaded */
  loadedModelPath: string | null;
  /** Active API config: { name, dataPath, color } */
  apiConfig: ApiConfig | null;
}

/** The one editor state. Filled with its initial values by `install`. */
export const state = {} as EditorState;

function initialState(): EditorState {
  return {
    apiModel: null,
    apiEnums: null,
    apiCodelistNames: null,
    apiOps: null,
    apiExamples: null,
    apiActiveEntity: null,
    apiModelLoaded: false,
    loadedModelPath: null,
    apiConfig: null,
  };
}

/** The model maps once loaded; the editor views only run after a load. */
export function loadedModel(): ApiModelMap {
  return state.apiModel as ApiModelMap;
}

/**
 * Load an API model from a JSON data path.
 * Populates apiModel, apiEnums, apiOps from the fetched JSON.
 * @param dataPath e.g. '/data/shop_model.json'
 */
export async function loadApiModel(dataPath: string): Promise<void> {
  try {
    const resp = await fetch(dataPath + '?t=' + Date.now());
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = (await resp.json()) as RawModel;

    storeModel(json);
    rebuildFromRawModel(json);
    state.apiModelLoaded = true;
    state.loadedModelPath = dataPath;

    console.log(
      `Minerva: loaded API model — ${Object.keys(state.apiModel as ApiModelMap).length} entities, ${Object.keys(state.apiEnums as ApiEnumMap).length} enums, ${(state.apiOps || []).length} operations, ${(state.apiExamples || []).length} examples`,
    );
  } catch (err) {
    console.error('Failed to load API model:', err);
    state.apiModel = {};
    state.apiEnums = {};
    state.apiOps = [];
    state.apiExamples = [];
  }
}

function runtimeOpenPoint(p: RawOpenPoint): OpenPoint {
  // The type is validated by the server's model schema.
  return typeof p === 'string' ? { text: p, type: 'warning' } : { text: p.text || '', type: (p.type || 'warning') as OpenPointType };
}

/**
 * Rebuild runtime model objects from raw JSON.
 * Called after initial load or file-load.
 */
export function rebuildFromRawModel(json: RawModel): void {
  const apiModel: ApiModelMap = {};
  const apiEnums: ApiEnumMap = {};
  state.apiModel = apiModel;
  state.apiEnums = apiEnums;
  state.apiCodelistNames = json.codelistNames || {};
  state.apiOps = [];
  state.apiExamples = [];

  for (const [name, ent] of Object.entries(json.entities || {})) {
    const attrs: ApiAttr[] = [];
    for (const section of ent.sections || []) {
      if (section.name) {
        attrs.push({ name: '_section_' + section.name.toLowerCase().replace(/[^a-z0-9]/g, '_'), type: '_section', note: section.name });
      }
      for (const a of section.attributes || []) {
        attrs.push({
          name: a.name,
          type: a.type,
          format: a.format || null,
          required: a.required || false,
          sivi: a.siviReference || null,
          codelist: a.siviCodelist || null,
          description: a.description || null,
          example: a.example || null,
          note: a.notes || null,
          allowedValues: a.allowedValues || null,
          allowedName: a.allowedName || null,
          applicableSubtypes: a.applicableSubtypes || null,
          ...pickConstraints(a),
        });
      }
    }
    apiModel[name] = {
      desc: ent.description || '',
      root: !!ent.root,
      excludeFromInclusion: !!ent.excludeFromInclusion,
      parent: ent.parent || null,
      children: [], // derived below from attribute types
      attrs: attrs,
      openPoints: (ent.openPoints || []).map(runtimeOpenPoint),
    } satisfies ApiEntity;
  }

  // Derive children from attributes whose type references another entity
  deriveAllChildren();

  for (const [name, en] of Object.entries(json.enums || {})) {
    apiEnums[name] = {
      desc: en.description || '',
      values: (en.values || []).map((v) => ({
        codeName: v.name || '',
        name: v.label || v.value,
        value: v.value,
        note: v.description || null,
      })),
      openPoints: (en.openPoints || []).map(runtimeOpenPoint),
    } satisfies ApiEnum;
  }

  state.apiOps = (json.operations || []).map((op) => ({
    id: op.id,
    method: op.method,
    path: op.path,
    summary: op.summary || '',
    description: op.description || '',
    tags: op.tags || [],
    requestBody: op.requestBody || null,
    requestBodyArray: !!op.requestBodyArray,
    parameters: op.parameters || [],
    responses: op.responses || {},
  }));

  state.apiExamples = (json.examples || []).map((ex) => ({
    id: ex.id,
    operationId: ex.operationId,
    technicalName: ex.technicalName || '',
    summary: ex.summary || '',
    parameterValues: ex.parameterValues || {},
    request: ex.request || null,
    response: ex.response || null,
    responseCode: ex.responseCode || '',
  }));

  // Reset graph so it re-initializes with new data
  resetGraph();
}

/**
 * Derive children for all entities from attribute types.
 * An attribute whose base type matches an entity name creates a child link.
 * Cardinality: Type[] → *, Type + required → 1, Type + !required → 0..1
 */
export function deriveAllChildren(): void {
  const apiModel = loadedModel();
  const entityNames = new Set(Object.keys(apiModel));

  for (const [name, ent] of Object.entries(apiModel)) {
    const children: ApiChild[] = [];
    for (const a of ent.attrs) {
      if (a.type === '_section') continue;
      const isArray = a.type.endsWith('[]');
      const baseType = isArray ? a.type.slice(0, -2) : a.type;
      if (entityNames.has(baseType) && baseType !== name) {
        let card: Cardinality;
        if (isArray) {
          card = a.required ? '1..*' : '*';
        } else {
          card = a.required ? '1' : '0..1';
        }
        children.push({ name: baseType, card, condition: null });
      }
    }
    ent.children = children;
  }
}

/** Creates the state with its initial values. */
export function install(): void {
  Object.assign(state, initialState());
}

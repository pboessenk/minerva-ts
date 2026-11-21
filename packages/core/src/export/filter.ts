import type { Entity, Enum, Example, Model, Operation } from '../model/types.ts';
import { trimSuffix } from '../text/strings.ts';

/**
 * Selective export: the part of a model reachable from chosen root entities.
 *
 * The result holds the entities reachable from `roots` (through attribute
 * types and `children`), the operations that use them, the entities those
 * operations respond with, and the enums, examples and codelist names that
 * go with all of that.
 *
 * Servers, security, contact, changelog and compare sources are not carried
 * over; a filtered export describes schemas and operations only.
 */
export function filterModel(model: Model, roots: readonly string[]): Model {
  if (roots.length === 0) return model;

  const entitySet = entityClosure(model, roots);
  let operations = referencedOperations(model, entitySet);

  // Operations in scope may respond with entities outside the closure (a
  // shared error body, a result wrapper). Those are emitted too. An entity
  // flagged `excludeFromInclusion` is never a reason to include an
  // *operation*, but it is still emitted when an included operation uses it.
  const extraRoots: string[] = [];
  for (const operation of operations) {
    for (const response of operation.responses.values()) {
      if (response.schema !== '' && !entitySet.has(response.schema)) extraRoots.push(response.schema);
    }
  }
  if (extraRoots.length > 0) {
    for (const name of entityClosure(model, extraRoots)) entitySet.add(name);
    operations = referencedOperations(model, entitySet);
  }

  const entities = new Map<string, Entity>();
  for (const name of entitySet) {
    const entity = model.entities.get(name);
    if (entity !== undefined) entities.set(name, entity);
  }
  const enums = new Map<string, Enum>();
  for (const name of referencedEnums(model, entitySet)) {
    const enumeration = model.enums.get(name);
    if (enumeration !== undefined) enums.set(name, enumeration);
  }

  return {
    version: model.version,
    color: model.color,
    title: model.title,
    subtitle: model.subtitle,
    lastModified: model.lastModified,
    servers: [],
    security: null,
    contact: null,
    changelog: null,
    compareSources: [],
    entities,
    enums,
    operations,
    examples: referencedExamples(model, operations),
    codelistNames: referencedCodelistNames(model, entitySet),
    export: model.export,
  };
}

/** Breadth-first closure over attribute types and `children`. */
function entityClosure(model: Model, roots: readonly string[]): Set<string> {
  const visited = new Set<string>();
  const queue = roots.filter((r) => model.entities.has(r));
  while (queue.length > 0) {
    const name = queue.shift() as string;
    if (visited.has(name)) continue;
    const entity = model.entities.get(name);
    if (entity === undefined) continue;
    visited.add(name);
    for (const section of entity.sections) {
      for (const a of section.attributes) {
        const base = trimSuffix(a.type, '[]');
        if (model.entities.has(base) && !visited.has(base)) queue.push(base);
      }
    }
    for (const child of entity.children) {
      if (!visited.has(child.name)) queue.push(child.name);
    }
  }
  return visited;
}

function referencedEnums(model: Model, entitySet: ReadonlySet<string>): Set<string> {
  const result = new Set<string>();
  for (const name of entitySet) {
    for (const section of model.entities.get(name)?.sections ?? []) {
      for (const a of section.attributes) {
        const base = trimSuffix(a.type, '[]');
        if (model.enums.has(base)) result.add(base);
      }
    }
  }
  return result;
}

/** Operations whose request body or any response uses an entity in the set. */
function referencedOperations(model: Model, entitySet: ReadonlySet<string>): Operation[] {
  const triggers = (name: string): boolean => name !== '' && entitySet.has(name) && model.entities.get(name)?.excludeFromInclusion !== true;
  return model.operations.filter(
    (operation) => triggers(operation.requestBody) || [...operation.responses.values()].some((response) => triggers(response.schema)),
  );
}

function referencedExamples(model: Model, operations: readonly Operation[]): Example[] {
  const ids = new Set(operations.map((operation) => operation.id));
  return model.examples.filter((example) => ids.has(example.operationId));
}

function referencedCodelistNames(model: Model, entitySet: ReadonlySet<string>): Map<string, string> {
  const referenced = new Set<string>();
  for (const name of entitySet) {
    for (const section of model.entities.get(name)?.sections ?? []) {
      for (const a of section.attributes) {
        if (a.siviCodelist !== null) referenced.add(a.siviCodelist);
      }
    }
  }
  const result = new Map<string, string>();
  for (const [codelist, typeName] of model.codelistNames) {
    if (referenced.has(codelist)) result.set(codelist, typeName);
  }
  return result;
}

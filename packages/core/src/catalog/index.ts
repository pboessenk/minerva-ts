export type * from './types.ts';
export { decodeCodelist, decodeCatalogEntity, decodeCustomDescriptions, emptyCustomDescriptions } from './decode.ts';
export {
  attributeDescriptions,
  buildCatalogLookups,
  buildCodelistLookup,
  codelistDescriptions,
  entityAliases,
  subtypeDescriptions,
  type CatalogLookups,
} from './lookups.ts';

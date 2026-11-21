import { tryParseJson } from '../json/parse.ts';
import { DecodeContext, type Decoder, list, mapOf, optional, string, struct } from '../json/typed.ts';
import type { CatalogAttribute, CatalogEntity, CatalogEntityType, Codelist, CodelistCode, CustomDescriptions } from './types.ts';

// On-disk shapes. Property names are the JSON keys.
interface CodeFile {
  CodeValue: string;
  Description: string;
}
interface CodelistFile {
  Name: string;
  Description: string;
  Code: CodeFile[] | null;
}
interface AttributeFile {
  Name: string;
  Description: string;
  Datatype: string;
  Codelist: string;
  AFD1: string;
}
interface EntityTypeFile {
  Name: string;
  Description: string;
  Attribute: AttributeFile[];
}
interface EntityFile {
  Name: string;
  Description: string;
  EntityType: EntityTypeFile[];
}

const codeFile = struct<CodeFile>({ CodeValue: string, Description: string });
const codelistFile = struct<CodelistFile>({ Name: string, Description: string, Code: optional(list(codeFile)) });
const attributeFile = struct<AttributeFile>({
  Name: string,
  Description: string,
  Datatype: string,
  Codelist: string,
  AFD1: string,
});
const entityTypeFile = struct<EntityTypeFile>({ Name: string, Description: string, Attribute: list(attributeFile) });
const entityFile = struct<EntityFile>({ Name: string, Description: string, EntityType: list(entityTypeFile) });

function decodeWith<T>(decoder: Decoder<T>, text: string): T | undefined {
  const root = tryParseJson(text);
  if (root === undefined) return undefined;
  const ctx = new DecodeContext(text);
  const value = decoder(root, '', ctx);
  return ctx.error === undefined ? value : undefined;
}

/** Decodes one codelist file. `undefined` when the file is malformed; such files are skipped. */
export function decodeCodelist(text: string): Codelist | undefined {
  const file = decodeWith(codelistFile, text);
  if (file === undefined) return undefined;
  return {
    name: file.Name,
    description: file.Description,
    codes: file.Code === null ? null : file.Code.map((c): CodelistCode => ({ codeValue: c.CodeValue, description: c.Description })),
  };
}

/** Decodes one data-catalogue entity file. `undefined` when the file is malformed; such files are skipped. */
export function decodeCatalogEntity(text: string): CatalogEntity | undefined {
  const file = decodeWith(entityFile, text);
  if (file === undefined) return undefined;
  return {
    name: file.Name,
    description: file.Description,
    entityTypes: file.EntityType.map(
      (et): CatalogEntityType => ({
        name: et.Name,
        description: et.Description,
        attributes: et.Attribute.map(
          (a): CatalogAttribute => ({
            name: a.Name,
            description: a.Description,
            datatype: a.Datatype,
            codelist: a.Codelist,
            afd1: a.AFD1,
          }),
        ),
      }),
    ),
  };
}

const customDescriptions = struct<CustomDescriptions>({
  subtypes: mapOf(string),
  codeNotes: mapOf(mapOf(string)),
});

export function emptyCustomDescriptions(): CustomDescriptions {
  return { subtypes: new Map(), codeNotes: new Map() };
}

/** Decodes `custom_descriptions.json`. `undefined` when the text is malformed. */
export function decodeCustomDescriptions(text: string): CustomDescriptions | undefined {
  return decodeWith(customDescriptions, text);
}

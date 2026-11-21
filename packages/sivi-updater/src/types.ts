/** On-disk shapes of the SIVI catalogue; property names are the JSON keys. */

export interface ClCode {
  CodeValue: string;
  Description: string;
}

export interface ClItem {
  Name: string;
  Description: string;
  /** `null` when the source has no code list at all; written as `null`. */
  Code: ClCode[] | null;
}

export interface DcAttribute {
  Name: string;
  Description: string;
  Datatype: string;
  Codelist: string;
  AFD1: string;
}

export interface DcEntityType {
  Name: string;
  Description: string;
  Attribute: DcAttribute[];
}

export interface DcEntity {
  Name: string;
  Description: string;
  EntityType: DcEntityType[];
}

export interface Catalogue {
  codelists: ClItem[];
  datacat: DcEntity[];
}

export type ChangeKind = '+' | '-' | '~';

export interface AttrChange {
  kind: ChangeKind;
  name: string;
  details: string;
}

export interface SubtypeChange {
  kind: ChangeKind;
  name: string;
  attrCount: number;
  attrDiffs: AttrChange[];
  descChange: string;
}

export interface EntityChange {
  kind: ChangeKind;
  name: string;
  descChange: string;
  subtypeDiffs: SubtypeChange[];
}

export interface CodeChange {
  kind: ChangeKind;
  code: string;
  oldDesc: string;
  newDesc: string;
}

export interface CodelistChange {
  kind: ChangeKind;
  name: string;
  descChange: string;
  codeDiffs: CodeChange[];
}

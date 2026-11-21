/**
 * Shapes of the model the editors work on: the raw JSON model (what is saved)
 * and the runtime model derived from it (what the views render). The runtime
 * shapes are the editor shell's; the raw shapes are stated here with `null`
 * for unset values, as the editors store them.
 */
import type { ApiAttr, ApiEntity, ApiEnum, ApiEnumValue, AttrConstraints, OpenPoint } from '../editor/model-types.ts';

export type { ConstraintKey } from '../editor/model-types.ts';

/** Bounds are JSON numbers, pattern and default are strings, null when unset. */
export type Constraints = AttrConstraints;

export type Banner = OpenPoint;
export type BannerType = OpenPoint['type'];

/** An attribute of the raw JSON model. */
export interface RawAttr extends Partial<Constraints> {
  name: string;
  type: string;
  format?: string | null;
  required?: boolean;
  siviReference?: string | null;
  siviCodelist?: string | null;
  allowedValues?: string[] | null;
  allowedName?: string | null;
  applicableSubtypes?: string[] | null;
  description?: string | null;
  example?: string | null;
  notes?: string | null;
}

export interface RawSection {
  name: string | null;
  attributes?: RawAttr[];
}

export interface RawEntity {
  description?: string;
  root?: boolean;
  excludeFromInclusion?: boolean;
  sections?: RawSection[];
  openPoints?: Banner[];
}

export interface RawEnumValue {
  name: string;
  value: string;
  label?: string;
  description?: string;
}

export interface RawEnum {
  description?: string;
  values: RawEnumValue[];
  openPoints?: Banner[];
}

export interface RawModel {
  title?: string;
  subtitle?: string;
  color?: string;
  entities: Record<string, RawEntity>;
  enums?: Record<string, RawEnum>;
  codelistNames?: Record<string, string>;
}

/** An attribute of the runtime model. A group header is an attribute of type `_section`. */
export type RtAttr = ApiAttr;
export type RtEntity = ApiEntity;
export type RtEnum = ApiEnum;
export type RtEnumValue = ApiEnumValue;

/** One value a picker offers for an attribute. */
export interface SourceValue {
  code: string;
  desc: string;
}

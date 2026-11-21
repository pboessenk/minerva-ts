/**
 * Enum editor: enum CRUD, value editing, banners and the enum detail page.
 */
import { exposeFunctions } from '../globals.ts';
import { addEnumBanner, cycleEnumBannerType, deleteEnumBanner, editEnumBannerText } from './enum-banners.ts';
import { _promptRenameEnum, createEnum, deleteEnum } from './enum-crud.ts';
import { addEnumValue, deleteEnumValue, makeEnumValueEditable, updateEnumDescription } from './enum-values.ts';

export function install(): void {
  // These serve inline handlers in the markup (onclick="name(...)" and the like).
  exposeFunctions({
    createEnum,
    deleteEnum,
    _promptRenameEnum,
    addEnumValue,
    deleteEnumValue,
    makeEnumValueEditable,
    updateEnumDescription,
    addEnumBanner,
    deleteEnumBanner,
    cycleEnumBannerType,
    editEnumBannerText,
  });
}

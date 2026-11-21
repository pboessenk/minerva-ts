/**
 * Entity editor: entity CRUD, banners, the entity detail page with its
 * attribute table, and the copy menu. `install()` does what the original
 * script did when it ran.
 */
import { exposeFunctions } from '../globals.ts';
import { installColumns, toggleColGroup } from './columns.ts';
import { addBanner, cycleBannerType, deleteBanner, editBannerText } from './entity-banners.ts';
import { _doCopy, _toggleCopyMenu } from './entity-copy.ts';
import {
  _promptRenameEntity,
  createEntity,
  deleteEntity,
  makeDescriptionEditable,
  toggleEntityExcludeFromInclusion,
  toggleEntityRoot,
} from './entity-crud.ts';
import { filterBySubtype } from './entity-render.ts';

export function install(): void {
  installColumns();

  // These serve inline handlers in the markup (onclick="name(...)" and the like).
  exposeFunctions({
    createEntity,
    filterBySubtype,
    toggleColGroup,
    toggleEntityRoot,
    toggleEntityExcludeFromInclusion,
    deleteEntity,
    _promptRenameEntity,
    makeDescriptionEditable,
    addBanner,
    deleteBanner,
    cycleBannerType,
    editBannerText,
    _toggleCopyMenu,
    _doCopy,
  });
}

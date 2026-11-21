/**
 * Attribute editor: attribute CRUD, in-cell editing, type dropdown, SIVI
 * autocomplete, codelist picker, allowed values, subtypes, groups and
 * drag-and-drop. The parts live in the modules imported here; `install()`
 * sets them up.
 */
import { exposeFunctions } from '../globals.ts';
import { addAttribute, addSiviAttribute, deleteAttribute } from './attr-crud.ts';
import { toggleRequired } from './attr-update.ts';
import { installDragDrop } from './drag-drop.ts';
import { addGroup, deleteGroup, makeGroupEditable } from './groups.ts';
import { installSivi } from './sivi.ts';
import { installTruncationTooltip } from './truncation-tooltip.ts';

export function install(): void {
  installSivi();
  installTruncationTooltip();
  installDragDrop();

  // These serve inline handlers in the markup (onclick="name(...)" and the like).
  exposeFunctions({
    toggleRequired,
    addAttribute,
    addSiviAttribute,
    addGroup,
    deleteGroup,
    makeGroupEditable,
    deleteAttribute,
  });
}

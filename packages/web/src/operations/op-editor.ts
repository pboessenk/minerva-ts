/**
 * Operation and example editor.
 *
 * Operation CRUD and detail page (op-detail, op-inline-edit, op-crud), example
 * detail page and its forms (example-page), example CRUD (example-crud) and
 * re-ordering / duplicating (example-order).
 */
import { exposeFunctions } from '../globals.ts';
import { addParam, deleteParam, toggleParamRequired } from './op-inline-edit.ts';
import { addResponse, createOperation, deleteOperation, deleteResponse, editOperation, toggleRespArray } from './op-crud.ts';
import { removeArrayBodyItem } from './example-page.ts';
import { addResponseExample, createExample, deleteExample, editExampleMeta, importExample } from './example-crud.ts';
import { duplicateExample } from './example-order.ts';

/** Makes what the inline handlers in the markup call reachable as globals. */
export function install(): void {
  // These serve inline handlers in the markup (onclick="name(...)" and the like).
  exposeFunctions({
    createOperation,
    toggleParamRequired,
    addParam,
    deleteParam,
    addResponseExample,
    deleteResponse,
    toggleRespArray,
    addResponse,
    importExample,
    createExample,
    duplicateExample,
    editOperation,
    deleteOperation,
    editExampleMeta,
    deleteExample,
    _removeArrayBodyItem: removeArrayBodyItem,
  });
}

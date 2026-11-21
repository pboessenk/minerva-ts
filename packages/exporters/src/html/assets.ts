import { readFileSync } from 'node:fs';
import { trimSpace } from '@minerva/core';

/**
 * The stylesheet and the optional search script of the HTML export, read
 * once when this module is loaded. Authoring comments are removed so they
 * never ship in an exported document.
 */

const read = (file: string): string => readFileSync(new URL(file, import.meta.url), 'utf8');

/**
 * Removes block comments. Safe as long as the stylesheet has no string
 * values containing comment delimiters.
 */
export function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Removes lines that hold only a `//` comment. Trailing comments and block
 * comments are kept, so a string literal containing `//` is never cut.
 */
export function stripJsLineComments(source: string): string {
  return source
    .split('\n')
    .filter((line) => !trimSpace(line).startsWith('//'))
    .join('\n');
}

export const EXPORT_CSS: string = stripCssComments(read('./export.css'));
export const SEARCH_JS: string = stripJsLineComments(read('./export_search.js'));

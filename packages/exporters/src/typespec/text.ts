import { normalizeMarkdownBreaks, replaceAll, trimSpace } from '@minerva/core';

/**
 * Escaping and documentation for TypeSpec source.
 *
 * Three escapes exist because the targets differ: descriptions only need
 * their quotes escaped (and are kept on one line), while patterns and example
 * values are taken literally by the compiler, so backslashes and `${`
 * template interpolation must be escaped too. The order of the replacements
 * matters: backslashes first, so that escapes added afterwards are not
 * doubled.
 */

/** A description inside a `"..."` literal: quotes escaped, newlines turned into spaces, backslashes kept. */
export function escapeText(s: string): string {
  return replaceAll(replaceAll(s, '"', '\\"'), '\n', ' ');
}

/** A regular expression inside a `"..."` literal. */
export function escapePattern(s: string): string {
  return replaceAll(replaceAll(replaceAll(s, '\\', '\\\\'), '${', '\\${'), '"', '\\"');
}

/** An arbitrary value inside a `"..."` literal; newlines become `\n`. */
export function escapeValue(s: string): string {
  return replaceAll(escapePattern(s), '\n', '\\n');
}

/**
 * Documentation for a model or operation: `@doc("...")` for one line, a
 * `/** ... *\/` doc comment for several, with Markdown line breaks kept.
 */
export function docBlock(text: string): string {
  if (!text.includes('\n')) return `@doc("${escapeText(text)}")\n`;
  let out = '/**\n';
  for (const line of normalizeMarkdownBreaks(text).split('\n')) {
    out += line === '' ? ' *\n' : ` * ${line}\n`;
  }
  return out + ' */\n';
}

/**
 * An explicit `@doc(...)` decorator, triple-quoted for multi-line text.
 *
 * Unions must be documented this way rather than with {@link docBlock}: some
 * emitters (for example Zod emitters) crash on `/** *\/` doc comments
 * attached to unions, while an explicit `@doc` compiles to the same OpenAPI.
 *
 * In a triple-quoted string the content starts on the line after the
 * opening quotes and the closing delimiter's indentation is stripped from
 * every line; lines holding only white space are written empty.
 */
export function docDecorator(text: string): string {
  const escaped = replaceAll(replaceAll(text, '\\', '\\\\'), '${', '\\${');
  if (!escaped.includes('\n')) return `@doc("${replaceAll(escaped, '"', '\\"')}")\n`;
  let out = '@doc("""\n';
  for (const line of replaceAll(escaped, '"""', '\\"\\"\\"').split('\n')) {
    out += trimSpace(line) === '' ? '\n' : `  ${line}\n`;
  }
  return out + '  """)\n';
}

/**
 * Escaping functions with a fixed, documented output.
 *
 * Each of these has a JavaScript near-equivalent that differs in a handful of
 * characters. Exports are compared byte for byte against reference output, so
 * the exact forms are pinned here and checked against reference vectors in
 * test/go-compat.test.ts.
 */

function hex(n: number, width: number): string {
  return n.toString(16).padStart(width, '0');
}

/**
 * A JSON string literal.
 *
 * Same as `JSON.stringify(s)` except that U+2028 and U+2029 are always
 * escaped and, unless `escapeHtml` is false, so are `<`, `>` and `&` (each as
 * a six-character \u00XX escape). Unpaired surrogates become the U+FFFD escape.
 */
export function jsonString(s: string, options: { escapeHtml?: boolean } = {}): string {
  const escapeHtml = options.escapeHtml !== false;
  let out = JSON.stringify(s);
  // JSON.stringify writes an unpaired surrogate as a \udXXX escape.
  out = out.replace(/\\u(d[89a-f][0-9a-f]{2})/g, '\\ufffd');
  out = out.replace(/[\u{2028}\u{2029}]/gu, (ch) => '\\u' + hex(ch.charCodeAt(0), 4));
  if (escapeHtml) {
    out = out.replace(/[<>&]/g, (ch) => '\\u' + hex(ch.charCodeAt(0), 4));
  }
  return out;
}

const PRINTABLE = /^[\p{L}\p{M}\p{N}\p{P}\p{S} ]$/u;
const SHORT_ESCAPES: Readonly<Record<string, string>> = {
  '\x07': '\\a',
  '\b': '\\b',
  '\f': '\\f',
  '\n': '\\n',
  '\r': '\\r',
  '\t': '\\t',
  '\v': '\\v',
};

/**
 * A double-quoted literal for use in messages, e.g. `default "abc" is not a
 * number`. Printable characters are kept; everything else is written as an
 * escape (`\n`, `\x1f`, `\U0001f600` style).
 */
export function quote(s: string): string {
  let out = '"';
  for (const ch of s) {
    const cp = ch.codePointAt(0) as number;
    if (ch === '"' || ch === '\\') {
      out += '\\' + ch;
    } else if (cp >= 0xd800 && cp <= 0xdfff) {
      out += '\\ufffd';
    } else if (PRINTABLE.test(ch)) {
      out += ch;
    } else if (SHORT_ESCAPES[ch] !== undefined) {
      out += SHORT_ESCAPES[ch];
    } else if (cp < 0x20 || cp === 0x7f) {
      out += '\\x' + hex(cp, 2);
    } else if (cp < 0x10000) {
      out += '\\u' + hex(cp, 4);
    } else {
      out += '\\U' + hex(cp, 8);
    }
  }
  return out + '"';
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&#34;',
  "'": '&#39;',
};

/** Escapes text for HTML element content and quoted attribute values. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] as string);
}

/**
 * Escapes a value interpolated into the page template of the HTML export
 * (title, subtitle, version). Stricter than {@link escapeHtml}: `+` is
 * escaped and NUL is replaced.
 */
export function escapeHtmlTemplateText(s: string): string {
  return s.replace(/[&<>"'+\0]/g, (ch) => {
    if (ch === '+') return '&#43;';
    if (ch === '\0') return '\u{fffd}';
    return HTML_ESCAPES[ch] as string;
  });
}

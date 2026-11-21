// Safe HTML templating. Every interpolated value is HTML-escaped unless it is
// already a SafeHtml (a nested `html` result or a `raw()` wrapper).

export class SafeHtml {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  toString(): string {
    return this.value;
  }
  valueOf(): string {
    return this.value;
  }
}

export function escapeText(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Mark a string as trusted markup (static icons, pre-built fragments). */
export function raw(s: string): SafeHtml {
  return new SafeHtml(s);
}

function render(value: unknown): string {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(render).join('');
  if (value === null || value === undefined || value === false) return '';
  return escapeText(value);
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): SafeHtml {
  let out = strings[0] as string;
  for (let i = 0; i < values.length; i++) out += render(values[i]) + (strings[i + 1] as string);
  return new SafeHtml(out);
}

/** Join already-built fragments (each escaped unless safe). */
export function joinHtml(items: unknown[], sep = ''): SafeHtml {
  return new SafeHtml(items.map(render).join(sep));
}

/**
 * A value used as a JS string argument inside a double-quoted inline handler
 * attribute, e.g. onclick="select(${jsArg(name)})". The result is a complete,
 * single-quoted JS string literal (quotes included): backslash, quotes, line
 * terminators and `<` are JS-escaped, then the whole literal is HTML-attribute
 * escaped, because the HTML parser decodes entities before the JS engine runs.
 * Plain names come out as 'Name', identical to hand-written handlers.
 */
export function jsArg(value: unknown): string {
  const js = String(value ?? '').replace(/[\\'"<\n\r\u2028\u2029]/g, (c) => {
    switch (c) {
      case '\\':
        return '\\\\';
      case "'":
        return "\\'";
      case '"':
        return '\\x22';
      case '<':
        return '\\x3c';
      case '\n':
        return '\\n';
      case '\r':
        return '\\r';
      default:
        return '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0');
    }
  });
  return escapeText("'" + js + "'");
}

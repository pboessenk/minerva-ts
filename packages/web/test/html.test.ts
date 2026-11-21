import { describe, expect, it } from 'vitest';
import { escapeText, html, jsArg, joinHtml, raw, SafeHtml } from '../src/base/html.ts';

/** What the HTML parser hands to the JS engine for a double-quoted attribute value. */
function decodeAttr(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

describe('html tagged template', () => {
  it('escapes interpolated values', () => {
    const v = `<img src=x onerror="a()"> & 'q'`;
    expect(String(html`<p>${v}</p>`)).toBe('<p>&lt;img src=x onerror=&quot;a()&quot;&gt; &amp; &#39;q&#39;</p>');
  });

  it('leaves static markup and benign text untouched', () => {
    expect(String(html`<b class="x">${'Order'}</b>`)).toBe('<b class="x">Order</b>');
  });

  it('renders numbers and treats null/undefined/false as empty', () => {
    expect(String(html`${1}|${0}|${null}|${undefined}|${false}`)).toBe('1|0|||');
  });

  it('joins arrays and escapes each item', () => {
    expect(String(html`<ul>${['<a>', 'b']}</ul>`)).toBe('<ul>&lt;a&gt;b</ul>');
  });

  it('does not double-escape nested html results or raw()', () => {
    const inner = html`<i>${'a&b'}</i>`;
    expect(String(html`<p>${inner}</p>`)).toBe('<p><i>a&amp;b</i></p>');
    expect(String(html`<p>${raw('<hr>')}</p>`)).toBe('<p><hr></p>');
    expect(String(html`${[inner, raw('<br>'), '<x>']}`)).toBe('<i>a&amp;b</i><br>&lt;x&gt;');
  });

  it('returns a SafeHtml that works with string coercion (innerHTML assignment)', () => {
    const r = html`<p>${'x'}</p>`;
    expect(r).toBeInstanceOf(SafeHtml);
    expect(`${r}`).toBe('<p>x</p>');
    expect(r + '').toBe('<p>x</p>');
  });

  it('joinHtml joins with a separator', () => {
    expect(String(joinHtml(['a<', raw('<b>')], ', '))).toBe('a&lt;, <b>');
  });
});

describe('escapeText (what ui.escapeHtml delegates to)', () => {
  it('escapes & < > " and \'', () => {
    expect(escapeText(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });
  it('is empty for null/undefined', () => {
    expect(escapeText(undefined)).toBe('');
    expect(escapeText(null)).toBe('');
  });
});

describe('jsArg', () => {
  it('keeps plain names readable', () => {
    expect(jsArg('Order')).toBe('&#39;Order&#39;');
    expect(decodeAttr(jsArg('Order'))).toBe("'Order'");
  });

  const nasty = [
    `');window.__pwned=1;//`,
    `"><svg onload=window.__pwned=1>`,
    `back\\slash`,
    `</script><script>alert(1)</script>`,
    'line\nbreak\r\nand sep',
    `mix ' " \\' \\" end`,
    `&amp; &quot; &#39;`,
  ];

  for (const value of nasty) {
    it(`round-trips ${JSON.stringify(value)} through attribute + JS parsing`, () => {
      const attr = jsArg(value);
      // Safe inside a double-quoted attribute: no raw quote, angle bracket or ampersand-less break-out.
      expect(attr).not.toMatch(/["<>]/);
      // After the HTML parser decodes entities, the JS engine sees exactly one string literal.
      const js = decodeAttr(attr);
      const fn = new Function('f', `return f(${js});`) as (f: (x: string) => string) => string;
      expect(fn((x) => x)).toBe(value);
    });
  }

  it('cannot terminate the argument list', () => {
    const calls: string[] = [];
    const js = decodeAttr(jsArg(`');calls.push('pwned');//`));
    new Function('select', 'calls', `select(${js})`)((x: string) => calls.push(x), calls);
    expect(calls).toEqual([`');calls.push('pwned');//`]);
  });
});

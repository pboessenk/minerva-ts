/**
 * Makes authored line structure survive Markdown rendering. Descriptions in
 * OpenAPI and TypeSpec are rendered as CommonMark by documentation tools.
 *
 *  - A line followed by another non-blank line gets the hard-break marker
 *    (two trailing spaces), so a single newline shows as a line break
 *    instead of folding into the previous line.
 *  - In a run of blank lines the first stays a paragraph break and each
 *    further one becomes an `&nbsp;` line; Markdown would otherwise collapse
 *    the run, losing the author's extra spacing.
 *
 * Single blank lines and the final line are left alone, so paragraphs and
 * lists keep their meaning.
 */
export function normalizeMarkdownBreaks(text: string): string {
  const lines = text.split('\n');
  let blanks = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '') {
      blanks++;
      if (blanks > 1) lines[i] = '&nbsp;';
    } else {
      blanks = 0;
    }
  }
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i] !== '' && lines[i + 1] !== '') lines[i] += '  ';
  }
  return lines.join('\n');
}

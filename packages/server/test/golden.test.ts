import { describe, expect, it } from 'vitest';
import { readGoldens, renderGoldens } from './golden.ts';

describe('exports of the fixture workspace', () => {
  const rendered = renderGoldens();
  const stored = readGoldens();

  it('has a snapshot for every export and no stale ones', () => {
    expect([...stored.keys()].sort()).toEqual([...rendered.keys()].sort());
  });

  it.each([...rendered.keys()].sort())('%s matches its snapshot', (name) => {
    // Compared as one string so a failure shows the exact difference.
    expect(rendered.get(name)).toBe(stored.get(name));
  });
});

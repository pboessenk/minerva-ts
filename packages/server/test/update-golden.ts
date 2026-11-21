#!/usr/bin/env node
/** Rewrites fixtures/golden/ from the current exporters. Review the diff before committing. */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { GOLDEN_DIR, renderGoldens } from './golden.ts';

rmSync(GOLDEN_DIR, { recursive: true, force: true });
const goldens = renderGoldens();
for (const [name, body] of goldens) {
  const path = join(GOLDEN_DIR, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
}
process.stdout.write(`Wrote ${goldens.size} snapshots to ${GOLDEN_DIR}\n`);

/**
 * The test harness. Every test gets a fresh copy of `fixtures/workspace`, a
 * server of its own on a free port, and a page that fails the test on any
 * uncaught error or console error. Tests never share state, so they can run
 * in parallel and in any order.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '@minerva/server';
import { type Locator, type Page, test as base, expect } from '@playwright/test';

export { expect };

export const FIXTURE_WORKSPACE = fileURLToPath(new URL('../../../fixtures/workspace', import.meta.url));
export const GOLDEN_DIR = fileURLToPath(new URL('../../../fixtures/golden', import.meta.url));

/** The clock exports are rendered with, the same as for the golden files. */
const NOW = new Date('2030-01-02T03:04:05.000Z');

export interface Workspace {
  /** The data directory this test's server serves. */
  readonly dir: string;
  /** The server's base URL. */
  readonly url: string;
  /** A file of the data directory, as text. */
  read(file: string): string;
  /** A model file of the data directory, parsed. */
  readModel(file: string): ModelFile;
}

/** The parts of a saved model file the tests look at. */
export interface ModelFile {
  lastModified?: string;
  entities: Record<string, { sections?: { attributes?: { name: string; [key: string]: unknown }[] }[] }>;
}

/** The editor, with the selectors the tests share. */
export class Editor {
  readonly page: Page;
  readonly #url: string;

  constructor(page: Page, url: string) {
    this.page = page;
    this.#url = url;
  }

  /** Load the editor and wait until the sidebar has rendered. */
  async open(): Promise<void> {
    await this.page.goto(this.#url);
    await expect(this.page.locator('#entityList button').first()).toBeVisible();
  }

  /** Switch to a model by its label in the sidebar. */
  async openModel(label: string): Promise<void> {
    await this.page.locator('#apiViewButtons').getByRole('button', { name: label, exact: true }).click();
    await expect(this.sidebarItem('__overview__')).toBeVisible();
  }

  /** A sidebar entry: an entity name, or `__general__`, `__overview__`, `__search__`. */
  sidebarItem(name: string): Locator {
    return this.page.locator(`#entityList [data-entity=${JSON.stringify(name)}]`);
  }

  /** Open an entity's detail view. */
  async openEntity(name: string): Promise<void> {
    await this.sidebarItem(name).click();
    await expect(this.attributeRows(name).first()).toBeVisible();
  }

  attributeRows(entity: string): Locator {
    return this.page.locator(`tr[data-entity=${JSON.stringify(entity)}][data-attr]`);
  }

  /** A cell of the attribute table: `field` is name, type, format, constraints, sivi, codelist, allowed, description, example or notes. */
  attributeCell(entity: string, attr: string, field: string): Locator {
    return this.page.locator(
      `tr[data-entity=${JSON.stringify(entity)}][data-attr=${JSON.stringify(attr)}] td[data-field=${JSON.stringify(field)}]`,
    );
  }

  toast(): Locator {
    return this.page.locator('.minerva-toast');
  }

  /** Save the model and wait for the confirmation. */
  async save(): Promise<void> {
    await this.page.locator('#editorSaveBtn').click();
    await expect(this.toast()).toHaveText('Model saved to disk');
  }
}

interface Fixtures {
  /** Console errors a test expects; any other console error fails it. */
  allowedConsoleErrors: RegExp[];
  workspace: Workspace;
  editor: Editor;
}

export const test = base.extend<Fixtures>({
  allowedConsoleErrors: [[], { option: true }],

  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixtures must destructure their first argument.
  workspace: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), 'minerva-e2e-'));
    cpSync(FIXTURE_WORKSPACE, dir, { recursive: true });
    const app = createApp({ dataDir: dir, prebuiltEditor: true, now: () => NOW });
    const server = createServer(app.handle);
    await new Promise<void>((resolve) => server.listen(0, 'localhost', resolve));
    const { port } = server.address() as AddressInfo;
    const read = (file: string): string => readFileSync(join(dir, file), 'utf8');
    await use({ dir, url: `http://localhost:${port}/`, read, readModel: (file) => JSON.parse(read(file)) as ModelFile });
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  },

  page: async ({ page, allowedConsoleErrors }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(`uncaught: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const text = msg.text();
      if (!allowedConsoleErrors.some((re) => re.test(text))) errors.push(`console: ${text}`);
    });
    await use(page);
    expect(errors, 'errors in the page').toEqual([]);
  },

  editor: async ({ page, workspace }, use) => {
    const editor = new Editor(page, workspace.url);
    await editor.open();
    await use(editor);
  },
});

/** The attribute of a saved model, or undefined. */
export function savedAttribute(model: ModelFile, entity: string, attr: string): Record<string, unknown> | undefined {
  for (const section of model.entities[entity]?.sections ?? []) {
    const hit = section.attributes?.find((a) => a.name === attr);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

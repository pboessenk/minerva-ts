import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { type Editor, GOLDEN_DIR, expect, savedAttribute, test } from './fixtures.ts';

/** A one-entity model whose only attribute has a contradictory length range, so the server refuses to save it. */
const INVALID_NOTES_MODEL = JSON.stringify({
  version: '1.0.0',
  lastModified: '2026-01-02T03:04:05.000Z',
  entities: {
    Note: {
      description: 'A note.',
      root: true,
      sections: [{ name: null, attributes: [{ name: 'text', type: 'string', required: true, minLength: 5, maxLength: 2 }] }],
    },
  },
  enums: {},
  operations: [],
});

/** A contract that differs from the notes model: `pinned` is a string, `color` is extra, and it has an operation the model lacks. */
const NOTES_CONTRACT = JSON.stringify({
  openapi: '3.1.0',
  info: { title: 'Notes service', version: '9.9.9' },
  paths: {
    '/notes/{id}': {
      get: {
        operationId: 'getNote',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'A note', content: { 'application/json': { schema: { $ref: '#/components/schemas/Note' } } } } },
      },
    },
  },
  components: {
    schemas: {
      Note: {
        type: 'object',
        required: ['text'],
        properties: { text: { type: 'string' }, pinned: { type: 'string' }, color: { type: 'string' } },
      },
    },
  },
});

/** Replace the description of an attribute and leave the cell. */
async function editDescription(editor: Editor, entity: string, attr: string, text: string): Promise<void> {
  const cell = editor.attributeCell(entity, attr, 'description');
  await cell.click();
  await cell.locator('textarea').fill(text);
  await cell.locator('textarea').blur();
  await expect(cell).toHaveText(text);
}

/** Open the export prompt of a format, run `adjust` on the page, confirm, and return the filename and body. */
async function exportAs(page: Page, menuText: string, adjust?: (page: Page) => Promise<void>): Promise<{ filename: string; body: string }> {
  await page.locator('#editorExportBtn').click();
  await page.locator('.export-dropdown-item', { hasText: menuText }).click();
  await expect(page.locator('#filenamePrompt')).toBeVisible();
  await adjust?.(page);
  const pending = page.waitForEvent('download');
  await page.locator('#filenamePrompt .fn-prompt-confirm').click();
  const download = await pending;
  return { filename: download.suggestedFilename(), body: readFileSync(await download.path(), 'utf8') };
}

const golden = (file: string): string => readFileSync(join(GOLDEN_DIR, file), 'utf8');

const CONFLICT = /status of 409/;

test.describe('save', () => {
  test.describe('a model the server refuses', () => {
    test.use({ workspaceFiles: { 'notes_model.json': INVALID_NOTES_MODEL }, allowedConsoleErrors: /Save rejected|status of 400/ });

    test('shows the problem and leaves the file unchanged', async ({ editor, workspace }) => {
      const before = workspace.read('notes_model.json');
      await editor.openModel('Notes');
      await editor.openEntity('Note');
      await editDescription(editor, 'Note', 'text', 'Edited');
      await expect(editor.page.locator('#editorSaveBtn .dirty-dot')).toBeVisible();

      await editor.page.locator('#editorSaveBtn').click();

      await expect(editor.toast()).toContainText('Save rejected');
      await expect(editor.toast()).toContainText('Note.text');
      await expect(editor.toast()).toContainText('minLength (5) exceeds maxLength (2)');
      expect(workspace.read('notes_model.json')).toBe(before);
      await expect(editor.page.locator('#editorSaveBtn .dirty-dot')).toBeVisible();
    });
  });

  test('the unsaved-changes dot appears on edit and disappears after saving', async ({ editor }) => {
    await editor.openModel('Shop');
    await editor.openEntity('Order');
    await expect(editor.page.locator('#editorSaveBtn .dirty-dot')).toHaveCount(0);

    await editDescription(editor, 'Order', 'createdAt', 'Placed at.');
    await expect(editor.page.locator('#editorSaveBtn .dirty-dot')).toBeVisible();

    await editor.save();
    await expect(editor.page.locator('#editorSaveBtn .dirty-dot')).toHaveCount(0);
  });

  test.describe('a stale tab', () => {
    test.use({ allowedConsoleErrors: CONFLICT });
    test('that declines to overwrite keeps the version on disk', async ({ editor, workspace }) => {
      await editor.openModel('Shop');
      await editor.openEntity('Order');
      await editDescription(editor, 'Order', 'createdAt', 'From the stale tab.');

      // Another session saves in between.
      const other = { ...workspace.readModel('shop_model.json'), lastModified: '2027-05-06T07:08:09.000Z' };
      writeFileSync(join(workspace.dir, 'shop_model.json'), JSON.stringify(other, null, 2));
      const onDisk = workspace.read('shop_model.json');

      let message = '';
      editor.page.once('dialog', (d) => {
        message = d.message();
        void d.dismiss();
      });
      await editor.page.locator('#editorSaveBtn').click();

      await expect(editor.toast()).toContainText('Save cancelled');
      expect(message).toContain('changed since this tab loaded it');
      expect(workspace.read('shop_model.json')).toBe(onDisk);
      await expect(editor.page.locator('#editorSaveBtn .dirty-dot')).toBeVisible();
    });

    test('that agrees to overwrite replaces the version on disk', async ({ editor, workspace }) => {
      await editor.openModel('Shop');
      await editor.openEntity('Order');
      await editDescription(editor, 'Order', 'createdAt', 'From the stale tab.');

      const other = { ...workspace.readModel('shop_model.json'), lastModified: '2027-05-06T07:08:09.000Z' };
      writeFileSync(join(workspace.dir, 'shop_model.json'), JSON.stringify(other, null, 2));

      editor.page.once('dialog', (d) => void d.accept());
      await editor.page.locator('#editorSaveBtn').click();

      await expect(editor.toast()).toHaveText('Model saved to disk');
      const saved = workspace.readModel('shop_model.json');
      expect(savedAttribute(saved, 'Order', 'createdAt')?.['description']).toBe('From the stale tab.');
      expect(saved.lastModified).not.toBe('2027-05-06T07:08:09.000Z');
      await expect(editor.page.locator('#editorSaveBtn .dirty-dot')).toHaveCount(0);
    });
  });
});

test.describe('export', () => {
  const formats: { menu: string; filename: string; golden: string }[] = [
    { menu: 'OpenAPI', filename: 'shop_model.openapi', golden: 'shop/openapi.yaml' },
    { menu: 'TypeScript', filename: 'shop_model.typescript', golden: 'shop/typescript.ts' },
    { menu: 'CSV', filename: 'shop_model.csv', golden: 'shop/csv.csv' },
    { menu: 'HTML', filename: 'shop_model.html', golden: 'shop/html.html' },
  ];

  for (const format of formats) {
    test(`${format.menu} with default options equals ${format.golden}`, async ({ editor }) => {
      await editor.openModel('Shop');
      const { filename, body } = await exportAs(editor.page, format.menu);
      expect(filename).toBe(format.filename);
      expect(body).toBe(golden(format.golden));
    });
  }

  test('a single root entity exports only its part of the model', async ({ editor }) => {
    await editor.openModel('Shop');
    const { body } = await exportAs(editor.page, 'OpenAPI', async (page) => {
      const prompt = page.locator('#filenamePrompt');
      await prompt.getByLabel('All entities (full export)').uncheck();
      await prompt.getByLabel('Document', { exact: true }).uncheck();
      await prompt.getByLabel('Result', { exact: true }).uncheck();
    });
    expect(body).toBe(golden('shop/openapi@Order.yaml'));
  });

  test('the CSV options add empty rows and enums', async ({ editor }) => {
    await editor.openModel('Shop');
    const { body } = await exportAs(editor.page, 'CSV', async (page) => {
      const prompt = page.locator('#filenamePrompt');
      await expect(prompt.getByLabel('Export technical ENUMs')).toBeDisabled();
      await prompt.getByLabel('Add empty row between each entity').check();
      await prompt.getByLabel('Export ENUMs', { exact: true }).check();
      await prompt.getByLabel('Export technical ENUMs').check();
    });
    expect(body).toBe(golden('shop/csv-all.csv'));
  });

  test('unticking internal documentation gives the public HTML', async ({ editor }) => {
    await editor.openModel('Shop');
    const { body } = await exportAs(editor.page, 'HTML', async (page) => {
      await page.locator('#filenamePrompt').getByLabel('Include internal documentation').uncheck();
    });
    expect(body).toBe(golden('shop/html-public.html'));
    expect(body).not.toBe(golden('shop/html.html'));
  });

  test('a model with a single root has no scope options', async ({ editor }) => {
    await editor.openModel('Notes');
    const { filename, body } = await exportAs(editor.page, 'TypeScript', async (page) => {
      await expect(page.locator('#filenamePrompt').getByLabel('All entities (full export)')).toHaveCount(0);
    });
    expect(filename).toBe('notes_model.typescript');
    expect(body).toBe(golden('notes/typescript.ts'));
  });
});

test.describe('compare', () => {
  test('a source whose file is missing is not offered', async ({ editor }) => {
    await editor.openModel('Shop');
    await editor.page.locator('#editorCompareBtn').click();

    await expect(editor.page.getByRole('heading', { name: /Compare against OpenAPI/ })).toBeVisible();
    await expect(editor.page.getByRole('button', { name: 'Upload OpenAPI JSON…' })).toBeVisible();
    await expect(editor.page.locator('#caCompareActions button')).toHaveCount(1);
    await expect(editor.page.getByRole('button', { name: 'Upstream contract' })).toHaveCount(0);
  });

  test.describe('a source whose file exists', () => {
    // shop_model.json lists `contracts/missing.json`, relative to the folder that holds the data directory.
    test.use({
      workspaceFiles: {
        '../contracts/missing.json': JSON.stringify({
          openapi: '3.1.0',
          info: { title: 'Shop upstream', version: '3.0.0' },
          paths: {},
          components: { schemas: { Order: { type: 'object', properties: { orderId: { type: 'integer' } } } } },
        }),
      },
    });

    test('is offered and compared in one click', async ({ editor }) => {
      await editor.openModel('Shop');
      await editor.page.locator('#editorCompareBtn').click();
      await editor.page.getByRole('button', { name: 'Upstream contract' }).click();

      const body = editor.page.locator('#caCompareBody');
      await expect(body).toContainText('Shop upstream');
      await expect(body).toContainText('3.0.0');
      // orderId is a string in the model and an integer in the contract.
      const row = body.locator('tr', { hasText: 'type-mismatch' }).filter({ hasText: 'orderId' });
      await expect(row).toContainText('string');
      await expect(row).toContainText('integer');
    });
  });

  test('the report of an uploaded contract lists the differences', async ({ editor }) => {
    await editor.openModel('Notes');
    await editor.page.locator('#editorCompareBtn').click();

    const chooser = editor.page.waitForEvent('filechooser');
    await editor.page.getByRole('button', { name: 'Upload OpenAPI JSON…' }).click();
    await (await chooser).setFiles({ name: 'notes-service.json', mimeType: 'application/json', buffer: Buffer.from(NOTES_CONTRACT) });

    const body = editor.page.locator('#caCompareBody');
    await expect(body).toContainText('Notes service');
    await expect(body).toContainText('9.9.9');
    await expect(body).toContainText('notes-service.json');
    await expect(body).toContainText('1/1 schemas matched');
    await expect(body).toContainText('0/0 operations matched');

    const rowFor = (text: string) => body.locator('tr', { hasText: text });
    // The attribute type differs, and an extra property exists only in the contract.
    await expect(rowFor('pinned')).toContainText('boolean');
    await expect(rowFor('pinned')).toContainText('string');
    await expect(rowFor('color')).toBeVisible();
    // The contract has an operation the model lacks.
    await expect(rowFor('getNote')).toBeVisible();
  });

  test.describe('a contract the server rejects', () => {
    test.use({ allowedConsoleErrors: /status of 400/ });
    test('that is not JSON is reported as a failed comparison', async ({ editor }) => {
      await editor.openModel('Notes');
      await editor.page.locator('#editorCompareBtn').click();

      const chooser = editor.page.waitForEvent('filechooser');
      await editor.page.getByRole('button', { name: 'Upload OpenAPI JSON…' }).click();
      await (await chooser).setFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('not json') });

      await expect(editor.toast()).toContainText('Compare failed');
    });
  });
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GOLDEN_DIR, expect, savedAttribute, test } from './fixtures.ts';

test('opens a model and shows an entity with its attributes', async ({ editor }) => {
  await editor.openModel('Shop');

  await expect(editor.sidebarItem('Order')).toContainText('Order');
  await expect(editor.page.locator('#entityList')).toContainText('POST /orders');

  await editor.openEntity('Order');
  await expect(editor.attributeCell('Order', 'orderId', 'type')).toHaveText('string');
  await expect(editor.attributeCell('Order', 'orderId', 'sivi')).toHaveText('order.orderId');
});

test('saves an edited description to the model file', async ({ editor, workspace }) => {
  const before = workspace.readModel('shop_model.json');
  expect(savedAttribute(before, 'Order', 'createdAt')?.['description'] || '').toBe('');

  await editor.openModel('Shop');
  await editor.openEntity('Order');
  const cell = editor.attributeCell('Order', 'createdAt', 'description');
  await cell.click();
  await cell.locator('textarea').fill('When the order was placed.');
  await cell.locator('textarea').blur();
  await expect(cell).toHaveText('When the order was placed.');

  await editor.save();

  const after = workspace.readModel('shop_model.json');
  expect(savedAttribute(after, 'Order', 'createdAt')?.['description']).toBe('When the order was placed.');
  expect(after.lastModified).not.toBe(before.lastModified);
});

test('exports TypeSpec identical to the golden file', async ({ editor }) => {
  await editor.openModel('Shop');

  await editor.page.locator('#editorExportBtn').click();
  await editor.page.locator('.export-dropdown-item', { hasText: 'TypeSpec' }).click();
  const download = editor.page.waitForEvent('download');
  await editor.page.locator('#filenamePrompt .fn-prompt-confirm').click();

  const path = await (await download).path();
  const expected = readFileSync(join(GOLDEN_DIR, 'shop', 'typespec.tsp'), 'utf8');
  expect(readFileSync(path, 'utf8')).toBe(expected);
});

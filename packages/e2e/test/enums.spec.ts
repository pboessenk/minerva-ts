import type { Page } from '@playwright/test';
import { expect, savedAttribute, test } from './fixtures.ts';

interface SavedEnum {
  description?: string;
  values?: { name: string; value: string; label: string; description: string }[];
  openPoints?: { text: string; type: string }[];
}

function savedEnums(model: unknown): Record<string, SavedEnum> {
  return (model as { enums?: Record<string, SavedEnum> }).enums ?? {};
}

/** Fill the single-prompt overlay (new enum, rename) and confirm it. */
async function answerPrompt(page: Page, text: string): Promise<void> {
  await page.locator('.fn-prompt-input').fill(text);
  await page.locator('.fn-prompt-confirm').click();
}

/** Edit an enum value's cell: the column is Name, Value, Label or Description. */
async function editValueCell(page: Page, enumName: string, value: string, column: number, text: string): Promise<void> {
  const row = page.locator(`tr[data-enum="${enumName}"][data-val="${value}"]`);
  await row.locator('td').nth(column).click();
  const input = row.locator('input.ca-edit-input');
  await input.fill(text);
  await input.press('Enter');
}

test.beforeEach(async ({ editor }) => {
  await editor.openModel('Shop');
});

test('creates an enum, describes it and adds a value', async ({ editor, workspace }) => {
  const { page } = editor;
  await page.locator('.ca-sidebar-add-btn[title="New enum"]').click();
  await answerPrompt(page, 'PaymentState');
  await expect(editor.sidebarItem('enum:PaymentState')).toBeVisible();
  await expect(page.locator('#listView h1')).toContainText('PaymentState');
  await expect(page.locator('#listView')).toContainText('No values defined yet.');

  await page.locator('.ca-editable-desc').click();
  await page.locator('.ca-editable-desc textarea').fill('Where a payment stands.');
  await page.locator('.ca-editable-desc textarea').press('Enter');
  await expect(page.locator('.ca-editable-desc')).toHaveText('Where a payment stands.');

  await page.getByRole('button', { name: '+ Add Value' }).click();
  await page.locator('.ca-ev-codename-input').fill('PendingReview');
  // Value and label are suggested from the name.
  await expect(page.locator('.ca-ev-name-input')).toHaveValue('pending_review');
  await expect(page.locator('.ca-ev-caption-input')).toHaveValue('Pending review');
  await page.locator('.ca-ev-comment-input').fill('Waiting for a person.');
  await page.locator('.fn-prompt-confirm').click();

  await expect(page.locator('tr[data-enum="PaymentState"]')).toHaveCount(1);
  await expect(editor.sidebarItem('enum:PaymentState')).toContainText('1');

  await editor.save();
  expect(savedEnums(workspace.readModel('shop_model.json'))['PaymentState']).toEqual({
    description: 'Where a payment stands.',
    values: [{ name: 'PendingReview', value: 'pending_review', label: 'Pending review', description: 'Waiting for a person.' }],
  });
});

test('rejects invalid and duplicate enum names', async ({ editor, workspace }) => {
  const { page } = editor;
  const before = Object.keys(savedEnums(workspace.readModel('shop_model.json'))).sort();
  await page.locator('.ca-sidebar-add-btn[title="New enum"]').click();

  await answerPrompt(page, 'lowercase');
  await expect(editor.toast()).toHaveText('Enum name must be PascalCase');
  await answerPrompt(page, 'Channel');
  await expect(editor.toast()).toHaveText('Enum "Channel" already exists');
  await page.locator('.fn-prompt-cancel').click();
  await expect(page.locator('.fn-prompt')).toHaveCount(0);

  await editor.save();
  expect(Object.keys(savedEnums(workspace.readModel('shop_model.json'))).sort()).toEqual(before);
});

test('edits, adds and removes values and saves them', async ({ editor, workspace }) => {
  const { page } = editor;
  await editor.sidebarItem('enum:Channel').click();
  await expect(page.locator('#listView h3')).toHaveText('Values (3)');

  await editValueCell(page, 'Channel', 'store', 2, 'Physical shop');
  await expect(page.locator('tr[data-enum="Channel"][data-val="store"] .ca-ev-caption')).toHaveText('Physical shop');

  await editValueCell(page, 'Channel', 'store', 3, 'Bought at a counter.');
  await expect(page.locator('tr[data-enum="Channel"][data-val="store"] .ca-ev-comment-text')).toHaveText('Bought at a counter.');

  await editValueCell(page, 'Channel', 'phone_order', 1, 'phone');
  await expect(page.locator('tr[data-enum="Channel"][data-val="phone"]')).toBeVisible();

  await page.getByRole('button', { name: '+ Add Value' }).click();
  await page.locator('.ca-ev-codename-input').fill('Marketplace');
  await page.locator('.fn-prompt-confirm').click();
  await expect(page.locator('#listView h3')).toHaveText('Values (4)');

  await page.locator('tr[data-enum="Channel"][data-val="web"] .ca-delete-btn').click();
  await expect(page.locator('#listView h3')).toHaveText('Values (3)');

  await editor.save();
  const channel = savedEnums(workspace.readModel('shop_model.json'))['Channel'];
  expect(channel?.values?.map((v) => v.value)).toEqual(['store', 'phone', 'marketplace']);
  expect(channel?.values?.[0]).toMatchObject({ label: 'Physical shop', description: 'Bought at a counter.' });
  expect(channel?.values?.[2]).toMatchObject({ name: 'Marketplace', label: 'Marketplace' });
});

test('refuses a duplicate value', async ({ editor }) => {
  const { page } = editor;
  await editor.sidebarItem('enum:Channel').click();
  await page.getByRole('button', { name: '+ Add Value' }).click();
  await page.locator('.ca-ev-codename-input').fill('Web');
  await page.locator('.fn-prompt-confirm').click();
  await expect(editor.toast()).toHaveText('Value "web" already exists');
  await expect(page.locator('.fn-prompt')).toBeVisible();
  await page.locator('.fn-prompt-cancel').click();
  await expect(page.locator('#listView h3')).toHaveText('Values (3)');
});

test('renaming or removing a value follows into the allowed values of attributes', async ({ editor, workspace }) => {
  const { page } = editor;
  const before = savedAttribute(workspace.readModel('shop_model.json'), 'OrderLine', 'channelSubset');
  expect(before?.['allowedValues']).toEqual(['web']);

  await editor.sidebarItem('enum:Channel').click();
  await editValueCell(page, 'Channel', 'web', 1, 'online');
  await expect(page.locator('tr[data-enum="Channel"][data-val="online"]')).toBeVisible();
  await editor.save();
  expect(savedAttribute(workspace.readModel('shop_model.json'), 'OrderLine', 'channelSubset')?.['allowedValues']).toEqual(['online']);

  await page.locator('tr[data-enum="Channel"][data-val="online"] .ca-delete-btn').click();
  await expect(page.locator('tr[data-enum="Channel"][data-val="online"]')).toHaveCount(0);
  await editor.save();
  expect(savedAttribute(workspace.readModel('shop_model.json'), 'OrderLine', 'channelSubset')?.['allowedValues'] ?? null).toBeNull();
});

test('renaming an enum updates the attributes typed with it', async ({ editor, workspace }) => {
  const { page } = editor;
  await editor.sidebarItem('enum:Size').click();
  await page.locator('.ca-rename-btn').click();
  await answerPrompt(page, 'GarmentSize');

  await expect(editor.sidebarItem('enum:GarmentSize')).toBeVisible();
  await expect(editor.sidebarItem('enum:Size')).toHaveCount(0);
  await expect(page.locator('#listView h1')).toContainText('GarmentSize');

  await editor.openEntity('Order');
  await expect(editor.attributeCell('Order', 'sizes', 'type')).toHaveText('GarmentSize[]');

  await editor.save();
  const model = workspace.readModel('shop_model.json');
  const enums = savedEnums(model);
  expect(enums['Size']).toBeUndefined();
  expect(enums['GarmentSize']?.values).toHaveLength(3);
  expect(savedAttribute(model, 'Order', 'sizes')?.['type']).toBe('GarmentSize[]');
});

test('renaming to a name already in use is refused', async ({ editor }) => {
  const { page } = editor;
  await editor.sidebarItem('enum:Size').click();
  await page.locator('.ca-rename-btn').click();
  await answerPrompt(page, 'Order');
  await expect(editor.toast()).toHaveText('Name "Order" already exists');
  await expect(editor.sidebarItem('enum:Size')).toBeVisible();
});

test('deleting an enum asks first, removes it, and turns the attributes typed with it into strings', async ({ editor, workspace }) => {
  const { page } = editor;
  await editor.sidebarItem('enum:Channel').click();

  // Declining keeps the enum. The question names the attributes that use it.
  let question = '';
  page.once('dialog', (d) => {
    question = d.message();
    void d.dismiss();
  });
  await page.locator('.ca-danger-btn').click();
  await expect(editor.sidebarItem('enum:Channel')).toBeVisible();
  expect(question).toContain('Delete enum "Channel"?');
  expect(question).toContain('Order.channel');
  expect(question).toContain('OrderLine.channelSubset');

  page.once('dialog', (d) => void d.accept());
  await page.locator('.ca-danger-btn').click();
  await expect(editor.sidebarItem('enum:Channel')).toHaveCount(0);

  await editor.openEntity('OrderLine');
  await expect(editor.attributeCell('OrderLine', 'channelSubset', 'type')).toHaveText('string');

  await editor.save();
  const model = workspace.readModel('shop_model.json');
  expect(savedEnums(model)['Channel']).toBeUndefined();
  expect(savedAttribute(model, 'Order', 'channel')?.['type']).toBe('string');
  // The subset of the enum's values goes with the enum.
  expect(savedAttribute(model, 'OrderLine', 'channelSubset')).toMatchObject({ type: 'string', allowedValues: null });
});

test('adds, retypes, edits and removes open points on an enum', async ({ editor, workspace }) => {
  const { page } = editor;
  await editor.sidebarItem('enum:Channel').click();
  await expect(page.locator('.ca-banner')).toHaveCount(1);
  await expect(page.locator('.ca-banner-text').first()).toHaveText('Add marketplace?');

  await page.getByRole('button', { name: '+ Add note' }).click();
  await expect(page.locator('.ca-banner')).toHaveCount(2);
  const added = page.locator('.ca-banner').nth(1);
  await added.locator('.ca-banner-text').click();
  await added.locator('input').fill('Check with support');
  await added.locator('input').press('Enter');
  await expect(page.locator('.ca-banner-text').nth(1)).toHaveText('Check with support');
  await page.locator('.ca-banner-icon').nth(1).click();
  await expect(page.locator('.ca-banner').nth(1)).toHaveClass(/ca-banner-warning/);

  await page.locator('.ca-banner-delete').first().click();
  await expect(page.locator('.ca-banner')).toHaveCount(1);

  await editor.save();
  expect(savedEnums(workspace.readModel('shop_model.json'))['Channel']?.openPoints).toEqual([
    { text: 'Check with support', type: 'warning' },
  ]);
});

test('a new enum can be used as an attribute type', async ({ editor, workspace }) => {
  const { page } = editor;
  await page.locator('.ca-sidebar-add-btn[title="New enum"]').click();
  await answerPrompt(page, 'Priority');

  await editor.openEntity('OrderLine');
  const cell = editor.attributeCell('OrderLine', 'product', 'type');
  await cell.click();
  await cell.locator('select').selectOption('Priority');
  await expect(cell).toHaveText('Priority');

  await editor.save();
  const model = workspace.readModel('shop_model.json');
  expect(savedAttribute(model, 'OrderLine', 'product')?.['type']).toBe('Priority');
  expect(savedEnums(model)['Priority']).toBeDefined();
});

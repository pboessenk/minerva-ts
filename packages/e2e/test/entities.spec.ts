import { type Editor, expect, savedAttribute, test } from './fixtures.ts';

interface SavedEntity {
  description?: string;
  root?: boolean;
  excludeFromInclusion?: boolean;
  children?: { name: string; cardinality: string }[];
  openPoints?: { text: string; type: string }[];
}

/** The saved entities of the shop model, with the fields these tests look at. */
function savedEntities(model: unknown): Record<string, SavedEntity> {
  return (model as { entities: Record<string, SavedEntity> }).entities;
}

/** Fill in the name prompt that creating or renaming an entity opens, and confirm it. */
async function answerNamePrompt(editor: Editor, name: string): Promise<void> {
  const prompt = editor.page.locator('.fn-prompt');
  await prompt.locator('.fn-prompt-input').fill(name);
  await prompt.locator('.fn-prompt-confirm').click();
}

test.beforeEach(async ({ editor }) => {
  await editor.openModel('Shop');
});

test('creates an entity from the sidebar and saves it', async ({ editor, workspace }) => {
  await editor.page.getByTitle('New entity').click();
  await answerNamePrompt(editor, 'Voucher');

  await expect(editor.sidebarItem('Voucher')).toBeVisible();
  await expect(editor.page.locator('.ca-editable-desc')).toBeVisible();
  await expect(editor.page.getByText('No attributes defined yet.')).toBeVisible();

  await editor.save();
  const saved = savedEntities(workspace.readModel('shop_model.json'));
  expect(saved['Voucher']?.description).toBe('');
  expect(saved['Voucher']?.root).toBeFalsy();
  expect(saved['Order']).toBeDefined();
});

test('refuses a duplicate or malformed entity name', async ({ editor, workspace }) => {
  await editor.page.getByTitle('New entity').click();
  await answerNamePrompt(editor, 'Order');
  await expect(editor.toast()).toHaveText('Entity "Order" already exists');

  await editor.page.locator('.fn-prompt-input').fill('not pascal');
  await editor.page.locator('.fn-prompt-confirm').click();
  await expect(editor.toast()).toContainText('PascalCase');

  await editor.page.locator('.fn-prompt-cancel').click();
  await expect(editor.page.locator('.fn-prompt')).toHaveCount(0);

  await editor.save();
  const names = Object.keys(savedEntities(workspace.readModel('shop_model.json')));
  expect(names).not.toContain('not pascal');
  expect(names.filter((n) => n === 'Order')).toHaveLength(1);
});

test('renaming an entity updates attribute types and children that point at it', async ({ editor, workspace }) => {
  await editor.openEntity('OrderLine');
  await editor.page.getByTitle('Rename').click();
  await answerNamePrompt(editor, 'LineItem');

  await expect(editor.sidebarItem('LineItem')).toBeVisible();
  await expect(editor.sidebarItem('OrderLine')).toHaveCount(0);
  await expect(editor.page.locator('h2, h1').filter({ hasText: 'LineItem' }).first()).toBeVisible();

  await editor.openEntity('Order');
  await expect(editor.attributeCell('Order', 'lines', 'type')).toHaveText('LineItem[]');
  await expect(editor.page.locator('.ca-child-chip', { hasText: 'LineItem' })).toContainText('1..*');

  await editor.save();
  const model = workspace.readModel('shop_model.json');
  const saved = savedEntities(model);
  expect(saved['OrderLine']).toBeUndefined();
  expect(saved['LineItem']).toBeDefined();
  expect(savedAttribute(model, 'Order', 'lines')?.['type']).toBe('LineItem[]');
  expect(saved['Order']?.children?.map((c) => c.name)).toContain('LineItem');
  expect(saved['Order']?.children?.map((c) => c.name)).not.toContain('OrderLine');
});

test('deleting an entity asks first and keeps the types of attributes that used it', async ({ editor, workspace }) => {
  await editor.openEntity('Address');

  // Dismissing the confirmation keeps the entity.
  let message = '';
  editor.page.once('dialog', (d) => {
    message = d.message();
    void d.dismiss();
  });
  await editor.page.getByTitle('Delete', { exact: true }).click();
  await expect.poll(() => message).toContain('Delete entity "Address"?');
  expect(message).toContain('Order');
  await expect(editor.sidebarItem('Address')).toBeVisible();

  editor.page.once('dialog', (d) => void d.accept());
  await editor.page.getByTitle('Delete', { exact: true }).click();
  await expect(editor.sidebarItem('Address')).toHaveCount(0);

  await editor.save();
  const model = workspace.readModel('shop_model.json');
  const saved = savedEntities(model);
  expect(saved['Address']).toBeUndefined();
  expect(savedAttribute(model, 'Order', 'delivery')?.['type']).toBe('Address');
  expect(saved['Order']?.children?.map((c) => c.name)).not.toContain('Address');
  expect(saved['Party']?.children ?? []).toEqual([]);
});

test('the root and "do not pull related operations" checkboxes are saved', async ({ editor, workspace }) => {
  await editor.sidebarItem('Zeta').click();
  const root = editor.page.getByLabel('Root entity');
  const exclude = editor.page.getByLabel("Don't pull related operations into scope");
  await expect(root).not.toBeChecked();
  await root.check();
  await exclude.check();
  await expect(editor.sidebarItem('Zeta')).toHaveClass(/ca-root-entity/);

  // Order is a root; unchecking it removes the root styling.
  await editor.page.locator('#entityList').getByText('Order', { exact: true });
  await editor.save();
  let saved = savedEntities(workspace.readModel('shop_model.json'));
  expect(saved['Zeta']?.root).toBe(true);
  expect(saved['Zeta']?.excludeFromInclusion).toBe(true);

  await exclude.uncheck();
  await root.uncheck();
  await expect(editor.sidebarItem('Zeta')).not.toHaveClass(/ca-root-entity/);
  await editor.save();
  saved = savedEntities(workspace.readModel('shop_model.json'));
  expect(saved['Zeta']?.root).toBeFalsy();
  expect(saved['Zeta']?.excludeFromInclusion).toBeFalsy();
});

test('edits the entity description, multi-line, and saves it', async ({ editor, workspace }) => {
  await editor.openEntity('Asset');
  const desc = editor.page.locator('.ca-editable-desc');
  await expect(desc).toHaveText('An item in the order.');
  await desc.click();
  const box = desc.locator('textarea');
  await box.fill('A purchased item.\nIt has a make.');
  await box.press('Enter');
  await expect(desc).toHaveText(/A purchased item\.\s*It has a make\./);

  await editor.save();
  expect(savedEntities(workspace.readModel('shop_model.json'))['Asset']?.description).toBe('A purchased item.\nIt has a make.');
});

test('adds, edits and dismisses open points', async ({ editor, workspace }) => {
  await editor.openEntity('Order');
  const banners = editor.page.locator('.ca-banner');
  await expect(banners).toHaveCount(1);
  await expect(banners.first()).toContainText('Confirm rounding of totals');

  await editor.page.getByRole('button', { name: '+ Add note' }).click();
  await expect(banners).toHaveCount(2);
  await banners.nth(1).locator('.ca-banner-text').click();
  const input = banners.nth(1).locator('input');
  await input.fill('Check the delivery rules');
  await input.press('Enter');
  await expect(banners.nth(1)).toContainText('Check the delivery rules');

  await editor.save();
  expect(savedEntities(workspace.readModel('shop_model.json'))['Order']?.openPoints).toEqual([
    { text: 'Confirm rounding of totals', type: 'warning' },
    { text: 'Check the delivery rules', type: 'info' },
  ]);

  await banners.filter({ hasText: 'Confirm rounding of totals' }).locator('.ca-banner-delete').click();
  await expect(banners).toHaveCount(1);
  await editor.save();
  expect(savedEntities(workspace.readModel('shop_model.json'))['Order']?.openPoints).toEqual([
    { text: 'Check the delivery rules', type: 'info' },
  ]);
});

test('an attribute typed with another entity makes it a child with the matching cardinality', async ({ editor, workspace }) => {
  await editor.sidebarItem('Zeta').click();
  await editor.page.getByRole('button', { name: '+ Add Attribute' }).click();
  await expect(editor.attributeRows('Zeta')).toHaveCount(1);
  await expect(editor.page.locator('.ca-child-chip')).toHaveCount(0);

  await editor.attributeCell('Zeta', 'newAttribute', 'type').click();
  await editor.page.locator('select.ca-edit-select').selectOption('Address[]');
  await expect(editor.attributeCell('Zeta', 'newAttribute', 'type')).toHaveText('Address[]');
  await expect(editor.page.locator('.ca-child-chip')).toHaveText(/Address\s*\*/);

  await editor.save();
  const model = workspace.readModel('shop_model.json');
  expect(savedAttribute(model, 'Zeta', 'newAttribute')?.['type']).toBe('Address[]');
  expect(savedEntities(model)['Zeta']?.children).toEqual([{ name: 'Address', cardinality: '*' }]);
});

test('making an entity-typed attribute required updates the child cardinality', async ({ editor, workspace }) => {
  await editor.openEntity('Order');
  const row = editor.page.locator('tr[data-entity="Order"][data-attr="delivery"]');
  await row.locator('.ca-attr-required').check();
  await expect(editor.page.locator('.ca-child-chip', { hasText: 'Address' })).toHaveText(/Address\s*1\b/);

  await editor.save();
  const children = savedEntities(workspace.readModel('shop_model.json'))['Order']?.children;
  expect(children?.find((c) => c.name === 'Address')?.cardinality).toBe('1');
});

import { type Editor, expect, savedAttribute, test } from './fixtures.ts';

/** Open the Shop model on one of its entities. */
async function openShopEntity(editor: Editor, entity: string): Promise<void> {
  await editor.openModel('Shop');
  await editor.openEntity(entity);
}

/** Edit a text cell (input or textarea) and commit with a blur. */
async function editText(editor: Editor, entity: string, attr: string, field: string, value: string): Promise<void> {
  const cell = editor.attributeCell(entity, attr, field);
  await cell.click();
  const input = cell.locator('input, textarea');
  await input.fill(value);
  await input.blur();
}

test('adds an attribute and names it', async ({ editor, workspace }) => {
  await openShopEntity(editor, 'OrderLine');
  const before = await editor.attributeRows('OrderLine').count();

  await editor.page.getByRole('button', { name: '+ Add Attribute' }).click();
  // The new attribute opens straight in name editing.
  const nameInput = editor.attributeCell('OrderLine', 'newAttribute', 'name').locator('input');
  await expect(nameInput).toBeVisible();
  await nameInput.fill('discountCode');
  await nameInput.press('Enter');

  await expect(editor.attributeRows('OrderLine')).toHaveCount(before + 1);
  await expect(editor.attributeCell('OrderLine', 'discountCode', 'type')).toHaveText('string');

  await editor.save();
  const saved = savedAttribute(workspace.readModel('shop_model.json'), 'OrderLine', 'discountCode');
  expect(saved).toMatchObject({ name: 'discountCode', type: 'string', required: false });
});

test('edits name, type, format, description, example and notes', async ({ editor, workspace }) => {
  await openShopEntity(editor, 'OrderLine');

  await editText(editor, 'OrderLine', 'product', 'name', 'sku');
  await expect(editor.attributeCell('OrderLine', 'sku', 'name').locator('.ca-attr-name')).toHaveText('sku');

  await editor.attributeCell('OrderLine', 'ratio', 'type').click();
  await editor.attributeCell('OrderLine', 'ratio', 'type').locator('select').selectOption('integer');
  await expect(editor.attributeCell('OrderLine', 'ratio', 'type')).toHaveText('integer');

  await editText(editor, 'OrderLine', 'sku', 'description', 'Stock keeping unit.');
  await editText(editor, 'OrderLine', 'sku', 'example', 'SKU-123');
  await editText(editor, 'OrderLine', 'sku', 'notes', 'Set by the warehouse');
  await expect(editor.attributeCell('OrderLine', 'sku', 'description')).toHaveText('Stock keeping unit.');
  await expect(editor.attributeCell('OrderLine', 'sku', 'example')).toHaveText('SKU-123');
  await expect(editor.attributeCell('OrderLine', 'sku', 'notes')).toHaveText('Set by the warehouse');

  await editor.save();
  const model = workspace.readModel('shop_model.json');
  expect(savedAttribute(model, 'OrderLine', 'product')).toBeUndefined();
  expect(savedAttribute(model, 'OrderLine', 'sku')).toMatchObject({
    description: 'Stock keeping unit.',
    example: 'SKU-123',
    notes: 'Set by the warehouse',
  });
  expect(savedAttribute(model, 'OrderLine', 'ratio')).toMatchObject({ type: 'integer' });
});

test('picks a format from the dropdown', async ({ editor, workspace }) => {
  await openShopEntity(editor, 'OrderLine');
  const cell = editor.attributeCell('OrderLine', 'day', 'format');
  await cell.click();
  await cell.locator('select').selectOption('date');
  await expect(cell).toHaveText('date');

  await editor.save();
  expect(savedAttribute(workspace.readModel('shop_model.json'), 'OrderLine', 'day')).toMatchObject({ format: 'date' });
});

test('Escape cancels a cell edit', async ({ editor, workspace }) => {
  await openShopEntity(editor, 'Order');
  const cell = editor.attributeCell('Order', 'createdAt', 'description');
  await cell.click();
  await cell.locator('textarea').fill('Should not be kept');
  await cell.locator('textarea').press('Escape');
  await expect(cell.locator('textarea')).toHaveCount(0);
  await expect(cell).not.toContainText('Should not be kept');

  const name = editor.attributeCell('Order', 'createdAt', 'name');
  await name.click();
  await name.locator('input').fill('renamed');
  await name.locator('input').press('Escape');
  await expect(name.locator('.ca-attr-name')).toHaveText('createdAt');

  await editor.save();
  const saved = savedAttribute(workspace.readModel('shop_model.json'), 'Order', 'createdAt');
  expect(saved?.['description'] || '').toBe('');
  expect(saved?.['name']).toBe('createdAt');
});

test('Escape in the SIVI reference picker keeps the old value', async ({ editor, workspace }) => {
  await openShopEntity(editor, 'Order');
  const sivi = editor.attributeCell('Order', 'orderId', 'sivi');
  await sivi.click();
  await sivi.locator('input').fill('order.quant');
  await sivi.locator('input').press('Escape');
  await expect(sivi).toHaveText('order.orderId');
  // The input saves 150 ms after it loses focus; wait past that, so a save
  // after the cancel would have happened, then check it didn't.
  await editor.page.waitForTimeout(400);
  await expect(sivi).toHaveText('order.orderId');
  await editor.save();
  expect(savedAttribute(workspace.readModel('shop_model.json'), 'Order', 'orderId')?.['siviReference']).toBe('order.orderId');
});

test('toggles the required checkbox', async ({ editor, workspace }) => {
  await openShopEntity(editor, 'Order');
  const row = editor.page.locator('tr[data-entity="Order"][data-attr="deliveryDate"]');
  const box = row.locator('input.ca-attr-required');
  await expect(box).not.toBeChecked();
  await box.check();
  await expect(box).toBeChecked();

  await editor.save();
  expect(savedAttribute(workspace.readModel('shop_model.json'), 'Order', 'deliveryDate')?.['required']).toBe(true);
});

test('picks a SIVI reference, a codelist and a restricted set of allowed values', async ({ editor, workspace }) => {
  await openShopEntity(editor, 'OrderLine');

  const sivi = editor.attributeCell('OrderLine', 'product', 'sivi');
  await sivi.click();
  await sivi.locator('input').fill('order.quant');
  await editor.page.locator('.ca-autocomplete-item[data-path="order.quantity"]').click();
  await expect(sivi).toContainText('order.quantity');

  // Right after a pick, the next editor opens and stays open.
  const codelist = editor.attributeCell('OrderLine', 'product', 'codelist');
  await codelist.click();
  await codelist.locator('input').fill('clr');
  const suggestion = editor.page.locator('.ca-autocomplete-item[data-name="CLR001"]');
  await expect(suggestion).toHaveCount(1);
  // The suggestion previews the first codes.
  await expect(suggestion.locator('.ca-ac-desc')).toHaveText('01, 02, 10, … (+2)');
  await suggestion.click();
  await expect(codelist).toHaveText('CLR001');

  // Picking the codelist enables the allowed-values picker; import two codes.
  const allowed = editor.attributeCell('OrderLine', 'product', 'allowed');
  await expect(allowed).toHaveText('all');
  await allowed.click();
  const popup = editor.page.locator('.ca-av-popup');
  await expect(popup).toContainText('CLR001');
  await popup.locator('[data-action="import"]').click();
  const dialog = editor.page.locator('.fn-prompt-overlay');
  await dialog.locator('textarea').fill('01, nope');
  await dialog.locator('[data-action="review"]').click();
  await expect(dialog.locator('.fn-prompt-error')).toContainText('nope');
  await dialog.locator('textarea').fill('01, 02');
  await dialog.locator('[data-action="review"]').click();
  await dialog.locator('[data-action="apply"]').click();
  await expect(popup.locator('.ca-av-item input:checked')).toHaveCount(2);
  await popup.locator('.ca-av-btn-save').click();
  await expect(allowed).toHaveText('2');

  await editor.save();
  expect(savedAttribute(workspace.readModel('shop_model.json'), 'OrderLine', 'product')).toMatchObject({
    siviReference: 'order.quantity',
    siviCodelist: 'CLR001',
    allowedValues: ['01', '02'],
  });
});

test('adds, renames and fills a group, and drags an attribute between groups', async ({ editor, workspace }) => {
  await openShopEntity(editor, 'Address');

  // Drag "street" (group Street) down onto "country" (group Location & region).
  await editor.page
    .locator('tr[data-entity="Address"][data-attr="street"] .ca-drag-handle')
    .dragTo(editor.attributeRows('Address').filter({ has: editor.page.locator('[data-field="name"]', { hasText: 'country' }) }));

  await editor.page.getByRole('button', { name: '+ Add Group' }).click();
  const label = editor.page.locator('tr[data-section-entity="Address"] .ca-section-label input');
  await expect(label).toBeVisible();
  await label.fill('Extras');
  await label.press('Enter');
  await expect(editor.page.locator('tr[data-section-entity="Address"] .ca-section-label', { hasText: 'Extras' })).toBeVisible();

  await editor.save();
  const sections = workspace.readModel('shop_model.json').entities['Address']?.sections ?? [];
  // No empty unnamed section is added in front: the file starts with a group, as it did.
  const names = sections.map((s) => (s as { name?: string | null }).name);
  expect(names).toEqual(['Street', 'Location & region', 'Extras']);
  expect(sections[0]?.attributes?.map((a) => a.name)).toEqual(['houseNumber']);
  expect(sections[1]?.attributes?.map((a) => a.name)).toEqual(['city', 'street', 'country']);
  expect(sections[2]?.attributes ?? []).toEqual([]);
});

test('reorders attributes by dragging a row', async ({ editor, workspace }) => {
  await openShopEntity(editor, 'Result');
  await editor.page
    .locator('tr[data-entity="Result"][data-attr="id"] .ca-drag-handle')
    .dragTo(editor.page.locator('tr[data-entity="Result"][data-attr="warnings"]'));
  await expect(editor.attributeRows('Result').nth(1)).toHaveAttribute('data-attr', 'id');

  await editor.save();
  const attrs = workspace.readModel('shop_model.json').entities['Result']?.sections?.[0]?.attributes;
  expect(attrs?.map((a) => a.name)).toEqual(['accepted', 'id', 'warnings']);
});

test('limits the applicable subtypes of an attribute', async ({ editor, workspace }) => {
  await openShopEntity(editor, 'Party');
  const cell = editor.attributeCell('Party', 'email', 'subtypes');
  await expect(cell).toHaveText('all');
  await cell.click();
  const popup = editor.page.locator('.ca-st-popup');
  await expect(popup).toContainText('Applicable subtypes for email');
  await popup.locator('input[data-code="company"]').uncheck();
  await popup.locator('.ca-av-btn-save').click();
  await expect(cell).toHaveText('1');

  await editor.save();
  expect(savedAttribute(workspace.readModel('shop_model.json'), 'Party', 'email')?.['applicableSubtypes']).toEqual(['privatePerson']);
});

test('toggles the SIVI and Documentation columns and filters the attributes', async ({ editor }) => {
  await openShopEntity(editor, 'Order');
  const table = editor.page.locator('.ca-attr-table');
  await expect(table.locator('th.col-siviref')).toBeVisible();
  await expect(table.locator('th.col-desc')).toBeVisible();

  await editor.page.locator('.ca-colgroup-btn[data-group="sivi"]').click();
  await expect(table.locator('th.col-siviref')).toHaveCount(0);
  await expect(table.locator('th.col-sivipeek')).toBeVisible();
  await editor.page.locator('.ca-colgroup-btn[data-group="docs"]').click();
  await expect(table.locator('th.col-desc')).toHaveCount(0);
  await expect(table.locator('th.col-docspeek')).toBeVisible();
  await editor.page.locator('.ca-colgroup-btn[data-group="sivi"]').click();
  await editor.page.locator('.ca-colgroup-btn[data-group="docs"]').click();
  await expect(table.locator('th.col-siviref')).toBeVisible();
  await expect(table.locator('th.col-desc')).toBeVisible();

  // The filter matches names and cell text, and hides the other rows.
  await editor.page.locator('#caAttrFilter').fill('gift');
  await expect(editor.attributeRows('Order').locator('visible=true')).toHaveCount(1);
  await expect(editor.page.locator('tr[data-entity="Order"][data-attr="giftWrap"]')).toBeVisible();
  await expect(editor.page.locator('tr[data-entity="Order"][data-attr="orderId"]')).toBeHidden();
  await editor.page.locator('#caAttrFilter').fill('Preferred colour');
  await expect(editor.page.locator('tr[data-entity="Order"][data-attr="colour"]')).toBeVisible();
  await expect(editor.page.locator('tr[data-entity="Order"][data-attr="giftWrap"]')).toBeHidden();
  await editor.page.locator('#caAttrFilter').fill('');
  await expect(editor.page.locator('tr[data-entity="Order"][data-attr="giftWrap"]')).toBeVisible();
});

test('deletes an attribute after confirming', async ({ editor, workspace }) => {
  await openShopEntity(editor, 'OrderLine');
  const row = editor.page.locator('tr[data-entity="OrderLine"][data-attr="blob"]');

  // Declining keeps it.
  editor.page.once('dialog', (d) => d.dismiss());
  await row.locator('.col-delete button').click();
  await expect(row).toBeVisible();

  editor.page.once('dialog', (d) => d.accept());
  await row.locator('.col-delete button').click();
  await expect(row).toHaveCount(0);

  await editor.save();
  const model = workspace.readModel('shop_model.json');
  expect(savedAttribute(model, 'OrderLine', 'blob')).toBeUndefined();
  expect(savedAttribute(model, 'OrderLine', 'secret')).toBeDefined();
});

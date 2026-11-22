import type { Locator } from '@playwright/test';
import { type Editor, expect, savedAttribute, test } from './fixtures.ts';

/** Open the Rules popup of an attribute of the Shop model. */
async function openRules(editor: Editor, entity: string, attr: string): Promise<Locator> {
  await editor.openModel('Shop');
  await editor.openEntity(entity);
  await editor.attributeCell(entity, attr, 'constraints').click();
  const popup = editor.page.locator('.ca-constraint-popup');
  await expect(popup).toBeVisible();
  return popup;
}

/** The table row of an attribute. */
const input = (popup: Locator, key: string): Locator => popup.locator(`[data-key="${key}"]`);
const message = (popup: Locator): Locator => popup.locator('.ca-cons-msg');
const saveButton = (popup: Locator): Locator => popup.locator('.ca-av-btn-save');

/** The keys of the popup's inputs, in display order. */
async function shownKeys(popup: Locator): Promise<(string | null)[]> {
  return popup.locator('[data-key]').evaluateAll((els) => els.map((el) => el.getAttribute('data-key')));
}

test('string rules: only string fields are offered and values are saved with their JSON types', async ({ editor, workspace }) => {
  const popup = await openRules(editor, 'Party', 'email');
  expect(await shownKeys(popup)).toEqual(['minLength', 'maxLength', 'pattern', 'default']);

  await input(popup, 'minLength').fill('5');
  await input(popup, 'maxLength').fill('60');
  await input(popup, 'pattern').fill('^[a-z]+@example\\.com$');
  await input(popup, 'default').fill('team@example.com');
  await expect(message(popup)).not.toHaveClass(/ca-cons-error/);
  await saveButton(popup).click();
  await expect(popup).toBeHidden();

  await expect(editor.attributeRow('Party', 'email')).toHaveAttribute(
    'data-constraints',
    'minLength: 5 maxLength: 60 pattern: ^[a-z]+@example\\.com$ default: team@example.com',
  );
  await editor.save();

  const email = savedAttribute(workspace.readModel('shop_model.json'), 'Party', 'email');
  expect(email).toMatchObject({
    minLength: 5,
    maxLength: 60,
    pattern: '^[a-z]+@example\\.com$',
    default: 'team@example.com',
  });
});

test('number rules: bounds are saved as JSON numbers and the exclusive box picks the exclusive keyword', async ({ editor, workspace }) => {
  const popup = await openRules(editor, 'OrderLine', 'ratio');
  expect(await shownKeys(popup)).toEqual(['minimum', 'maximum', 'default']);

  await input(popup, 'minimum').fill('0.5');
  await input(popup, 'maximum').fill('10');
  await popup.locator('[data-excl="maximum"]').check();
  await input(popup, 'default').fill('2.5');
  await saveButton(popup).click();
  await expect(popup).toBeHidden();
  await editor.save();

  const ratio = savedAttribute(workspace.readModel('shop_model.json'), 'OrderLine', 'ratio');
  expect(ratio).toMatchObject({ minimum: 0.5, exclusiveMaximum: 10, default: '2.5' });
  expect(ratio?.['maximum'] ?? null).toBeNull();

  // Reopening shows the exclusive bound again, with its box ticked.
  await editor.attributeCell('OrderLine', 'ratio', 'constraints').click();
  await expect(input(popup, 'maximum')).toHaveValue('10');
  await expect(popup.locator('[data-excl="maximum"]')).toBeChecked();
});

test('the popup offers only what the type supports, and nothing for codelist or enum types', async ({ editor }) => {
  await editor.openModel('Shop');
  await editor.openEntity('Order');
  const popup = editor.page.locator('.ca-constraint-popup');

  // Array of plain strings: item bounds next to the element rules, no default.
  await editor.attributeCell('Order', 'tags', 'constraints').click();
  expect(await shownKeys(popup)).toEqual(['minLength', 'maxLength', 'pattern', 'minItems', 'maxItems']);
  await popup.locator('.ca-av-btn-cancel').click();
  await expect(popup).toBeHidden();

  // Number array: element bounds and item bounds.
  await editor.attributeCell('Order', 'ratings', 'constraints').click();
  expect(await shownKeys(popup)).toEqual(['minimum', 'maximum', 'minItems', 'maxItems']);
  await popup.locator('.ca-av-btn-cancel').click();

  // Boolean: a true/false choice only.
  await editor.attributeCell('Order', 'giftWrap', 'constraints').click();
  expect(await shownKeys(popup)).toEqual(['default']);
  await expect(input(popup, 'default').locator('option')).toHaveText(['(none)', 'true', 'false']);
  await popup.locator('.ca-av-btn-cancel').click();

  // Codelist, allowed values and an enum type: no rules, so no popup.
  for (const attr of ['colour', 'status', 'channel']) {
    await expect(editor.attributeCell('Order', attr, 'constraints')).toHaveText('—');
    await editor.attributeCell('Order', attr, 'constraints').click();
    await expect(popup).toBeHidden();
  }
});

test('wrong input shows a message, disables Save and leaves the model unchanged', async ({ editor, workspace }) => {
  const before = workspace.read('shop_model.json');
  const popup = await openRules(editor, 'Party', 'email');
  const error = message(popup);

  await input(popup, 'minLength').fill('9');
  await input(popup, 'maxLength').fill('4');
  await expect(error).toContainText('minLength (9) exceeds maxLength (4)');
  await expect(saveButton(popup)).toBeDisabled();

  await input(popup, 'minLength').fill('two');
  await expect(error).toContainText('Min length must be a whole number');
  await expect(saveButton(popup)).toBeDisabled();

  await input(popup, 'minLength').fill('');
  await input(popup, 'maxLength').fill('');
  await input(popup, 'pattern').fill('^[a-z]+$');
  await input(popup, 'default').fill('NOT-LOWER');
  await expect(error).toContainText('default does not match the pattern');
  await expect(saveButton(popup)).toBeDisabled();

  await input(popup, 'pattern').fill('([');
  await expect(error).toContainText('Pattern:');
  await expect(saveButton(popup)).toBeDisabled();

  // Escape closes the popup without applying anything.
  await editor.page.keyboard.press('Escape');
  await expect(popup).toBeHidden();
  await editor.save();
  const saved = savedAttribute(workspace.readModel('shop_model.json'), 'Party', 'email');
  for (const key of ['minLength', 'maxLength', 'pattern', 'default']) expect(saved?.[key] ?? null).toBeNull();
  expect(Object.keys(JSON.parse(before).entities)).toEqual(Object.keys(workspace.readModel('shop_model.json').entities));
});

test('number bounds and defaults are checked against each other', async ({ editor }) => {
  const popup = await openRules(editor, 'OrderLine', 'ratio');
  const error = message(popup);

  await input(popup, 'minimum').fill('abc');
  await expect(error).toContainText('Minimum must be a number');
  await expect(saveButton(popup)).toBeDisabled();

  await input(popup, 'minimum').fill('10');
  await input(popup, 'maximum').fill('5');
  await expect(error).toContainText('lower bound 10 exceeds upper bound 5');
  await expect(saveButton(popup)).toBeDisabled();

  await input(popup, 'minimum').fill('1');
  await input(popup, 'maximum').fill('5');
  await input(popup, 'default').fill('7');
  await expect(error).toContainText('above maximum 5');
  await expect(saveButton(popup)).toBeDisabled();

  await input(popup, 'default').fill('3');
  await expect(error).not.toHaveClass(/ca-cons-error/);
  await expect(saveButton(popup)).toBeEnabled();
});

test('changing the type drops the constraints that no longer apply', async ({ editor, workspace }) => {
  await editor.openModel('Shop');
  await editor.openEntity('Order');

  // integer -> string[]: bounds and default go, nothing else is invented.
  const quantity = editor.attributeCell('Order', 'quantity', 'type');
  await quantity.click();
  await quantity.locator('select').selectOption('string[]');
  await expect(editor.attributeCell('Order', 'quantity', 'type')).toHaveText('string[]');
  await expect(editor.attributeRow('Order', 'quantity')).not.toHaveAttribute('data-constraints');

  // string[] -> boolean: element and item rules go.
  const tags = editor.attributeCell('Order', 'tags', 'type');
  await tags.click();
  await tags.locator('select').selectOption('boolean');
  await expect(editor.attributeCell('Order', 'tags', 'type')).toHaveText('boolean');

  await editor.save();
  const model = workspace.readModel('shop_model.json');
  const savedQuantity = savedAttribute(model, 'Order', 'quantity');
  for (const key of ['minimum', 'maximum', 'default']) expect(savedQuantity?.[key] ?? null).toBeNull();
  const savedTags = savedAttribute(model, 'Order', 'tags');
  for (const key of ['minItems', 'maxItems', 'pattern', 'maxLength']) expect(savedTags?.[key] ?? null).toBeNull();
  // A rule that still applies to the new type is kept as it was.
  expect(savedAttribute(model, 'Order', 'giftWrap')).toMatchObject({ default: 'TRUE' });
});

test('the row summary and tooltip list the set rules, and Clear all removes them', async ({ editor, workspace }) => {
  await editor.openModel('Shop');
  await editor.openEntity('Order');
  const row = (attr: string): Locator => editor.attributeRow('Order', attr);

  await expect(row('total')).toHaveAttribute('data-constraints', 'minimum: 0 exclusiveMaximum: 1000000');
  await expect(row('quantity')).toHaveAttribute('data-constraints', 'minimum: 1 maximum: 99 default: 1');
  await expect(row('giftWrap')).toHaveAttribute('data-constraints', 'default: true');
  await expect(row('createdAt')).not.toHaveAttribute('data-constraints');
  await expect(editor.attributeCell('Order', 'total', 'constraints').locator('.ca-constraint-icon')).toHaveAttribute(
    'title',
    'minimum: 0\nexclusiveMaximum: 1000000',
  );

  await editor.attributeCell('Order', 'total', 'constraints').click();
  await editor.page.locator('.ca-constraint-popup .ca-av-btn-clear').click();
  await expect(editor.page.locator('.ca-constraint-popup')).toBeHidden();
  await expect(row('total')).not.toHaveAttribute('data-constraints');
  await expect(editor.attributeCell('Order', 'total', 'constraints').locator('.ca-constraint-icon')).toHaveAttribute(
    'title',
    'Add validation rules',
  );

  await editor.save();
  const total = savedAttribute(workspace.readModel('shop_model.json'), 'Order', 'total');
  for (const key of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum']) expect(total?.[key] ?? null).toBeNull();
});

test('a boolean default stored in capitals shows in the select and survives saving the popup', async ({ editor, workspace }) => {
  // The fixture stores giftWrap's default as "TRUE".
  const popup = await openRules(editor, 'Order', 'giftWrap');
  await expect(input(popup, 'default')).toHaveValue('true');
  await popup.locator('.ca-av-btn-save').click();
  await expect(popup).toBeHidden();

  await editor.save();
  expect(savedAttribute(workspace.readModel('shop_model.json'), 'Order', 'giftWrap')?.['default']).toBe('true');
});

import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { type Editor, type Workspace, expect, test } from './fixtures.ts';

interface SavedOperation {
  id: string;
  method: string;
  path: string;
  summary?: string;
  description?: string;
  tags?: string[];
  requestBody?: string | null;
  requestBodyArray?: boolean;
  parameters?: { name: string; in: string; type: string; required: boolean; description?: string }[];
  responses: Record<string, { description?: string; schema?: string; responseBodyArray?: boolean }>;
}

interface SavedExample {
  id: string;
  operationId: string;
  technicalName?: string;
  summary?: string;
  parameterValues?: Record<string, string>;
  request?: unknown;
  response?: unknown;
  responseCode?: string;
}

interface SavedModel {
  operations: SavedOperation[];
  examples: SavedExample[];
}

function saved(workspace: Workspace, file = 'shop_model.json'): SavedModel {
  return JSON.parse(workspace.read(file)) as SavedModel;
}

function op(model: SavedModel, id: string): SavedOperation {
  const found = model.operations.find((o) => o.id === id);
  if (found === undefined) throw new Error(`operation ${id} not in the saved model`);
  return found;
}

function example(model: SavedModel, id: string): SavedExample {
  const found = model.examples.find((e) => e.id === id);
  if (found === undefined) throw new Error(`example ${id} not in the saved model`);
  return found;
}

/** Open an operation's detail page from the sidebar. */
async function openOperation(editor: Editor, id: string): Promise<void> {
  await editor.openModel('Shop');
  await editor.sidebarItem(`op:${id}`).click();
  await expect(editor.page.locator('#listView h1 .ca-op-path')).toBeVisible();
}

/** Open an example's page from the sidebar. */
async function openExample(editor: Editor, id: string): Promise<void> {
  await editor.sidebarItem(`ex:${id}`).click();
  await expect(editor.page.locator('#exFormContainer')).toBeVisible();
}

/** The input, select or checkbox of a form field, by its data-path. */
function field(page: Page, path: string) {
  return page.locator(`#exFormContainer [data-path=${JSON.stringify(path)}]`).first();
}

/** Fill the dialog of a new example and create it. */
async function createExample(page: Page, id: string, techName: string, summary: string): Promise<void> {
  await page.getByRole('button', { name: '+ Add Example' }).click();
  await page.locator('#exNewId').fill(id);
  await page.locator('#exNewTechName').fill(techName);
  await page.locator('#exNewSummary').fill(summary);
  await page.locator('.fn-prompt-confirm').click();
  await expect(page.locator('#exFormContainer')).toBeVisible();
}

test('creates an endpoint from the sidebar and saves it', async ({ editor, workspace }) => {
  const page = editor.page;
  await editor.openModel('Shop');

  await page.getByTitle('New endpoint').click();
  await page.locator('#opNewMethod').selectOption('PUT');
  await page.locator('#opNewPath').fill('/quotes/{quoteId}');
  // The operation id is suggested from method and path until it is typed over.
  await expect(page.locator('#opNewId')).toHaveValue('putQuotesQuoteId');
  await page.locator('#opNewSummary').fill('Replace a quote');
  await page.locator('#opNewTags').fill('quotes, , pricing');
  await page.locator('#opNewReqBody').fill('Address');
  await page.locator('#opNewReqArray').check();
  await page.locator('.fn-prompt-confirm').click();

  await expect(page.locator('#listView h1')).toContainText('PUT');
  await expect(page.locator('#listView h1 .ca-op-path')).toHaveText('/quotes/{quoteId}');
  await expect(page.locator('#listView .ca-op-tags .ca-tag-badge')).toHaveText(['quotes', 'pricing']);
  await expect(page.locator('#listView .ca-code-card')).toContainText('Address[]');
  await expect(editor.sidebarItem('op:putQuotesQuoteId')).toContainText('/quotes/{quoteId}');

  await editor.save();
  expect(op(saved(workspace), 'putQuotesQuoteId')).toMatchObject({
    method: 'PUT',
    path: '/quotes/{quoteId}',
    summary: 'Replace a quote',
    tags: ['quotes', 'pricing'],
    requestBody: 'Address',
    requestBodyArray: true,
    responses: {},
  });
  expect(workspace.readModel('shop_model.json').lastModified).toBeDefined();
});

test('refuses an endpoint without a path or with a taken id', async ({ editor, workspace }) => {
  const page = editor.page;
  await editor.openModel('Shop');
  const before = workspace.read('shop_model.json');

  await page.getByTitle('New endpoint').click();
  await page.locator('#opNewId').fill('anything');
  await page.locator('.fn-prompt-confirm').click();
  await expect(editor.toast()).toHaveText('ID and Path are required');

  await page.locator('#opNewPath').fill('/other');
  await page.locator('#opNewId').fill('getOrder');
  await page.locator('.fn-prompt-confirm').click();
  await expect(editor.toast()).toHaveText('Operation ID already exists');

  // The dialog stays open so the input is not lost; cancelling leaves the model alone.
  await expect(page.locator('#opNewPath')).toHaveValue('/other');
  await page.locator('.fn-prompt-cancel').click();
  await expect(page.locator('#opNewPath')).toHaveCount(0);
  await editor.save();
  expect(saved(workspace).operations.map((o) => o.id)).toEqual(JSON.parse(before).operations.map((o: SavedOperation) => o.id));
});

test('edits method, path, id and request body, and the summary, description and tags in place', async ({ editor, workspace }) => {
  const page = editor.page;
  await openOperation(editor, 'getOrder');

  await page.locator('#listView h1 .ca-rename-btn').click();
  await page.locator('#opEditMethod').selectOption('POST');
  await page.locator('#opEditPath').fill('/orders/lookup');
  await page.locator('#opEditId').fill('lookupOrder');
  await page.locator('#opEditTags').fill('orders, lookup');
  await page.locator('#opEditReqBody').fill('Party');
  await page.locator('#opEditReqArray').check();
  await page.locator('.fn-prompt-confirm').click();

  await expect(page.locator('#listView h1 .ca-op-path')).toHaveText('/orders/lookup');
  await expect(page.locator('#listView .ca-code-card')).toContainText('Party[]');

  await page.locator('.ca-editable-op-field[data-field="summary"]').click();
  await page.locator('.ca-editable-op-field[data-field="summary"] input').fill('Look an order up');
  await page.keyboard.press('Enter');
  await expect(page.locator('.ca-editable-op-field[data-field="summary"]')).toHaveText('Look an order up');

  await page.locator('.ca-editable-op-field[data-field="description"]').click();
  await page.locator('.ca-editable-op-field[data-field="description"] textarea').fill('Finds an order by id.');
  await page.keyboard.press('Enter');
  await expect(page.locator('.ca-editable-op-field[data-field="description"]')).toHaveText('Finds an order by id.');

  await page.locator('.ca-op-tags').click();
  await page.locator('.ca-op-tags input').fill('lookup');
  await page.keyboard.press('Enter');
  await expect(page.locator('.ca-op-tags .ca-tag-badge')).toHaveText(['lookup']);

  await editor.save();
  const model = saved(workspace);
  expect(model.operations.some((o) => o.id === 'getOrder')).toBe(false);
  expect(op(model, 'lookupOrder')).toMatchObject({
    method: 'POST',
    path: '/orders/lookup',
    summary: 'Look an order up',
    description: 'Finds an order by id.',
    tags: ['lookup'],
    requestBody: 'Party',
    requestBodyArray: true,
  });
  // Examples follow their operation to the new id.
  expect(model.examples.filter((e) => e.operationId === 'lookupOrder').map((e) => e.id)).toEqual(['fetch', 'fetch-missing']);
  expect(model.examples.some((e) => e.operationId === 'getOrder')).toBe(false);
});

test('adds, edits and removes parameters', async ({ editor, workspace }) => {
  const page = editor.page;
  await openOperation(editor, 'getOrder');
  const rows = page.locator('#listView .section', { has: page.getByRole('heading', { name: /Parameters/ }) }).locator('tbody tr');
  await expect(rows).toHaveCount(1);

  await page.getByRole('button', { name: '+ Add Parameter' }).click();
  await expect(rows).toHaveCount(2);
  const added = rows.nth(1);

  await added.locator('.ca-param-name').click();
  await added.locator('.ca-param-name input').fill('expand');
  await page.keyboard.press('Enter');
  await expect(added.locator('.ca-param-name')).toHaveText('expand');

  await added.locator('.ca-param-in').click();
  await added.locator('.ca-param-in select').selectOption('query');
  await expect(added.locator('.ca-param-in')).toHaveText('query');

  await added.locator('.ca-param-type').click();
  await added.locator('.ca-param-type input').fill('boolean');
  await page.keyboard.press('Enter');
  await expect(added.locator('.ca-param-type')).toHaveText('boolean');

  await added.locator('.ca-param-desc').click();
  await added.locator('.ca-param-desc input').fill('Include the lines.');
  await page.keyboard.press('Enter');
  await expect(added.locator('.ca-param-desc')).toHaveText('Include the lines.');

  await added.locator('input[type=checkbox]').uncheck();

  // Remove the path parameter that was there from the start.
  await rows.first().getByTitle('Delete parameter').click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator('.ca-param-name')).toHaveText('expand');

  await editor.save();
  expect(op(saved(workspace), 'getOrder').parameters).toEqual([
    { name: 'expand', in: 'query', type: 'boolean', required: false, description: 'Include the lines.' },
  ]);
});

test('adds, edits and removes responses', async ({ editor, workspace }) => {
  const page = editor.page;
  await openOperation(editor, 'deleteOrder');
  const responses = page.locator('#listView .section', { has: page.getByRole('heading', { name: 'Responses' }) });

  await page.getByRole('button', { name: '+ Add Response' }).click();
  await page.locator('#respNewCode').fill('409');
  await page.locator('#respNewDesc').fill('Already shipped');
  await page.locator('#respNewSchema').fill('Error');
  await page.locator('#respNewArray').check();
  await page.locator('.fn-prompt-confirm').click();
  await expect(responses.locator('.ca-http-code', { hasText: '409' })).toBeVisible();

  // Without a status code nothing is added.
  await page.getByRole('button', { name: '+ Add Response' }).click();
  await page.locator('.fn-prompt-confirm').click();
  await expect(editor.toast()).toHaveText('Status code is required');
  await page.locator('.fn-prompt-cancel').click();

  const ok = responses.locator('tr', { hasText: '204' });
  await ok.locator('.ca-resp-desc').click();
  await ok.locator('.ca-resp-desc input').fill('Removed');
  await page.keyboard.press('Enter');
  await expect(ok.locator('.ca-resp-desc')).toHaveText('Removed');
  await ok.locator('.ca-resp-schema').click();
  await ok.locator('.ca-resp-schema input').fill('Result');
  await page.keyboard.press('Enter');
  await expect(ok.locator('.ca-resp-schema')).toHaveText('Result');

  page.once('dialog', (d) => d.accept());
  await responses.locator('tr', { hasText: '409' }).getByTitle('Delete response').click();
  await expect(responses.locator('.ca-http-code', { hasText: '409' })).toHaveCount(0);

  await page.getByRole('button', { name: '+ Add Response' }).click();
  await page.locator('#respNewCode').fill('404');
  await page.locator('#respNewDesc').fill('Unknown order');
  await page.locator('#respNewSchema').fill('Error');
  await page.locator('.fn-prompt-confirm').click();
  await expect(responses.locator('.ca-http-code', { hasText: '404' })).toBeVisible();

  await editor.save();
  expect(op(saved(workspace), 'deleteOrder').responses).toEqual({
    '204': { description: 'Removed', schema: 'Result' },
    '404': { description: 'Unknown order', schema: 'Error' },
  });
});

test('deleting an endpoint asks first and takes its examples along', async ({ editor, workspace }) => {
  const page = editor.page;
  await openOperation(editor, 'getOrder');

  let message = '';
  page.once('dialog', (d) => {
    message = d.message();
    void d.dismiss();
  });
  await page.locator('#listView h1 .ca-danger-btn').click();
  await expect.poll(() => message).toContain('2 example(s)');
  await expect(editor.sidebarItem('op:getOrder')).toBeVisible();

  page.once('dialog', (d) => d.accept());
  await page.locator('#listView h1 .ca-danger-btn').click();
  await expect(editor.sidebarItem('op:getOrder')).toHaveCount(0);
  await expect(editor.sidebarItem('ex:fetch')).toHaveCount(0);

  await editor.save();
  const model = saved(workspace);
  expect(model.operations.map((o) => o.id)).not.toContain('getOrder');
  expect(model.examples.map((e) => e.id)).not.toContain('fetch');
  expect(model.examples.map((e) => e.id)).toContain('basic-order');
});

test('fills the example form: scalars, a codelist code, tags, a nested entity and an array', async ({ editor, workspace }) => {
  const page = editor.page;
  await openOperation(editor, 'createOrder');
  await createExample(page, 'form-order', 'formOrder', 'Filled by hand');
  await expect(page.locator('#listView h1')).toContainText('Filled by hand');

  await page.locator('.ca-param-value-input[data-param="X-Request-Id"]').fill('req-77');

  await field(page, 'orderId').fill('ABC-1234');
  await field(page, 'createdAt').fill('2030-05-06T07:08:09Z');
  await field(page, 'total').fill('149.95');
  await field(page, 'quantity').fill('3');
  await field(page, 'giftWrap').click();
  await expect(page.locator('.ca-form-checkbox-wrap').first().locator('.ca-form-checkbox-text')).toHaveText('true');
  await field(page, 'channel').selectOption('web');
  await field(page, 'status').fill('01');
  await field(page, 'tags').fill('rush, fragile');

  // A field backed by a codelist offers the codes and takes a pick.
  await field(page, 'colour').click();
  await page.locator('.ca-form-cl-item[data-code="02"]').click();
  await expect(field(page, 'colour')).toHaveValue('02');

  // Nested entity: collapsed until opened.
  await page.locator('#exFormContainer summary', { hasText: 'customer' }).click();
  await field(page, 'customer.entityType').selectOption('company');
  await field(page, 'customer.name').fill('Acme');
  await field(page, 'customer.registrationNumber').fill('12345678');

  // Required entity array: opens with one empty item, and takes more.
  const lines = page.locator('#exFormContainer .ca-form-array[data-path="lines"]');
  await lines.locator('> summary').click();
  await lines.getByRole('button', { name: '+ Add OrderLine' }).click();
  await expect(lines.locator('.ca-form-array-item-label')).toHaveText(['OrderLine #1', 'OrderLine #2']);
  const items = lines.locator('.ca-form-array-item');
  await items.first().locator('.ca-form-array-item-label').click();
  await items.first().locator('[data-path="product"]').fill('SKU-9');
  await items.first().locator('[data-path="quantity"]').fill('2');
  await items.first().locator('[data-path="unitPrice"]').fill('9.99');
  await items.last().getByRole('button', { name: '× Remove' }).click();
  await expect(items).toHaveCount(1);

  await editor.save();
  const ex = example(saved(workspace), 'form-order');
  expect(ex).toMatchObject({
    operationId: 'createOrder',
    technicalName: 'formOrder',
    summary: 'Filled by hand',
    parameterValues: { 'X-Request-Id': 'req-77' },
    responseCode: '201',
  });
  expect(ex.request).toMatchObject({
    orderId: 'ABC-1234',
    createdAt: '2030-05-06T07:08:09Z',
    channel: 'web',
    status: '01',
    colour: '02',
    tags: ['rush', 'fragile'],
    customer: { entityType: 'company', name: 'Acme', registrationNumber: '12345678' },
    lines: [{ product: 'SKU-9' }],
  });
  const request = ex.request as { total: unknown; quantity: unknown; giftWrap: unknown; lines: unknown[] };
  expect(Number(request.total)).toBe(149.95);
  expect(Number(request.quantity)).toBe(3);
  expect([true, 'true']).toContain(request.giftWrap);
  expect(request.lines).toHaveLength(1);

  // The values come back when the example is opened again.
  await editor.sidebarItem('op:createOrder').click();
  await openExample(editor, 'form-order');
  await expect(field(page, 'orderId')).toHaveValue('ABC-1234');
  await expect(field(page, 'colour')).toHaveValue('02');
});

test('shows missing required fields and rule violations on the validation badge', async ({ editor, workspace }) => {
  const page = editor.page;
  await openOperation(editor, 'createOrder');
  await createExample(page, 'checked', 'checked', 'Validation');

  const badge = page.locator('.ca-vbadge');
  await expect(badge).toHaveClass(/ca-vbadge-warn/);
  await badge.click();
  await expect(page.locator('.ca-vpanel-header')).toContainText('required field');
  await expect(page.locator('.ca-vpanel-item', { hasText: 'orderId' })).toContainText('required, empty');

  // A value that breaks the pattern is reported next to the empty fields.
  await field(page, 'orderId').fill('nope');
  await field(page, 'total').fill('-5');
  await expect(page.locator('.ca-vpanel-header')).toContainText('2 rule violations');
  await expect(page.locator('.ca-vpanel-item', { hasText: 'orderId' })).toContainText('must match ^[A-Z]{3}-\\d{4}$');
  await expect(page.locator('.ca-vpanel-item', { hasText: 'total' })).toContainText('must be >= 0');
  await expect(field(page, 'orderId')).toHaveClass(/ca-form-invalid/);

  await field(page, 'orderId').fill('ABC-0001');
  await expect(field(page, 'orderId')).not.toHaveClass(/ca-form-invalid/);
  await expect(page.locator('.ca-vpanel-header')).toContainText('1 rule violation');

  // Validation never blocks saving.
  await editor.save();
  expect(example(saved(workspace), 'checked').request).toMatchObject({ orderId: 'ABC-0001' });
});

test('imports a JSON body, dropping what the model does not know', async ({ editor, workspace }) => {
  const page = editor.page;
  await openOperation(editor, 'createOrder');
  await page.getByRole('button', { name: 'Import JSON' }).click();

  await page.locator('#exImpId').fill('imported');
  await page.locator('#exImpSummary').fill('From a payload');

  // Invalid JSON and a clashing id are reported without leaving the dialog.
  await page.locator('.ca-imp-state-input textarea').fill('{ not json');
  await page.locator('[data-action="review"]').click();
  await expect(page.locator('.fn-prompt-error')).toBeVisible();
  await page.locator('#exImpId').fill('basic-order');
  await page.locator('[data-action="review"]').click();
  await expect(page.locator('.fn-prompt-error')).toHaveText('Example ID already exists');
  await page.locator('#exImpId').fill('imported');

  await page.locator('.ca-imp-state-input textarea').fill(
    JSON.stringify({
      orderId: 'ABC-4321',
      total: 12.5,
      channel: 'store',
      mystery: 'x',
      customer: { entityType: 'privatePerson', name: 'Grace', nickname: 'g' },
    }),
  );
  await page.locator('[data-action="review"]').click();
  await expect(page.locator('.ca-imp-review')).toContainText('Will be dropped');
  await expect(page.locator('.ca-imp-review')).toContainText('mystery');
  await expect(page.locator('.ca-imp-review')).toContainText('customer.nickname');

  // Back keeps what was typed.
  await page.locator('[data-action="back"]').click();
  await expect(page.locator('#exImpId')).toHaveValue('imported');
  await page.locator('[data-action="review"]').click();
  await page.locator('[data-action="create"]').click();
  await expect(page.locator('#exFormContainer')).toBeVisible();
  await expect(field(page, 'orderId')).toHaveValue('ABC-4321');
  await expect(editor.toast()).toContainText('Imported example "imported"');

  await editor.save();
  const ex = example(saved(workspace), 'imported');
  expect(ex.summary).toBe('From a payload');
  expect(ex.request).toMatchObject({ orderId: 'ABC-4321', channel: 'store', customer: { entityType: 'privatePerson', name: 'Grace' } });
  expect(JSON.stringify(ex.request)).not.toContain('mystery');
  expect(JSON.stringify(ex.request)).not.toContain('nickname');
});

test('an imported nested object without entityType is flagged, and kept once a subtype is picked', async ({ editor, workspace }) => {
  const page = editor.page;
  await openOperation(editor, 'createOrder');
  await page.getByRole('button', { name: 'Import JSON' }).click();
  await page.locator('#exImpId').fill('untyped');
  await page.locator('.ca-imp-state-input textarea').fill(JSON.stringify({ orderId: 'ABC-4321', customer: { name: 'Grace' } }));
  await page.locator('[data-action="review"]').click();
  // Party has subtypes; without one the form cannot show the customer's fields.
  await expect(page.locator('.ca-imp-review')).toContainText('customer has no entityType (privatePerson, company)');
  await page.locator('[data-action="create"]').click();

  await page.locator('#exFormContainer summary', { hasText: 'customer' }).click();
  await field(page, 'customer.entityType').selectOption('privatePerson');
  await expect(field(page, 'customer.name')).toHaveValue('Grace');

  await editor.save();
  expect(example(saved(workspace), 'untyped').request).toMatchObject({
    orderId: 'ABC-4321',
    customer: { entityType: 'privatePerson', name: 'Grace' },
  });
});

test('refuses an import where no field matches the request body', async ({ editor, workspace }) => {
  const page = editor.page;
  await openOperation(editor, 'createOrder');
  await page.getByRole('button', { name: 'Import JSON' }).click();
  await page.locator('#exImpId').fill('stray');
  await page.locator('.ca-imp-state-input textarea').fill('{"foo": 1, "bar": 2}');
  await page.locator('[data-action="review"]').click();

  await expect(page.locator('.ca-imp-review')).toContainText('No fields matched');
  await expect(page.locator('[data-action="create"]')).toBeDisabled();
  await page.locator('.fn-prompt-overlay .fn-prompt-cancel[data-action="back"]').click();
  await page.locator('.ca-imp-state-input .fn-prompt-cancel').click();
  await editor.save();
  expect(workspace.readModel('shop_model.json')).not.toHaveProperty('stray');
  expect(saved(workspace).examples.map((e) => e.id)).not.toContain('stray');
});

test('adds a response body example from the responses table', async ({ editor, workspace }) => {
  const page = editor.page;
  await openOperation(editor, 'getOrder');

  await page
    .locator('#listView tr', { hasText: '404' })
    .getByRole('button', { name: /\+ Example/ })
    .click();
  await page.locator('#exRespSummary').fill('Order is gone');
  await page.locator('.fn-prompt-overlay textarea').fill('{"code":"E404","message":"Gone","extra":1}');
  await page.locator('.fn-prompt-confirm').click();

  await expect(editor.toast()).toContainText('Example "order-is-gone" added to 404');
  await editor.save();
  const ex = example(saved(workspace), 'order-is-gone');
  expect(ex).toMatchObject({ operationId: 'getOrder', summary: 'Order is gone', responseCode: '404', technicalName: 'orderIsGone' });
  expect(ex.request ?? null).toBeNull();
  expect(ex.response).toMatchObject({ code: 'E404', message: 'Gone' });
  expect(JSON.stringify(ex.response)).not.toContain('extra');
});

test('duplicates, renames, reorders and deletes examples', async ({ editor, workspace }) => {
  const page = editor.page;
  await openOperation(editor, 'createOrder');
  const ids = (model: SavedModel): string[] => model.examples.filter((e) => e.operationId === 'createOrder').map((e) => e.id);

  // Duplicate from the card on the operation page.
  await page.locator('.ca-example-card', { hasText: 'basic-order' }).getByTitle('Duplicate example').click();
  await expect(page.locator('#exDupId')).toHaveValue('basic-order-copy');
  await expect(page.locator('#exDupTechName')).toHaveValue('basicOrderCopy');
  await page.locator('#exDupSummary').fill('A copy of the basic order');
  await page.locator('.fn-prompt-confirm').click();
  await expect(page.locator('#listView h1')).toContainText('A copy of the basic order');
  await expect(field(page, 'orderId')).toHaveValue('ORD-0001');

  // Rename it, which also moves its id in the sidebar.
  await page.locator('#listView h1 .ca-rename-btn').click();
  await page.locator('#exEditId').fill('copy-of-basic');
  await page.locator('.fn-prompt-confirm').click();
  await expect(editor.sidebarItem('ex:copy-of-basic')).toBeVisible();
  await expect(editor.sidebarItem('ex:basic-order-copy')).toHaveCount(0);

  // Drag the last example above the first one in the sidebar.
  await editor.sidebarItem('ex:copy-of-basic').dragTo(editor.sidebarItem('ex:basic-order'), { targetPosition: { x: 40, y: 2 } });
  await editor.save();
  expect(ids(saved(workspace))).toEqual(['copy-of-basic', 'basic-order', 'company-order', 'odd-numbers', 'empty']);

  // Delete the copy; declining the confirmation keeps it.
  await editor.sidebarItem('ex:copy-of-basic').click();
  page.once('dialog', (d) => void d.dismiss());
  await page.locator('#listView h1 .ca-danger-btn').click();
  await expect(editor.sidebarItem('ex:copy-of-basic')).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await page.locator('#listView h1 .ca-danger-btn').click();
  await expect(editor.sidebarItem('ex:copy-of-basic')).toHaveCount(0);
  await editor.save();
  expect(ids(saved(workspace))).toEqual(['basic-order', 'company-order', 'odd-numbers', 'empty']);
});

test('downloads an example as CSV, one row per value', async ({ editor }) => {
  const page = editor.page;
  await openOperation(editor, 'getOrder');
  await openExample(editor, 'fetch');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('fetch.csv');

  const csv = readFileSync(await file.path(), 'utf8');
  const lines = csv.replace(/^﻿/, '').trimEnd().split('\r\n');
  expect(lines[0]).toBe('Part,Path,Index,Value,Type,SIVI reference');
  expect(lines).toContain('parameter,orderId,,ORD-0001,string,');
  expect(lines).toContain('response,(statusCode),,200,,');
  expect(lines).toContain('response,orderId,,ORD-0001,string,order.orderId');
  expect(lines).toContain('response,customer.name,,Acme,string,party.name');
});

import { type Page, expect, test } from './fixtures.ts';

const siviButton = (page: Page, name: string) => page.locator('#siviViewButtons').getByRole('button', { name, exact: true });

test("switches between models and shows each model's own sidebar", async ({ editor, page }) => {
  await editor.openModel('Shop');
  await expect(editor.sidebarItem('Order')).toBeVisible();
  await expect(editor.sidebarItem('Note')).toHaveCount(0);

  await editor.openModel('Notes');
  await expect(editor.sidebarItem('Note')).toBeVisible();
  await expect(editor.sidebarItem('Order')).toHaveCount(0);
  await expect(page.locator('#apiViewButtons').getByRole('button', { name: 'Notes', exact: true })).toHaveClass(/active/);

  await editor.openModel('Shop');
  await expect(editor.sidebarItem('Order')).toBeVisible();
});

test('the address hash selects the view and survives a reload', async ({ editor, page, workspace }) => {
  await editor.openModel('Shop');
  await expect(page).toHaveURL(/#shopapi$/);

  await page.goto(`${workspace.url}#graph`);
  await page.reload();
  await expect(siviButton(page, 'Graph')).toHaveClass(/active/);
  await expect(page.locator('#cy')).toHaveClass(/visible/);

  await page.goto(`${workspace.url}#shopapi`);
  await page.reload();
  await expect(editor.sidebarItem('Order')).toBeVisible();
});

test('the sidebar lists entities with hierarchy, enums, endpoints and their examples', async ({ editor, page }) => {
  await editor.openModel('Shop');
  const list = page.locator('#entityList');

  await expect(editor.sidebarItem('Order')).toContainText('◉');
  await expect(editor.sidebarItem('OrderLine')).toContainText('├');
  await expect(editor.sidebarItem('Zeta')).not.toContainText('├');
  await expect(editor.sidebarItem('enum:Channel')).toContainText('Channel');
  await expect(editor.sidebarItem('op:createOrder')).toContainText('POST /orders');
  await expect(editor.sidebarItem('ex:basic-order')).toContainText('A basic order with one line');

  await editor.sidebarItem('enum:Channel').click();
  await expect(page.locator('#main')).toContainText('Channel');
  await expect(editor.sidebarItem('enum:Channel')).toHaveClass(/active/);

  await editor.sidebarItem('op:getOrder').click();
  await expect(editor.sidebarItem('op:getOrder')).toHaveClass(/active/);
  await expect(page.locator('#main')).toContainText('/orders/{orderId}');

  await editor.sidebarItem('ex:basic-order').click();
  await expect(editor.sidebarItem('ex:basic-order')).toHaveClass(/active/);
  await expect(list.locator('.active')).toHaveCount(1);
});

test('the General page shows the model metadata', async ({ editor, page }) => {
  await editor.openModel('Shop');
  await editor.sidebarItem('__general__').click();

  await expect(page.locator('.ca-general-heading')).toHaveText('General');
  await expect(page.locator('#genTitle')).toHaveValue('Shop API');
  await expect(page.locator('#genSubtitle')).toHaveValue(/Orders, customers and deliveries\./);
});

test('the Domain Model overview renders its graph', async ({ editor, page }) => {
  await editor.openModel('Shop');
  await editor.openEntity('Order');
  await editor.sidebarItem('__overview__').click();

  await expect(page.locator('#caCy')).toHaveClass(/visible/);
  await expect(page.locator('#caCy canvas').first()).toBeAttached();
  await expect(page.locator('tr[data-attr]')).toHaveCount(0);
});

test('search finds an attribute and opens its entity', async ({ editor, page }) => {
  await editor.openModel('Shop');
  await editor.sidebarItem('__search__').click();
  await expect(page.locator('#caSearchBody')).toContainText('Start typing');

  await page.locator('#caSearchInput').fill('birthDate');
  const hit = page.locator('#caSearchBody tr', { hasText: 'birthDate' }).first();
  await expect(hit).toBeVisible();
  await hit.locator('.ca-search-entity').click();

  await expect(editor.attributeCell('Party', 'birthDate', 'type')).toBeVisible();
  await expect(editor.sidebarItem('Party')).toHaveClass(/active/);

  await editor.sidebarItem('__search__').click();
  await page.locator('#caSearchInput').fill('zzz-nothing');
  await expect(page.locator('#caSearchBody')).toContainText('No results');
});

test('the filter box narrows the sidebar and can be cleared', async ({ editor, page }) => {
  await editor.openModel('Shop');
  await page.locator('#search').fill('addr');
  await expect(editor.sidebarItem('Address')).toBeVisible();
  await expect(editor.sidebarItem('Order')).toBeHidden();
  await expect(editor.sidebarItem('enum:Channel')).toBeHidden();

  await page.locator('#search').fill('');
  await expect(editor.sidebarItem('Order')).toBeVisible();
  await expect(editor.sidebarItem('enum:Channel')).toBeVisible();
});

test('the filter stays applied when an edit rebuilds the sidebar', async ({ editor, page }) => {
  await editor.openModel('Shop');
  await page.locator('#search').fill('order');
  await expect(editor.sidebarItem('Party')).toBeHidden();

  await editor.openEntity('Order');
  await page.getByRole('checkbox', { name: 'Root entity' }).uncheck();
  await expect(editor.sidebarItem('Order')).not.toHaveClass(/ca-root-entity/);
  await expect(editor.sidebarItem('Party')).toBeHidden();
  await expect(editor.sidebarItem('OrderLine')).toBeVisible();
});

test.describe('SIVI views', () => {
  test('list, entity detail, graph and codelists', async ({ page, editor }) => {
    await expect(siviButton(page, 'List')).toHaveClass(/active/);
    await expect(page.locator('#listView')).toContainText('reference model');

    await editor.sidebarItem('Address').click();
    await expect(page.locator('#listView')).toContainText('street');
    await expect(page.locator('#listView')).toContainText('houseNumber');

    await siviButton(page, 'Graph').click();
    await expect(page.locator('#cy')).toHaveClass(/visible/);
    await expect(page.locator('#cy canvas').first()).toBeAttached();

    await siviButton(page, 'Codelists').click();
    await expect(page.locator('#entityList [data-entity=STA002]')).toBeVisible();
    await page.locator('#entityList [data-entity=STA002]').click();
    await expect(page.locator('#listView')).toContainText('Order status');
    await expect(page.locator('#clCodeBody')).toContainText('Shipped');
    await page.locator('#clCodeSearch').fill('cancel');
    await expect(page.locator('#clCodeBody tr:visible')).toHaveCount(1);
  });
});

test('the Codelists view lists and opens a codelist that has no description', async ({ editor, page }) => {
  await expect(editor.sidebarItem('Address')).toBeVisible();
  // The fixture's PAY003 has a name and codes only.
  await siviButton(page, 'Codelists').click();
  await page.locator('#entityList [data-entity=PAY003]').click();
  await expect(page.locator('#listView')).toContainText('PAY003');
  await expect(page.locator('#entityList [data-entity=STA002]')).toBeVisible();
});

test('the collapsed sidebar is remembered after a reload', async ({ editor, page }) => {
  await editor.openModel('Shop');
  await page.locator('#sidebarCollapseBtn').click();
  await expect(page.locator('.sidebar')).toHaveClass(/collapsed/);
  await expect(page.locator('#sidebarIconStrip')).toBeVisible();

  await page.reload();
  await expect(page.locator('.sidebar')).toHaveClass(/collapsed/);

  await page.locator('#sidebarCollapseBtn').click();
  await expect(page.locator('.sidebar')).not.toHaveClass(/collapsed/);
});

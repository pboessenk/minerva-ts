/**
 * Values from a model file, the catalogue and the workspace's custom
 * descriptions are untrusted. These tests load a model full of hostile
 * names and text, visit every view that shows them, and check that nothing
 * runs, nothing is injected, the text shows literally and the inline
 * handlers still work for awkward names.
 */
import { type Page, expect, test } from './fixtures.ts';

const PWN = 'window.__pwned=1';
const IMG = `<img src=x onerror="${PWN}">`;
const SVG = `"><svg onload=${PWN}>`;
const QUOTE = `'); ${PWN}; //`;
const SLASH = `\\'); ${PWN}; //`;
const SCRIPT = `</script><script>${PWN}</script>`;
const ENT = '&lt;b&gt;';

const ENTITY = `O'Neil"<x>`;
const KID_QUOTE = `Kid${QUOTE}`;
const KID_SLASH = `Kid${SLASH}`;
const KID_SVG = `Kid${SVG}`;
const KID_IMG = `Kid${IMG}`;
const ENUM = `Enum'"<b>${ENT}`;
const OP_ID = `op${QUOTE}`;
const OP_PATH = `/p/{id}${IMG}`;
const EX_ID = `ex'"<x>${SLASH}`;
const EX_SUMMARY = `Sum${IMG}${ENT}`;
const ATTR = `a'"<i>${ENT}`;
const SIVI_ATTR = `s${QUOTE}`;
const SECTION = `Sec${SLASH}<u>`;
const CODE_NOTE = `Note ${IMG}`;

const point = (type: string) => ({ text: `${type} ${IMG} ${SVG} ${ENT}`, type });

const attr = (name: string, type: string, extra: Record<string, unknown> = {}) => ({
  name,
  type,
  required: true,
  description: `desc ${IMG} ${SVG} ${QUOTE} ${SLASH} ${SCRIPT} ${ENT}`,
  example: `ex ${IMG} ${SCRIPT} ${ENT}`,
  notes: `note ${IMG} ${SVG} ${ENT}`,
  siviReference: null,
  siviCodelist: null,
  ...extra,
});

const hostileModel = {
  version: `1.0${IMG}`,
  color: '#2f81f7',
  title: `Title ${IMG} ${ENT}`,
  subtitle: `Sub ${SVG} ${SCRIPT}`,
  lastModified: '2026-01-02T03:04:05.000Z',
  servers: [{ url: `https://x.example/${IMG}`, description: `Srv ${SVG} ${ENT}` }],
  security: { enabled: true, bearerFormat: `JWT${IMG}`, description: `Sec ${IMG}` },
  contact: { name: `Name ${IMG}`, email: `a${SVG}@x.example`, url: `https://x.example/${SVG}` },
  changelog: {
    open: [{ category: 'added', text: `Open ${IMG} ${ENT}` }],
    releases: [{ version: `2.0${IMG}`, date: '2025-12-01', entries: [{ category: 'changed', text: `Rel ${SVG}` }] }],
  },
  entities: {
    [ENTITY]: {
      description: `Entity ${IMG} ${SVG} ${SCRIPT} ${ENT}`,
      root: true,
      children: [
        { name: KID_QUOTE, cardinality: '1' },
        { name: KID_SLASH, cardinality: '0..1' },
        { name: KID_SVG, cardinality: '0..1' },
        { name: KID_IMG, cardinality: '0..1' },
      ],
      openPoints: [point('warning'), point('error'), point('info')],
      sections: [
        {
          name: SECTION,
          attributes: [
            attr(ATTR, 'string', {
              allowedValues: [`v${IMG}`, `w${QUOTE}`, ENT, `x${SVG}`],
              allowedName: `Allowed ${IMG}`,
              pattern: `^${IMG}$`,
              default: `d${SVG}`,
              format: `fmt${IMG}`,
            }),
            attr(`${ATTR}2`, KID_QUOTE),
            attr(`${ATTR}3`, KID_SLASH),
            attr(`${ATTR}4`, KID_SVG),
            attr(`${ATTR}5`, KID_IMG),
            attr(`${ATTR}6`, ENUM),
            attr(SIVI_ATTR, 'string', { siviReference: `x${IMG}.y${QUOTE}`, siviCodelist: `CL${QUOTE}` }),
            attr(`${ATTR}7`, 'string', { siviReference: 'party.company', siviCodelist: 'CLR001' }),
          ],
        },
        { name: null, attributes: [attr('plain', 'string')] },
      ],
    },
    [KID_QUOTE]: {
      description: `Kid ${IMG}`,
      parent: ENTITY,
      openPoints: [point('info')],
      sections: [{ name: null, attributes: [attr(`q${QUOTE}`, 'string')] }],
    },
    [KID_SLASH]: { description: `Kid ${SVG}`, sections: [{ name: null, attributes: [attr(`q${SLASH}`, 'string')] }] },
    [KID_SVG]: { description: ENT, sections: [{ name: null, attributes: [attr('z', 'string')] }] },
    [KID_IMG]: { description: SCRIPT, sections: [{ name: null, attributes: [attr('z', 'string')] }] },
  },
  enums: {
    [ENUM]: {
      description: `Enum ${IMG} ${SVG} ${SCRIPT} ${ENT}`,
      values: [
        { name: `Code${QUOTE}`, value: `val${IMG}`, label: `Label ${SVG}`, description: `Desc ${IMG} ${ENT}` },
        { name: `Code${SLASH}`, value: `val'"<b>${SLASH}`, label: ENT, description: SCRIPT },
      ],
      openPoints: [point('warning')],
    },
  },
  operations: [
    {
      id: OP_ID,
      method: 'POST',
      path: OP_PATH,
      summary: `Summary ${IMG} ${ENT}`,
      description: `Op ${IMG} ${SVG} ${SCRIPT} ${ENT}`,
      tags: [`tag${IMG}`, `tag${QUOTE}`, ENT],
      requestBody: KID_QUOTE,
      parameters: [
        { name: `id${IMG}`, in: 'path', type: 'string', required: true, description: `Param ${SVG} ${ENT}` },
        { name: `q'"<p>${SLASH}`, in: 'query', type: 'string', required: false, description: SCRIPT },
      ],
      responses: {
        '201': { description: `Created ${IMG} ${ENT}`, schema: KID_SLASH },
        '400': { description: `Bad ${SVG}`, schema: ENTITY },
      },
    },
  ],
  examples: [
    {
      id: EX_ID,
      operationId: OP_ID,
      technicalName: `tech${QUOTE}`,
      summary: EX_SUMMARY,
      parameterValues: { [`id${IMG}`]: `pv${SVG}`, [`q'"<p>${SLASH}`]: `pv${IMG}` },
      request: { [`q${QUOTE}`]: `rq ${IMG} ${SCRIPT} ${ENT}`, [`k${SVG}`]: `rv${IMG}` },
      response: { [`r${IMG}`]: `rr ${SVG} ${ENT}` },
      responseCode: '201',
    },
  ],
  export: { namespace: 'Evil', primaryRoot: ENTITY },
};

const customDescriptions = {
  subtypes: { 'party.company': `Custom ${IMG} ${ENT}` },
  codeNotes: { CLR001: { '02': CODE_NOTE, '10': `Seasonal ${SVG} ${ENT}` } },
};

test.use({
  workspaceFiles: {
    'evil_model.json': JSON.stringify(hostileModel, null, 2),
    'custom_descriptions.json': JSON.stringify(customDescriptions, null, 2),
    'minerva.json': JSON.stringify({
      defaultModel: 'evil_model.json',
      models: [
        { id: 'evil', file: 'evil_model.json', label: `Evil ${IMG}`, group: `Grp ${SVG}`, color: '#ff0000' },
        { id: 'shop', file: 'shop_model.json', label: 'Shop', group: 'Commerce', color: '#2f81f7' },
      ],
    }),
  },
});

const LABEL = `Evil ${IMG}`;

const g = (page: Page, expr: string): Promise<unknown> => page.evaluate(expr);

/** Nothing ran and nothing hostile was injected into the page. */
async function expectInert(page: Page): Promise<void> {
  expect(await g(page, 'globalThis.__pwned')).toBeUndefined();
  await expect(page.locator('img[src="x"], svg[onload], script:not([src])[data-x], [onerror], [onload]')).toHaveCount(0);
  await expect(page.locator('script', { hasText: PWN })).toHaveCount(0);
}

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => {
    void d.dismiss();
    throw new Error(`unexpected dialog: ${d.message()}`);
  });
});

test('sidebar and the entity detail show hostile text literally', async ({ editor }) => {
  const { page } = editor;
  await editor.openModel(LABEL);
  await expectInert(page);
  await expect(editor.sidebarItem(ENTITY)).toBeVisible();
  await expect(editor.sidebarItem(KID_IMG)).toContainText(IMG);
  await expect(editor.sidebarItem(`enum:${ENUM}`)).toContainText(ENUM);
  await expect(editor.sidebarItem(`op:${OP_ID}`)).toContainText(OP_PATH);
  await expect(editor.sidebarItem(`ex:${EX_ID}`)).toContainText(EX_SUMMARY);

  await editor.openEntity(ENTITY);
  await expect(page.locator('.ca-editable-desc').first()).toContainText(`Entity ${IMG} ${SVG} ${SCRIPT} ${ENT}`);
  await expect(editor.attributeCell(ENTITY, ATTR, 'name')).toContainText(ATTR);
  await expect(editor.attributeCell(ENTITY, ATTR, 'description')).toContainText(`${IMG} ${SVG} ${QUOTE} ${SLASH} ${SCRIPT} ${ENT}`);
  await expect(editor.attributeCell(ENTITY, ATTR, 'example')).toContainText(`${IMG} ${SCRIPT} ${ENT}`);
  await expect(editor.attributeCell(ENTITY, ATTR, 'notes')).toContainText(`${IMG} ${SVG} ${ENT}`);
  await expect(page.locator('.ca-banner-text').first()).toContainText(IMG);
  await expect(page.locator('#entityList')).not.toContainText('&amp;');
  await expectInert(page);
});

test('inline handlers work for names with quotes and angle brackets', async ({ editor }) => {
  const { page } = editor;
  await editor.openModel(LABEL);
  await editor.sidebarItem(ENTITY).click();
  await expect(editor.attributeRows(ENTITY).first()).toBeVisible();

  for (const kid of [KID_QUOTE, KID_SLASH, KID_SVG, KID_IMG]) {
    await page
      .locator('.ca-child-name', { hasText: kid, hasNotText: `${kid}x` })
      .first()
      .click();
    await expect(editor.attributeRows(kid).first()).toBeVisible();
    await expectInert(page);
    await editor.sidebarItem(ENTITY).click();
    await expect(editor.attributeRows(ENTITY).first()).toBeVisible();
  }

  await editor.openEntity(KID_QUOTE);
  await page.locator('.ca-parent-link a').click();
  await expect(editor.attributeRows(ENTITY).first()).toBeVisible();

  // A handler that takes the name as an argument: toggling "required" on an awkward attribute.
  await editor.openEntity(ENTITY);
  const box = editor
    .attributeRows(ENTITY)
    .filter({ has: page.locator(`td[data-field="name"]`, { hasText: ATTR }) })
    .first()
    .locator('.ca-attr-required');
  await box.uncheck();
  await expect(box).not.toBeChecked();
  await editor.save();
  expect(editor.page.url()).toBeTruthy();

  // Hover tooltips that carry names in handlers.
  await editor.attributeCell(ENTITY, `${ATTR}7`, 'sivi').hover();
  await editor.attributeCell(ENTITY, `${ATTR}7`, 'codelist').hover();
  await editor.attributeCell(ENTITY, SIVI_ATTR, 'sivi').hover();
  await editor.attributeCell(ENTITY, SIVI_ATTR, 'codelist').hover();
  await page.waitForTimeout(150); // let an injected handler fire, if there were one
  await expectInert(page);
});

test('enum, operation and example views are inert and their handlers work', async ({ editor }) => {
  const { page } = editor;
  await editor.openModel(LABEL);

  await editor.sidebarItem(`enum:${ENUM}`).click();
  await expect(page.locator('.ca-ev-name', { hasText: `val${IMG}` })).toBeVisible();
  await expect(page.locator('.ca-ev-caption', { hasText: ENT })).toBeVisible();
  await expect(page.locator('.ca-banner-text')).toContainText(IMG);
  await page.locator('.ca-ev-name', { hasText: `val${IMG}` }).click();
  await expect(page.locator('.ca-ev-name input, .ca-ev-name textarea, td input').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expectInert(page);

  await editor.sidebarItem(`op:${OP_ID}`).click();
  await expect(page.locator('body')).toContainText(`Op ${IMG} ${SVG} ${SCRIPT} ${ENT}`);
  await page.locator('.ca-entity-link', { hasText: KID_QUOTE }).first().click();
  await expect(editor.attributeRows(KID_QUOTE).first()).toBeVisible();

  await editor.sidebarItem(`op:${OP_ID}`).click();
  await page.locator('.ca-example-card').first().click();
  await expect(page.locator('body')).toContainText(EX_SUMMARY);
  await expectInert(page);
});

test('search results, general page and graph are inert', async ({ editor }) => {
  const { page } = editor;
  await editor.openModel(LABEL);
  await editor.sidebarItem('__general__').click();
  await expect(page.locator('#genTitle')).toHaveValue(`Title ${IMG} ${ENT}`);
  await expect(page.locator('#genSubtitle')).toHaveValue(`Sub ${SVG} ${SCRIPT}`);
  await expect(page.locator('#genVersionDisplay')).toHaveText(`1.0${IMG}`);
  await expect(page.locator('#genServerRows input').nth(1)).toHaveValue(`Srv ${SVG} ${ENT}`);
  await expectInert(page);

  await editor.sidebarItem('__search__').click();
  const input = page.locator('#caSearchInput').first();
  await input.fill('onerror');
  await expect(page.locator('body')).toContainText(IMG);
  await expectInert(page);

  await editor.sidebarItem('__overview__').click();
  await expect(page.locator('#caCy canvas').first()).toBeVisible();
  await page.waitForTimeout(150);
  await expectInert(page);
});

test('graph tooltips and catalogue tooltips are inert', async ({ editor }) => {
  const { page } = editor;
  await editor.openModel(LABEL);
  await editor.sidebarItem('__overview__').click();
  const canvas = page.locator('#caCy');
  await expect(canvas.locator('canvas').first()).toBeVisible();

  // The graph is drawn on a canvas, so find a node by sweeping the pointer until its tooltip appears.
  const box = await canvas.boundingBox();
  if (box === null) throw new Error('graph has no box');
  const tip = page.locator('#graphTooltip');
  for (let y = 0.1; y < 0.95 && !(await tip.evaluate((el) => el.classList.contains('visible'))); y += 0.05) {
    for (let x = 0.05; x < 0.95; x += 0.03) {
      await page.mouse.move(box.x + box.width * x, box.y + box.height * y);
      if (await tip.evaluate((el) => el.classList.contains('visible'))) break;
    }
  }
  await expect(tip).toHaveClass(/visible/);
  await expect(tip.locator('h4')).toContainText(/Kid|O'Neil/);
  await expectInert(page);

  // The codelist tooltip and viewer.
  await editor.openEntity(ENTITY);
  await editor.attributeCell(ENTITY, `${ATTR}7`, 'codelist').locator('.ca-attr-codelist').hover();
  await expect(page.locator('#clTooltip')).toContainText('CLR001');
  await expectInert(page);
});

test('the example form and its fields are inert', async ({ editor }) => {
  const { page } = editor;
  await editor.openModel(LABEL);
  await editor.sidebarItem(`ex:${EX_ID}`).click();
  await expect(page.locator('body')).toContainText(EX_SUMMARY);
  await expect(
    page
      .locator('input, textarea')
      .filter({ hasNot: page.locator('x') })
      .first(),
  ).toBeVisible();
  const values = await page.locator('input, textarea').evaluateAll((els) => els.map((el) => (el as unknown as { value: string }).value));
  expect(values.some((v) => v.includes(`rq ${IMG}`) || v.includes(`pv${IMG}`) || v.includes(`rv${IMG}`))).toBe(true);
  await page.waitForTimeout(150); // let an injected handler fire, if there were one
  await expectInert(page);
});

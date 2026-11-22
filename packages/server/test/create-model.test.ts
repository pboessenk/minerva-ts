import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeModel, validateModel } from '@minerva/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CreateModelError, createModel } from '../src/workspace/create-model.ts';
import { Workspace } from '../src/workspace/workspace.ts';

let root: string;
let dataDir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'minerva-new-model-'));
  dataDir = join(root, 'data');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const read = (file: string): string => readFileSync(join(dataDir, file), 'utf8');

describe('createModel', () => {
  it('creates the data directory and an empty model the workspace finds', () => {
    expect(createModel(dataDir, 'orders')).toEqual({ file: 'orders_model.json', manifestUpdated: false });

    const text = read('orders_model.json');
    expect(JSON.parse(text)).toEqual({ title: 'Orders', version: '0.1.0', lastModified: '', entities: {} });
    expect(text).toBe(JSON.stringify(JSON.parse(text), null, 2));
    expect(validateModel(decodeModel(text))).toEqual([]);
    expect(new Workspace(dataDir).models.map((m) => m.id)).toEqual(['orders']);
  });

  it('uses the title given', () => {
    createModel(dataDir, 'orders', 'Orders API');
    expect(JSON.parse(read('orders_model.json')).title).toBe('Orders API');
  });

  it('refuses to overwrite an existing model', () => {
    createModel(dataDir, 'orders', 'First');
    expect(() => createModel(dataDir, 'orders', 'Second')).toThrow(/already exists/);
    expect(JSON.parse(read('orders_model.json')).title).toBe('First');
  });

  it.each(['', '1orders', 'my orders', '../orders', 'orders.v2', 'orders_api'])('refuses the name %j', (name) => {
    expect(() => createModel(dataDir, name)).toThrow(CreateModelError);
  });

  describe('with a manifest', () => {
    beforeEach(() => mkdirSync(dataDir));

    it('adds the model to the list, keeping the layout of the rest', () => {
      const manifest = [
        '{',
        '  "defaultModel": "shop_model.json",',
        '  "models": [',
        '    { "id": "shop", "file": "shop_model.json", "label": "Shop" }',
        '  ],',
        '  "footer": "x"',
        '}',
        '',
      ].join('\n');
      writeFileSync(join(dataDir, 'minerva.json'), manifest);

      expect(createModel(dataDir, 'orders')).toEqual({ file: 'orders_model.json', manifestUpdated: true });
      expect(read('minerva.json')).toBe(
        manifest.replace('"label": "Shop" }\n', '"label": "Shop" },\n    { "id": "orders", "file": "orders_model.json" }\n'),
      );
      expect(new Workspace(dataDir).models.map((m) => m.id)).toEqual(['shop', 'orders']);
    });

    it('appends on the same line when the list is written on one line', () => {
      writeFileSync(join(dataDir, 'minerva.json'), '{"models":[{"id":"shop","file":"shop_model.json"}]}');
      createModel(dataDir, 'orders');
      expect(read('minerva.json')).toBe(
        '{"models":[{"id":"shop","file":"shop_model.json"}, { "id": "orders", "file": "orders_model.json" }]}',
      );
    });

    it('leaves a manifest without a model list alone: the model is found by its file name', () => {
      writeFileSync(join(dataDir, 'minerva.json'), '{ "footer": "x" }');
      expect(createModel(dataDir, 'orders').manifestUpdated).toBe(false);
      expect(read('minerva.json')).toBe('{ "footer": "x" }');
    });

    it('refuses an id the manifest already lists, and writes nothing', () => {
      const manifest = '{"models":[{"id":"orders","file":"legacy_orders.json"}]}';
      writeFileSync(join(dataDir, 'minerva.json'), manifest);
      expect(() => createModel(dataDir, 'orders')).toThrow(/already lists/);
      expect(read('minerva.json')).toBe(manifest);
      expect(() => read('orders_model.json')).toThrow();
    });
  });
});

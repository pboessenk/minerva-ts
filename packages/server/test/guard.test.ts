import { createServer, type Server } from 'node:http';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.ts';
import { guardRequest } from '../src/http/guard.ts';

const FIXTURE = resolve(import.meta.dirname, '../../../fixtures/workspace');
const MODEL = 'notes_model.json';

describe('guardRequest', () => {
  const json = { 'content-type': 'application/json' };

  it.each(['localhost:56043', '127.0.0.1:56043', '[::1]:56043', 'localhost'])('lets a read addressed to %s through', (host) => {
    expect(guardRequest('GET', { host })).toBeUndefined();
  });

  it.each(['evil.example:56043', 'localhost.evil.example', '192.168.1.5:56043'])('refuses a read addressed to %s', (host) => {
    expect(guardRequest('GET', { host })?.status).toBe(403);
  });

  it('refuses a request without a Host header', () => {
    expect(guardRequest('GET', {})?.status).toBe(403);
  });

  it('lets a JSON write from the editor itself through', () => {
    const headers = { host: 'localhost:56043', origin: 'http://localhost:56043', 'sec-fetch-site': 'same-origin', ...json };
    expect(guardRequest('POST', headers)).toBeUndefined();
  });

  it('lets a JSON write from a non-browser client through', () => {
    expect(guardRequest('POST', { host: 'localhost:56043', ...json })).toBeUndefined();
  });

  it.each([
    ['another site', 'https://evil.example'],
    ['another local port', 'http://localhost:3000'],
    ['another loopback name', 'http://127.0.0.1:56043'],
    ['an opaque origin', 'null'],
  ])('refuses a write from %s', (_label, origin) => {
    expect(guardRequest('POST', { host: 'localhost:56043', origin, ...json })?.status).toBe(403);
  });

  it('refuses a write the browser marks as cross-site', () => {
    expect(guardRequest('POST', { host: 'localhost:56043', 'sec-fetch-site': 'cross-site', ...json })?.status).toBe(403);
  });

  it.each(['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', undefined])(
    'refuses a write with content type %s',
    (contentType) => {
      const headers = { host: 'localhost:56043', ...(contentType === undefined ? {} : { 'content-type': contentType }) };
      expect(guardRequest('POST', headers)?.status).toBe(415);
    },
  );

  it('accepts a JSON content type with parameters', () => {
    expect(guardRequest('POST', { host: 'localhost:56043', 'content-type': 'Application/JSON; charset=utf-8' })).toBeUndefined();
  });
});

describe('the guard in front of the app', () => {
  let dataDir: string;
  let server: Server;
  let port: number;

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'minerva-guard-'));
    cpSync(FIXTURE, dataDir, { recursive: true });
    server = createServer(createApp({ dataDir }).handle);
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => {
    server.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  /** Sends a raw request, so the Host and Origin headers are exactly as given. */
  function send(method: string, path: string, headers: Record<string, string>, body = ''): Promise<number> {
    return new Promise((done, fail) => {
      const req = request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
        res.resume();
        res.on('end', () => done(res.statusCode ?? 0));
      });
      req.on('error', fail);
      req.end(body);
    });
  }

  it('does not let a cross-site form overwrite a model', async () => {
    const before = readFileSync(join(dataDir, MODEL), 'utf8');
    const status = await send(
      'POST',
      `/api/save?model=${MODEL}&force=1`,
      {
        host: `localhost:${port}`,
        origin: 'https://evil.example',
        'content-type': 'text/plain',
      },
      '{}',
    );
    expect(status).toBe(403);
    expect(readFileSync(join(dataDir, MODEL), 'utf8')).toBe(before);
  });

  it('does not serve the data directory to a rebinding host name', async () => {
    expect(await send('GET', `/data/${MODEL}`, { host: `evil.example:${port}` })).toBe(403);
  });

  it('still serves the editor and the data to localhost', async () => {
    expect(await send('GET', '/', { host: `localhost:${port}` })).toBe(200);
    expect(await send('GET', `/data/${MODEL}`, { host: `localhost:${port}` })).toBe(200);
  });
});

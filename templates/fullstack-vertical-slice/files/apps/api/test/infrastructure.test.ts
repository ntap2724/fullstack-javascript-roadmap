// Permanent infrastructure suite.
//
// Everything asserted here must hold on an untouched starter AND on a finished
// one. `pnpm verify:baseline` runs this suite, and `pnpm verify` runs
// `verify:baseline` before the learner contract, so an assertion that pinned
// unimplemented behaviour would make a completed milestone unverifiable: the
// baseline would go red at the exact moment the learner succeeded.
//
// The initial seams — an empty workshop list and a 501 enrollment response —
// therefore belong to the learner contract and to the repository-owned
// publication test, not here. This suite proves the scaffolding: construction,
// routing, headers, wire schemas, and configuration parsing.

import { Server } from 'node:http';
import { WorkshopListResponseSchema } from '@workshop/contracts';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const validEnvironment = {
  PORT: '3000',
  DATABASE_URL: 'postgresql://workshop:workshop@localhost:5432/workshop_enrollment',
  WEB_ORIGIN: 'http://localhost:5173',
  SESSION_COOKIE_SECURE: 'false',
  SESSION_TTL_MINUTES: '120',
};

describe('API application construction', () => {
  it('exports createApp without starting a listener', async () => {
    const listenSpy = vi.spyOn(Server.prototype, 'listen');

    try {
      const { createApp } = await import('../src/app.js');

      expect(createApp).toBeTypeOf('function');
      createApp();
      expect(listenSpy).not.toHaveBeenCalled();
    } finally {
      listenSpy.mockRestore();
    }
  });

  it('returns the health response', async () => {
    const { createApp } = await import('../src/app.js');
    const response = await request(createApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('returns a schema-valid workshop list', async () => {
    const { createApp } = await import('../src/app.js');
    const response = await request(createApp()).get('/api/workshops');

    expect(response.status).toBe(200);
    // The payload must satisfy the shared wire contract exactly: the schema is
    // strict, so an unknown key still fails here. The number of workshops is
    // deliberately NOT pinned — an untouched starter serves an empty list and a
    // finished one serves real rows, and both are valid scaffolding states.
    expect(WorkshopListResponseSchema.parse(response.body).items).toBeInstanceOf(Array);
  });

  it('disables the x-powered-by response header', async () => {
    const { createApp } = await import('../src/app.js');
    const response = await request(createApp()).get('/health');

    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('adds a UUID request ID response header', async () => {
    const { createApp } = await import('../src/app.js');
    const response = await request(createApp()).get('/health');

    expect(z.uuid().safeParse(response.headers['x-request-id']).success).toBe(true);
  });

  it('mounts the enrollment route behind the shared middleware', async () => {
    const { createApp } = await import('../src/app.js');
    const response = await request(createApp()).post(
      '/api/workshops/00000000-0000-4000-8000-000000000001/enrollments',
    );

    // Stable scaffolding properties: the state-changing enrollment path is
    // mounted, and the request-ID middleware covers it too.
    //
    // The response STATUS is intentionally absent from this suite. It is 501 on an
    // untouched starter and 201 once enrollment exists; `test/learner.test.ts`
    // owns that transition, and the repository-owned publication test owns the
    // initial 501. Asserting a status here — or accepting either one — would
    // either break a finished milestone or assert nothing at all.
    expect(response.status).not.toBe(404);
    expect(z.uuid().safeParse(response.headers['x-request-id']).success).toBe(true);
  });
});

describe('API configuration', () => {
  it('parses all required variables into runtime values', async () => {
    const { loadConfig } = await import('../src/config.js');

    expect(loadConfig(validEnvironment)).toEqual({
      PORT: 3000,
      DATABASE_URL: validEnvironment.DATABASE_URL,
      WEB_ORIGIN: validEnvironment.WEB_ORIGIN,
      SESSION_COOKIE_SECURE: false,
      SESSION_TTL_MINUTES: 120,
    });
  });

  it.each([
    ['PORT', '0'],
    ['DATABASE_URL', 'https://example.com/database'],
    ['WEB_ORIGIN', 'not-a-url'],
    ['SESSION_COOKIE_SECURE', 'yes'],
    ['SESSION_TTL_MINUTES', '0'],
  ])('rejects an invalid %s value', async (key, value) => {
    const { loadConfig } = await import('../src/config.js');

    expect(() => loadConfig({ ...validEnvironment, [key]: value })).toThrow();
  });
});

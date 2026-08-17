import { Server } from 'node:http';
import { ApiErrorSchema, WorkshopListResponseSchema } from '@workshop/contracts';
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

  it('returns a schema-valid empty workshop list', async () => {
    const { createApp } = await import('../src/app.js');
    const response = await request(createApp()).get('/api/workshops');

    expect(response.status).toBe(200);
    expect(WorkshopListResponseSchema.parse(response.body)).toEqual({ items: [] });
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

  it('returns the schema-valid incomplete enrollment seam', async () => {
    const { createApp } = await import('../src/app.js');
    const response = await request(createApp()).post(
      '/api/workshops/00000000-0000-4000-8000-000000000001/enrollments',
    );

    expect(response.status).toBe(501);
    expect(ApiErrorSchema.parse(response.body)).toEqual({
      code: 'ENROLLMENT_NOT_IMPLEMENTED',
      message: 'Complete the authenticated transactional enrollment workflow',
      requestId: response.headers['x-request-id'],
    });
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

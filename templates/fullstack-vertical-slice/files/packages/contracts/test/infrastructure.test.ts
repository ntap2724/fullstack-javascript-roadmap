import { describe, expect, it } from 'vitest';
import { ApiErrorSchema, WorkshopListResponseSchema, WorkshopSummarySchema } from '../src/index.js';

describe('WorkshopSummarySchema', () => {
  const validSummary = {
    id: '00000000-0000-4000-8000-000000000001',
    title: 'TypeScript Fundamentals',
    startsAt: '2026-09-01T09:00:00+07:00',
    capacity: 30,
    enrollmentCount: 5,
    registrationOpen: true,
  };

  it('accepts a valid workshop summary', () => {
    expect(() => WorkshopSummarySchema.parse(validSummary)).not.toThrow();
  });

  it('rejects extra fields to enforce wire contract stability', () => {
    expect(() => WorkshopSummarySchema.parse({ ...validSummary, unexpectedField: true })).toThrow();
  });

  it('rejects non-positive capacity', () => {
    expect(() => WorkshopSummarySchema.parse({ ...validSummary, capacity: 0 })).toThrow();
  });

  it('rejects invalid UUID format', () => {
    expect(() => WorkshopSummarySchema.parse({ ...validSummary, id: 'not-a-uuid' })).toThrow();
  });
});

describe('WorkshopListResponseSchema', () => {
  it('accepts an empty list response', () => {
    expect(() => WorkshopListResponseSchema.parse({ items: [] })).not.toThrow();
  });

  it('rejects missing items field', () => {
    expect(() => WorkshopListResponseSchema.parse({})).toThrow();
  });
});

describe('ApiErrorSchema', () => {
  const validError = {
    code: 'ENROLLMENT_NOT_IMPLEMENTED',
    message: 'Complete the authenticated transactional enrollment workflow',
    requestId: '00000000-0000-4000-8000-000000000002',
  };

  it('accepts a valid error without optional details', () => {
    expect(() => ApiErrorSchema.parse(validError)).not.toThrow();
  });

  it('accepts a valid error with optional details', () => {
    expect(() =>
      ApiErrorSchema.parse({ ...validError, details: { field: 'email' } }),
    ).not.toThrow();
  });

  it('rejects error codes that do not match the declared format', () => {
    expect(() => ApiErrorSchema.parse({ ...validError, code: 'lowercase_code' })).toThrow();
  });

  it('rejects extra fields on error responses', () => {
    expect(() => ApiErrorSchema.parse({ ...validError, stackTrace: '...' })).toThrow();
  });
});

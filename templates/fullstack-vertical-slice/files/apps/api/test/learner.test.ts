import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('enrollment learner contract', () => {
  it('creates an authenticated enrollment', async () => {
    const response = await request(createApp())
      .post('/api/workshops/00000000-0000-4000-8000-000000000001/enrollments')
      .set('cookie', 'session=learner-fixture')
      .set('origin', 'http://localhost:5173')
      .set('x-csrf-token', 'learner-fixture');

    expect(response.status, 'LEARNER_API_ENROLLMENT_001').toBe(201);
  });
});

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/app/App.js';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('enrollment learner contract', () => {
  it('LEARNER_WEB_ENROLLMENT_001 completes the authenticated enrollment workflow', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse({
            items: [
              {
                id: '00000000-0000-4000-8000-000000000001',
                title: 'Reliable React state',
                startsAt: '2026-09-01T09:00:00+07:00',
                capacity: 12,
                enrollmentCount: 3,
                registrationOpen: true,
              },
            ],
          }),
        ),
      ),
    );
    const user = userEvent.setup();

    render(<App apiBaseUrl="http://api.test" />);

    expect(
      await screen.findByRole('heading', { name: 'Reliable React state' }),
    ).toBeInTheDocument();

    const button = screen.queryByRole('button', { name: /enroll/i });
    expect(button, 'LEARNER_WEB_ENROLLMENT_001').not.toBeNull();
    if (!button) return;

    await user.click(button);
    expect(
      await screen.findByText(/enrollment confirmed/i),
      'LEARNER_WEB_ENROLLMENT_001',
    ).toBeInTheDocument();
  });
});

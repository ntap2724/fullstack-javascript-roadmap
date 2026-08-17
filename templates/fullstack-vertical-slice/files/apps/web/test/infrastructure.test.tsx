import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { App } from '../src/app/App.js';
import { fetchWorkshops } from '../src/api/workshops.js';
import { WorkshopListPage } from '../src/routes/WorkshopListPage.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('routes the application root to the workshop list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ items: [] }))),
    );
    window.history.replaceState({}, '', '/');

    render(<App apiBaseUrl="http://api.test" />);

    expect(screen.getByText('Workshop Enrollment')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAccessibleName('Workshops');
    expect(await screen.findByText('No workshops are currently open.')).toBeInTheDocument();
  });
});

describe('WorkshopListPage', () => {
  it('renders a status while the workshop request is pending', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );

    render(<WorkshopListPage apiBaseUrl="http://api.test" />);

    expect(screen.getByRole('status')).toHaveTextContent('Loading workshops');
  });

  it('renders an empty state when no workshops are available', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ items: [] }))),
    );

    render(<WorkshopListPage apiBaseUrl="http://api.test" />);

    expect(await screen.findByText('No workshops are currently open.')).toBeInTheDocument();
  });

  it('renders a keyboard-reachable error state', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Error('offline'))),
    );

    render(<WorkshopListPage apiBaseUrl="http://api.test" />);

    expect(await screen.findByRole('alert')).toHaveTextContent('offline');
    await user.tab();
    expect(screen.getByRole('button', { name: 'Retry' })).toHaveFocus();
  });

  it('retries the workshop request after a failure', async () => {
    const user = userEvent.setup();
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(jsonResponse({ items: [] }));
    vi.stubGlobal('fetch', fetchMock);

    render(<WorkshopListPage apiBaseUrl="http://api.test" />);

    await user.click(await screen.findByRole('button', { name: 'Retry' }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('No workshops are currently open.')).toBeInTheDocument();
  });

  it('renders available workshops as a semantic list', async () => {
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

    render(<WorkshopListPage apiBaseUrl="http://api.test" />);

    const list = await screen.findByRole('list', { name: 'Available workshops' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(1);
    expect(within(list).getByRole('heading', { name: 'Reliable React state' })).toBeInTheDocument();
    expect(within(list).getByText('3 of 12 seats enrolled')).toBeInTheDocument();
    expect(within(list).getByText('Registration open')).toBeInTheDocument();
  });
});

describe('fetchWorkshops', () => {
  it('includes credentials and parses the shared workshop response', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse({ items: [] })));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchWorkshops('http://api.test')).resolves.toEqual({ items: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/api/workshops',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('rejects API payloads that do not match the shared response schema', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ items: [], unexpected: true }))),
    );

    await expect(fetchWorkshops('http://api.test')).rejects.toThrow();
  });
});

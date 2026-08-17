import { useEffect, useState } from 'react';
import type { WorkshopSummary } from '@workshop/contracts';
import { fetchWorkshops } from '../api/workshops.js';

type WorkshopListPageProps = {
  apiBaseUrl: string;
};

type WorkshopListState =
  | { status: 'loading' }
  | { status: 'ready'; items: WorkshopSummary[] }
  | { status: 'error'; message: string };

export function WorkshopListPage({ apiBaseUrl }: WorkshopListPageProps) {
  const [state, setState] = useState<WorkshopListState>({ status: 'loading' });
  const [requestRevision, setRequestRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    void fetchWorkshops(apiBaseUrl, controller.signal)
      .then(({ items }) => {
        if (!controller.signal.aborted) {
          setState({ status: 'ready', items });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Unable to load workshops',
          });
        }
      });

    return () => {
      controller.abort();
    };
  }, [apiBaseUrl, requestRevision]);

  return (
    <main className="page-content" aria-labelledby="workshops-heading">
      <h1 id="workshops-heading">Workshops</h1>
      {state.status === 'loading' ? (
        <p className="page-state" role="status">
          Loading workshops
        </p>
      ) : null}
      {state.status === 'error' ? (
        <div className="page-state page-state-error">
          <p role="alert">{state.message}</p>
          <button
            type="button"
            onClick={() => {
              setState({ status: 'loading' });
              setRequestRevision((revision) => revision + 1);
            }}
          >
            Retry
          </button>
        </div>
      ) : null}
      {state.status === 'ready' && state.items.length === 0 ? (
        <p className="page-state">No workshops are currently open.</p>
      ) : null}
      {state.status === 'ready' && state.items.length > 0 ? (
        <ul className="workshop-list" aria-label="Available workshops">
          {state.items.map((workshop) => (
            <li className="workshop-list-item" key={workshop.id}>
              <article className="workshop-card">
                <h2>{workshop.title}</h2>
                <p>
                  <time dateTime={workshop.startsAt}>{workshop.startsAt}</time>
                </p>
                <p>
                  {workshop.enrollmentCount} of {workshop.capacity} seats enrolled
                </p>
                <p>{workshop.registrationOpen ? 'Registration open' : 'Registration closed'}</p>
              </article>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}

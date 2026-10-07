import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { WorkshopListPage } from '../routes/WorkshopListPage.js';

type AppProps = {
  apiBaseUrl?: string;
};

const defaultApiBaseUrl = 'http://localhost:3000';

export function App({ apiBaseUrl = defaultApiBaseUrl }: AppProps) {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <header className="site-header">
          <span className="site-name">Workshop Enrollment</span>
        </header>
        <Routes>
          <Route path="/" element={<WorkshopListPage apiBaseUrl={apiBaseUrl} />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

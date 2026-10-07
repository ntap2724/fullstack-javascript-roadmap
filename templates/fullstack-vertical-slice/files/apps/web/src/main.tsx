import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App.js';
import './styles.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Application root is missing');
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

createRoot(root).render(
  <StrictMode>
    <App apiBaseUrl={apiBaseUrl} />
  </StrictMode>,
);

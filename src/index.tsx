import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';
import { initErrorReporting } from './services/errorReporting';

// Sentry error reporting — active only when VITE_SENTRY_DSN was set at
// build time (production deploys); a no-op for local dev and forks.
initErrorReporting();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

import { LanguageProvider } from './LanguageContext';

import { ThemeProvider } from './ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';

// PWA: offline app shell + static asset cache (production builds only —
// the service worker would fight Vite's dev-server module graph)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => {
      console.warn('[sw] registration failed', e);
    });
  });
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <LanguageProvider>
        <ThemeProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </ThemeProvider>
      </LanguageProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
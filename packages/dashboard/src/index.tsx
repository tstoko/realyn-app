import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import App from './App';
import { AuthProvider, ErrorBoundary, ToastProvider } from '@realyn/shared';
import { HotelProvider } from './contexts/HotelContext';
import { getEnvironment } from './config/environment';
import './index.css';

const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: getEnvironment(),
    tracesSampleRate: 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<ErrorBoundary><div /></ErrorBoundary>}>
      <ErrorBoundary>
        <BrowserRouter>
          <AuthProvider>
            <HotelProvider>
              <ToastProvider>
                <App />
              </ToastProvider>
            </HotelProvider>
          </AuthProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </Sentry.ErrorBoundary>
  </React.StrictMode>
);

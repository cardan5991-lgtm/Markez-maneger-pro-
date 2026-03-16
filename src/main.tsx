import {createRoot} from 'react-dom/client';
import App from './App';
import './index.css';
import { ErrorBoundary } from './ErrorBoundary';

// Global error handlers
const isBenignError = (msg: any) => {
  if (typeof msg !== 'string') return false;
  return msg.includes('WebSocket') || 
         msg.includes('vite') || 
         msg.includes('hmr') ||
         msg.includes('connection');
};

const originalConsoleError = console.error;
console.error = (...args) => {
  if (isBenignError(args[0])) return;
  originalConsoleError.apply(console, args);
};

const originalConsoleWarn = console.warn;
console.warn = (...args) => {
  if (isBenignError(args[0])) return;
  originalConsoleWarn.apply(console, args);
};

window.onerror = (message, source, lineno, colno, error) => {
  if (isBenignError(message)) return true;
  originalConsoleError('Global Error:', message, error);
};

window.onunhandledrejection = (event) => {
  const reason = event.reason?.message || event.reason;
  if (isBenignError(reason)) {
    event.preventDefault();
    return;
  }
  originalConsoleError('Unhandled Rejection:', event.reason);
};

// PWA Install Prompt
window.addEventListener('beforeinstallprompt', (e) => {
  console.log('PWA: Install prompt is ready');
});

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => {
        console.log('SW registered with scope:', reg.scope);
        reg.onupdatefound = () => {
          const installingWorker = reg.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  console.log('New content is available; please refresh.');
                } else {
                  console.log('Content is cached for offline use.');
                }
              }
            };
          }
        };
      })
      .catch(err => console.error('SW registration failed:', err));
  });
}

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

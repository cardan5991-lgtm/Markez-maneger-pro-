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
declare global {
  interface Window {
    deferredPrompt: any;
  }
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.deferredPrompt = e;
  console.log('PWA: Install prompt is ready and saved');
  // Dispatch a custom event so React components can listen
  window.dispatchEvent(new Event('pwa-install-ready'));
});

// Register Service Worker for PWA (now handled in index.html for PWABuilder compatibility)
// The logic for updates is kept here if needed, but registration is in index.html
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then(reg => {
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
  });
}

// Enforce portrait orientation if supported
if (typeof screen !== 'undefined' && screen.orientation && (screen.orientation as any).lock) {
  (screen.orientation as any).lock('portrait').catch((err: any) => {
    console.log('Orientation lock failed or not supported:', err);
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

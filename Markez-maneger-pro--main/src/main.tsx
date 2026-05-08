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

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js")
      .then(reg => console.log("Service Worker registrado:", reg))
      .catch(err => console.error("Error al registrar SW:", err));
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

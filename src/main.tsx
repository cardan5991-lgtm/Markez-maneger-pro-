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

// Enforce portrait orientation if supported
if (typeof screen !== 'undefined' && screen.orientation && (screen.orientation as any).lock) {
  (screen.orientation as any).lock('portrait').catch((err: any) => {
    console.log('Orientation lock failed or not supported:', err);
  });
}

// Prevent pinch-zoom and double-tap zoom on iOS Safari
document.addEventListener('gesturestart', function(e) {
  e.preventDefault();
} as any);

document.addEventListener('gesturechange', function(e) {
  e.preventDefault();
} as any);

document.addEventListener('gestureend', function(e) {
  e.preventDefault();
} as any);

let lastTouchEnd = 0;
document.addEventListener('touchend', function(event) {
  const now = (new Date()).getTime();
  if (now - lastTouchEnd <= 300) {
    event.preventDefault();
  }
  lastTouchEnd = now;
}, false);

document.addEventListener('touchmove', function(event) {
  if (event.touches.length > 1) {
    event.preventDefault();
  }
}, { passive: false });

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  root.render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

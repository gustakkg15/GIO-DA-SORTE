import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (import.meta.env.DEV && typeof window !== 'undefined') {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
      })
      .catch(() => {});
  }
  if ('caches' in window) {
    caches
      .keys()
      .then((keys) => {
        for (const key of keys) {
          if (
            key.includes('workbox') ||
            key.includes('precache') ||
            key.includes('vite-pwa') ||
            key.includes('gio-')
          ) {
            caches.delete(key);
          }
        }
      })
      .catch(() => {});
  }
}

createRoot(document.getElementById('root')!).render(<App />);

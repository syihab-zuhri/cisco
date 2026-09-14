import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { TooltipProvider } from '@/components/ui/tooltip';

// Abaikan pesan benign ResizeObserver dari browser/React Flow
window.addEventListener('error', (e) => {
  if (
    e.message.includes('ResizeObserver loop completed with undelivered notifications') ||
    e.message.includes('ResizeObserver loop limit exceeded')
  ) {
    e.stopImmediatePropagation();
  }
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </React.StrictMode>,
);

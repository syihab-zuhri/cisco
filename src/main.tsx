import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { TooltipProvider } from '@/components/ui/tooltip';
import { initTheme } from '@/lib/theme';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useAppStore } from '@/store/useAppStore';
import { initWorkspaceDraft } from '@/features/workspace/draft';

initTheme();
initWorkspaceDraft(useAppStore);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary label="Aplikasi" variant="page">
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);

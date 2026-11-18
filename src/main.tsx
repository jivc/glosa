import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { importFile } from './core/importers';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Gancho de diagnóstico (usado por la prueba automática de la app de escritorio).
(window as unknown as { __glosa: unknown }).__glosa = { importFile };

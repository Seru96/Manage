import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { installMenu } from './app/menu';
import { closeProject } from './app/session';
import { isTauri } from './platform/backend';
import './ui/styles.css';

const IS_MAC = /Mac|iPhone|iPad/.test(navigator.platform);
document.documentElement.dataset.os = IS_MAC ? 'mac' : 'win';
// Aspecto de app de escritorio: sin el menú contextual del motor web.
if (isTauri()) window.addEventListener('contextmenu', (e) => { if (!(e.target as HTMLElement).closest('input, textarea')) e.preventDefault(); });
installMenu();
window.addEventListener('beforeunload', () => void closeProject(false));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

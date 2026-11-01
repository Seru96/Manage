import { backend } from '../platform/backend';
import { openOptions } from '../store/theme';
import { useProject } from '../store/project';
import { newTask, setView, useView } from '../store/view';
import { exportExcel, importExcel } from './excel';
import { closeProject, createProject, openProject, showStart, syncCommand } from './session';

const inProject = (fn: () => void) => () => { if (useProject.getState().path && useView.getState().screen === 'workspace') fn(); };

/** Acciones de la barra de menús nativa (ids definidos en `src-tauri/src/menu.rs`). */
const ACTIONS: Record<string, () => void> = {
  'app.options': openOptions,
  'file.new': () => void createProject(),
  'file.open': () => void openProject(),
  'file.sync': inProject(() => void syncCommand()),
  'file.exportXlsx': inProject(() => void exportExcel()),
  'file.importXlsx': inProject(() => void importExcel()),
  'file.close': inProject(() => void closeProject()),
  'edit.newTask': inProject(() => newTask()),
  'edit.find': inProject(() => document.querySelector<HTMLInputElement>('[data-global-search]')?.focus()),
  'view.tasks': inProject(() => setView('tasks')),
  'view.calendar': inProject(() => setView('calendar')),
  'view.reminders': inProject(() => setView('reminders')),
  'view.expenses': inProject(() => setView('expenses')),
  'view.docs': inProject(() => setView('docs')),
  'view.team': inProject(() => setView('team')),
  'window.start': showStart,
};

export function installMenu() {
  backend.onMenu((id) => ACTIONS[id]?.());
  // En el navegador no hay menú nativo: los mismos atajos con el teclado.
  if (backend.kind === 'browser') {
    const keys: Record<string, string> = { '1': 'view.tasks', '2': 'view.calendar', '3': 'view.reminders', '4': 'view.expenses', '5': 'view.docs', '6': 'view.team', f: 'edit.find', s: 'file.sync', e: 'file.exportXlsx', ',': 'app.options' };
    window.addEventListener('keydown', (e) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const id = keys[e.key.toLowerCase()];
      if (id) { e.preventDefault(); ACTIONS[id]?.(); }
    });
  }
}

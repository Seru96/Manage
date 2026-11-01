import { create } from 'zustand';
import { isTauri } from '../platform/backend';

/**
 * Apariencia (Opciones › Apariencia), como en IMPLANTA Install:
 * - oscuro: toda la app oscura (por defecto);
 * - híbrido: barra y paneles oscuros, y en blanco el contenido (tareas, calendario, tablas);
 * - claro: toda la app en claro.
 */
export type Theme = 'dark' | 'hybrid' | 'light';

export const THEMES: readonly { id: Theme; name: string; hint: string }[] = [
  { id: 'light', name: 'Claro', hint: 'Toda la app en claro.' },
  { id: 'hybrid', name: 'Híbrido', hint: 'Paneles oscuros y las tareas, el calendario y las tablas en blanco.' },
  { id: 'dark', name: 'Oscuro', hint: 'Toda la app oscura. Es el modo por defecto.' },
];

const KEY = 'manage.pref.theme';
const isTheme = (v: unknown): v is Theme => v === 'dark' || v === 'hybrid' || v === 'light';
function load(): Theme {
  try { const v = localStorage.getItem(KEY); return isTheme(v) ? v : 'dark'; } catch { return 'dark'; }
}

export const useTheme = create<{ theme: Theme; optionsOpen: boolean }>(() => ({ theme: load(), optionsOpen: false }));

export function setTheme(theme: Theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* sin almacenamiento */ }
  useTheme.setState({ theme });
}

function apply(theme: Theme) {
  const root = document.documentElement;
  root.dataset.ui = theme === 'light' ? 'light' : 'dark';
  root.dataset.canvas = theme === 'dark' ? 'dark' : 'light';
  root.dataset.theme = theme;
  if (isTauri()) {
    void import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().setTheme(theme === 'light' ? 'light' : 'dark'))
      .catch(() => { /* la ventana sigue con el tema del sistema */ });
  }
}

export function installTheme() {
  apply(useTheme.getState().theme);
  useTheme.subscribe((s, prev) => { if (s.theme !== prev.theme) apply(s.theme); });
}

export const openOptions = () => useTheme.setState({ optionsOpen: true });
export const closeOptions = () => useTheme.setState({ optionsOpen: false });

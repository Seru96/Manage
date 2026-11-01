import { create } from 'zustand';
import type { Task } from '../core/model';

export type ViewId = 'tasks' | 'calendar' | 'notes' | 'reminders' | 'access';

export interface Filters {
  /** Texto de búsqueda (nombre, descripción, persona, subdivisión). */
  q: string;
  personId: string | null;
  subdivisionId: string | null;
  hideDone: boolean;
}

interface ViewState {
  screen: 'start' | 'workspace';
  view: ViewId;
  filters: Filters;
  /** Tarea en edición: una existente (id) o una nueva con valores iniciales. */
  editing: { id: string } | { draft: Partial<Task> } | null;
  toast: string | null;
}

export const useView = create<ViewState>(() => ({
  screen: 'start',
  view: 'tasks',
  filters: { q: '', personId: null, subdivisionId: null, hideDone: false },
  editing: null,
  toast: null,
}));

export const setView = (view: ViewId) => useView.setState({ view });
export const setFilters = (f: Partial<Filters>) => useView.setState((s) => ({ filters: { ...s.filters, ...f } }));
export const editTask = (id: string) => useView.setState({ editing: { id } });
export const newTask = (draft: Partial<Task> = {}) => useView.setState({ editing: { draft } });
export const closeEditor = () => useView.setState({ editing: null });

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string) {
  clearTimeout(toastTimer);
  useView.setState({ toast: msg });
  toastTimer = setTimeout(() => useView.setState({ toast: null }), 3_500);
}

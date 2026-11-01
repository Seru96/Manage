import { create } from 'zustand';
import type { Reminder, Task } from '../core/model';

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
  /** Recordatorio en edición (existente o nuevo). */
  editingReminder: { id: string } | { draft: Partial<Reminder> } | null;
  /** Menú contextual de una tarea o un recordatorio. */
  menu: { x: number; y: number; kind: 'task' | 'reminder'; id: string } | null;
  toast: string | null;
}

export const useView = create<ViewState>(() => ({
  screen: 'start',
  view: 'tasks',
  filters: { q: '', personId: null, subdivisionId: null, hideDone: false },
  editing: null,
  editingReminder: null,
  menu: null,
  toast: null,
}));

export const setView = (view: ViewId) => useView.setState({ view });
export const setFilters = (f: Partial<Filters>) => useView.setState((s) => ({ filters: { ...s.filters, ...f } }));
export const editTask = (id: string) => useView.setState({ editing: { id } });
export const newTask = (draft: Partial<Task> = {}) => useView.setState({ editing: { draft } });
export const closeEditor = () => useView.setState({ editing: null });
export const editReminder = (id: string) => useView.setState({ editingReminder: { id } });
export const newReminder = (draft: Partial<Reminder> = {}) => useView.setState({ editingReminder: { draft } });
export const closeReminderEditor = () => useView.setState({ editingReminder: null });
export const openMenu = (e: { clientX: number; clientY: number; preventDefault(): void; stopPropagation(): void }, kind: 'task' | 'reminder', id: string) => {
  e.preventDefault();
  e.stopPropagation();
  useView.setState({ menu: { x: e.clientX, y: e.clientY, kind, id } });
};
export const closeMenu = () => useView.setState({ menu: null });

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string) {
  clearTimeout(toastTimer);
  useView.setState({ toast: msg });
  toastTimer = setTimeout(() => useView.setState({ toast: null }), 3_500);
}

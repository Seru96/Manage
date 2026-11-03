import { create } from 'zustand';
import type { Criticality, Reminder, Task, TaskStatus } from '../core/model';

export type ViewId = 'tasks' | 'calendar' | 'reminders' | 'expenses' | 'docs' | 'team';

export interface Filters {
  /** Texto de búsqueda (nombre, descripción, persona, subdivisión). */
  q: string;
  personId: string | null;
  subdivisionId: string | null;
  /** Empresa: «own» (personal propio), el id de una subcontrata o null (todas). */
  companyId: string | null;
  status: TaskStatus | null;
  criticality: Criticality | null;
  hideDone: boolean;
}

export const NO_FILTERS: Filters = { q: '', personId: null, subdivisionId: null, companyId: null, status: null, criticality: null, hideDone: false };

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
  /** Elemento a resaltar al saltar desde otra vista (p. ej. de una factura a su gasto). */
  highlight: { kind: string; id: string } | null;
}

export const useView = create<ViewState>(() => ({
  screen: 'start',
  view: 'tasks',
  filters: { ...NO_FILTERS },
  editing: null,
  editingReminder: null,
  menu: null,
  toast: null,
  highlight: null,
}));

export const setView = (view: ViewId) => useView.setState({ view });
export const setFilters = (f: Partial<Filters>) => useView.setState((s) => ({ filters: { ...s.filters, ...f } }));
/** Quita los filtros (no la búsqueda). */
export const clearFilters = () => useView.setState((s) => ({ filters: { ...NO_FILTERS, q: s.filters.q } }));
/** Cuántos filtros hay puestos (sin contar la búsqueda). */
export const activeFilters = (f: Filters) => [f.personId, f.subdivisionId, f.companyId, f.status, f.criticality].filter(Boolean).length + (f.hideDone ? 1 : 0);
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

/** Abre una vista y resalta un elemento (se desplaza hasta él). */
export function goTo(view: ViewId, kind: string, id: string) {
  useView.setState({ view, highlight: { kind, id } });
  setTimeout(() => { if (useView.getState().highlight?.id === id) useView.setState({ highlight: null }); }, 2_500);
}

import { addDays, diffDays } from './dates';
import type { DateStr, Task } from './model';

/**
 * Cambiar el inicio mueve la fecha límite con él (la tarea conserva su duración), como al
 * arrastrar en el calendario. Sin fecha límite, la tarea pasa a durar un día.
 */
export function withStart(t: Pick<Task, 'start' | 'due'>, start: DateStr | null): Pick<Task, 'start' | 'due'> {
  if (!start) return { start: null, due: t.due };
  if (!t.due) return { start, due: start };
  // Sin inicio previo la tarea era de un día: el nuevo inicio abre el rango hasta la fecha
  // límite y solo la empuja si queda antes del inicio.
  if (!t.start) return { start, due: start > t.due ? start : t.due };
  const from = t.start <= t.due ? t.start : t.due;
  return { start, due: addDays(start, diffDays(from, t.due)) };
}

/** Cambiar la fecha límite: si queda antes del inicio, el inicio baja con ella. */
export function withDue(t: Pick<Task, 'start' | 'due'>, due: DateStr | null): Pick<Task, 'start' | 'due'> {
  if (due && t.start && t.start > due) return { start: due, due };
  return { start: t.start, due };
}

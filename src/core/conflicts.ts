import { diffDays } from './dates';
import type { DateStr, Task } from './model';

/** Inicio y fin de una tarea en el calendario (sin fecha límite no está en el calendario). */
export function taskSpan(t: Pick<Task, 'start' | 'due'>): { start: DateStr; end: DateStr } | null {
  if (!t.due) return null;
  const start = t.start && t.start <= t.due ? t.start : t.due;
  return { start, end: t.due };
}

export interface Conflict {
  personId: string;
  a: Task;
  b: Task;
  /** Días en los que se solapan. */
  from: DateStr;
  to: DateStr;
}

/**
 * Una misma persona asignada a tareas de dos subdivisiones distintas en fechas que se
 * solapan. Las tareas hechas no cuentan.
 */
export function findConflicts(tasks: Task[]): Conflict[] {
  const byPerson = new Map<string, { t: Task; start: DateStr; end: DateStr }[]>();
  for (const t of tasks) {
    if (!t.assigneeId || !t.subdivisionId || t.status === 'hecha') continue;
    const span = taskSpan(t);
    if (!span) continue;
    let list = byPerson.get(t.assigneeId);
    if (!list) byPerson.set(t.assigneeId, (list = []));
    list.push({ t, ...span });
  }
  const out: Conflict[] = [];
  for (const [personId, list] of byPerson) {
    list.sort((x, y) => x.start.localeCompare(y.start));
    for (let i = 0; i < list.length; i++) {
      const x = list[i]!;
      for (let j = i + 1; j < list.length; j++) {
        const y = list[j]!;
        if (y.start > x.end) break; // ordenadas por inicio: ninguna más se solapa con x
        if (x.t.subdivisionId === y.t.subdivisionId) continue;
        const from = y.start;
        const to = x.end < y.end ? x.end : y.end;
        out.push({ personId, a: x.t, b: y.t, from, to });
      }
    }
  }
  return out.sort((p, q) => p.from.localeCompare(q.from));
}

/** Ids de las tareas implicadas en algún conflicto. */
export const conflictTaskIds = (cs: Conflict[]) => new Set(cs.flatMap((c) => [c.a.id, c.b.id]));

export const conflictDays = (c: Conflict) => diffDays(c.from, c.to) + 1;

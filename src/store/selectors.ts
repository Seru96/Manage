import { useMemo } from 'react';
import { findConflicts } from '../core/conflicts';
import type { Person, Subdivision, Task } from '../core/model';
import { useProject } from './project';
import { useView, type Filters } from './view';

export function useSubdivisions(): Subdivision[] {
  const map = useProject((s) => s.entities.subdivision);
  return useMemo(() => Object.values(map).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'es')), [map]);
}

export function usePeople(): Person[] {
  const map = useProject((s) => s.entities.person);
  return useMemo(() => Object.values(map).sort((a, b) => a.name.localeCompare(b.name, 'es')), [map]);
}

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function matches(t: Task, f: Filters, people: Record<string, Person>, subs: Record<string, Subdivision>): boolean {
  if (f.personId && t.assigneeId !== f.personId) return false;
  if (f.subdivisionId && t.subdivisionId !== f.subdivisionId) return false;
  if (f.hideDone && t.status === 'hecha') return false;
  const q = norm(f.q.trim());
  if (!q) return true;
  const hay = [t.name, t.description, people[t.assigneeId ?? '']?.name ?? '', subs[t.subdivisionId ?? '']?.name ?? ''];
  return hay.some((h) => norm(h).includes(q));
}

/** Tareas que pasan la búsqueda y los filtros (los mismos en todas las vistas). */
export function useFilteredTasks(): Task[] {
  const tasks = useProject((s) => s.entities.task);
  const people = useProject((s) => s.entities.person);
  const subs = useProject((s) => s.entities.subdivision);
  const filters = useView((s) => s.filters);
  return useMemo(() => Object.values(tasks).filter((t) => matches(t, filters, people, subs)), [tasks, people, subs, filters]);
}

/** Conflictos de todo el proyecto (no dependen de los filtros). */
export function useConflicts() {
  const tasks = useProject((s) => s.entities.task);
  return useMemo(() => findConflicts(Object.values(tasks)), [tasks]);
}

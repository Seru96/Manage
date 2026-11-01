import { useMemo } from 'react';
import { findConflicts } from '../core/conflicts';
import { assignees, isGeneral, type Company, type Person, type Subdivision, type Task } from '../core/model';
import { useProject } from './project';
import { useView, type Filters } from './view';

/** Subdivisiones en orden, la general siempre la primera. */
export function useSubdivisions(): Subdivision[] {
  const map = useProject((s) => s.entities.subdivision);
  return useMemo(() => Object.values(map).sort((a, b) =>
    Number(isGeneral(b)) - Number(isGeneral(a)) || a.order - b.order || a.name.localeCompare(b.name, 'es')), [map]);
}

/** Todo el equipo, el propio primero y luego por empresa. */
export function usePeople(): Person[] {
  const map = useProject((s) => s.entities.person);
  const companies = useProject((s) => s.entities.company);
  return useMemo(() => Object.values(map).sort((a, b) =>
    (companies[a.companyId ?? '']?.name ?? '').localeCompare(companies[b.companyId ?? '']?.name ?? '', 'es')
    || personLabel(a).localeCompare(personLabel(b), 'es')), [map, companies]);
}

export function useCompanies(): Company[] {
  const map = useProject((s) => s.entities.company);
  return useMemo(() => Object.values(map).sort((a, b) => a.name.localeCompare(b.name, 'es')), [map]);
}

/** Nombre a mostrar de una persona. */
export const personLabel = (p: Person | undefined) => p?.name.trim() || [p?.values?.nombre, p?.values?.apellidos].filter(Boolean).join(' ') || 'Sin nombre';

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function matches(t: Task, f: Filters, people: Record<string, Person>, subs: Record<string, Subdivision>): boolean {
  const who = assignees(t);
  if (f.personId && !who.includes(f.personId)) return false;
  if (!inSubdivision(t.subdivisionId, f.subdivisionId, subs)) return false;
  if (f.hideDone && t.status === 'hecha') return false;
  const q = norm(f.q.trim());
  if (!q) return true;
  const hay = [t.name, t.description, ...who.map((id) => people[id]?.name ?? ''), subs[t.subdivisionId ?? '']?.name ?? ''];
  return hay.some((h) => norm(h).includes(q));
}

/**
 * ¿Pertenece algo de la subdivisión `own` a la elegida en el filtro? La general abarca a
 * todas: elegida, lo enseña todo; y lo suyo sale también al elegir cualquier otra.
 */
export function inSubdivision(own: string | null, filter: string | null, subs: Record<string, Subdivision>): boolean {
  if (!filter || own === filter) return true;
  return isGeneral(subs[filter]) || isGeneral(subs[own ?? '']);
}

export function useGeneralIds(): Set<string> {
  const subs = useProject((s) => s.entities.subdivision);
  return useMemo(() => new Set(Object.values(subs).filter(isGeneral).map((s) => s.id)), [subs]);
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
  const general = useGeneralIds();
  return useMemo(() => findConflicts(Object.values(tasks), general), [tasks, general]);
}

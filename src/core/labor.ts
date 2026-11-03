/** Jornadas de subcontratas llevadas a pedidos como gasto. */
import type { Attendance, DateStr, Expense, Labor, Person, Subdivision } from './model';
import { isGeneral } from './model';
import { round2 } from './money';

export interface LaborQuery { companyId: string; from: DateStr; to: DateStr; subdivisionId: string | null }

/** Jornadas de la empresa entre las fechas (y del sitio, si se pide; la general abarca todos). */
export function shiftsIn(q: LaborQuery, attendance: Attendance[], people: Record<string, Person>, subs: Record<string, Subdivision>): Attendance[] {
  const anySite = !q.subdivisionId || isGeneral(subs[q.subdivisionId]);
  return attendance.filter((a) => people[a.personId]?.companyId === q.companyId && a.date >= q.from && a.date <= q.to
    && (anySite || a.subdivisionId === q.subdivisionId));
}

/** Jornadas por persona, de más a menos. */
export function shiftsByPerson(list: Attendance[]): [string, number][] {
  const m = new Map<string, number>();
  for (const a of list) m.set(a.personId, (m.get(a.personId) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]);
}

export const laborAmount = (rate: number, shifts: number) => round2(rate * shifts);

/** ¿Está ya esa jornada en otro gasto de jornadas? (Para avisar de que se cobraría dos veces.) */
export function inLabor(a: Attendance, l: Labor, people: Record<string, Person>, subs: Record<string, Subdivision>): boolean {
  return l.personIds.includes(a.personId) && shiftsIn(l, [a], people, subs).length === 1;
}

/** Jornadas de la lista que ya están cargadas en otros gastos (sin contar `exceptId`). */
export function alreadyCharged(list: Attendance[], expenses: Expense[], exceptId: string | null, people: Record<string, Person>, subs: Record<string, Subdivision>): Attendance[] {
  const others = expenses.filter((e) => e.labor && e.id !== exceptId).map((e) => e.labor!);
  return list.filter((a) => others.some((l) => inLabor(a, l, people, subs)));
}

/**
 * Sitio de una jornada apuntada arrastrando: el de la subdivisión filtrada (si no es la
 * general); si no, el único sitio al que tiene acceso la persona; si no, la general o nada.
 */
export function siteFor(p: Person, filterSub: string | null, subs: Subdivision[]): string | null {
  const byId = new Map(subs.map((s) => [s.id, s]));
  if (filterSub && byId.has(filterSub) && !isGeneral(byId.get(filterSub))) return filterSub;
  const own = (p.siteIds ?? []).filter((id) => byId.has(id) && !isGeneral(byId.get(id)));
  if (own.length === 1) return own[0]!;
  return filterSub ?? subs.find(isGeneral)?.id ?? null;
}

import type { DateStr } from './model';

const pad = (n: number) => String(n).padStart(2, '0');

/** Date local → «2026-11-03». */
export const toDateStr = (d: Date): DateStr => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** «2026-11-03» → Date local a mediodía (sin sustos con el cambio de hora). */
export function parseDate(s: DateStr): Date {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, 12);
}

export const today = (): DateStr => toDateStr(new Date());

export function addDays(s: DateStr, n: number): DateStr {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

/** Días de `a` a `b` (b − a). */
export const diffDays = (a: DateStr, b: DateStr) => Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);

/** Semanas (de lunes a domingo) que cubren el mes, como en Calendario de Apple. */
export function monthWeeks(year: number, month: number): DateStr[][] {
  const first = new Date(year, month, 1, 12);
  const offset = (first.getDay() + 6) % 7; // lunes = 0
  let cur = addDays(toDateStr(first), -offset);
  const weeks: DateStr[][] = [];
  do {
    const week: DateStr[] = [];
    for (let i = 0; i < 7; i++) { week.push(cur); cur = addDays(cur, 1); }
    weeks.push(week);
  } while (parseDate(cur).getMonth() === month);
  return weeks;
}

export const fmtShort = (s: DateStr) => parseDate(s).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
export const fmtMonth = (y: number, m: number) => {
  const t = new Date(y, m, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

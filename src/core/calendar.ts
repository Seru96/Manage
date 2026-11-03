/** Cómo se pinta una tarea en una semana del calendario (lunes a domingo). */
import { addDays } from './dates';
import type { DateStr } from './model';

/**
 * Tramos (columnas 0 = lunes … 6 = domingo) en los que se ve una tarea de `start` a `end`
 * dentro de la semana que empieza en `monday`. El sábado y el domingo se saltan, salvo que
 * la tarea empiece o acabe ese fin de semana (entonces se eligió a propósito y se ven).
 */
export function visibleRuns(start: DateStr, end: DateStr, monday: DateStr): { from: number; to: number }[] {
  const sat = addDays(monday, 5), sun = addDays(monday, 6);
  const weekendChosen = (start >= sat && start <= sun) || (end >= sat && end <= sun);
  const runs: { from: number; to: number }[] = [];
  for (let c = 0; c < 7; c++) {
    const d = addDays(monday, c);
    const on = d >= start && d <= end && (c < 5 || weekendChosen);
    const last = runs.at(-1);
    if (!on) continue;
    if (last && last.to === c - 1) last.to = c;
    else runs.push({ from: c, to: c });
  }
  return runs;
}

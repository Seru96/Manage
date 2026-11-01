/**
 * Avisos de los recordatorios con notificaciones nativas (Windows / macOS). Se comprueba
 * cada 30 s mientras la app está abierta y nada más abrir un proyecto (así se avisa de los
 * que vencieron con la app cerrada). Lo ya avisado se recuerda en este equipo, no en el
 * proyecto: cada persona recibe su aviso.
 */
import { REMINDER_KIND, type Reminder } from '../core/model';
import { backend } from '../platform/backend';
import { useProject } from '../store/project';
import { toast } from '../store/view';

const KEY = 'manage:avisados';
const pad = (n: number) => String(n).padStart(2, '0');

/** Date → «2026-11-03T09:30» (hora local, como el campo datetime-local). */
export const toLocalIso = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const fmtReminder = (at: string) =>
  new Date(at).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const notified = (): Set<string> => new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]'));
const keyOf = (r: Reminder) => `${r.id}@${r.at}`;

/** Recordatorios vencidos y sin avisar en este equipo. */
export function dueReminders(list: Reminder[], now: string, seen: Set<string>) {
  return list.filter((r) => !r.done && r.at <= now && !seen.has(keyOf(r))).sort((a, b) => a.at.localeCompare(b.at));
}

export async function checkReminders() {
  const { path, name, entities } = useProject.getState();
  if (!path) return;
  const seen = notified();
  const due = dueReminders(Object.values(entities.reminder), toLocalIso(new Date()), seen);
  if (!due.length) return;
  for (const r of due) seen.add(keyOf(r));
  localStorage.setItem(KEY, JSON.stringify([...seen].slice(-2000)));
  const sub = (r: Reminder) => entities.subdivision[r.subdivisionId ?? '']?.name;
  if (due.length <= 3) {
    for (const r of due) {
      await backend.notify(`${REMINDER_KIND[r.kind]}: ${r.title}`, [name, sub(r), fmtReminder(r.at)].filter(Boolean).join(' · '));
    }
  } else {
    await backend.notify(`${due.length} recordatorios pendientes`, `${name}: ${due.slice(0, 3).map((r) => r.title).join(', ')}…`);
  }
  toast(due.length === 1 ? `Recordatorio: ${due[0]!.title}` : `${due.length} recordatorios pendientes`);
}

let timer: ReturnType<typeof setInterval> | undefined;
export function installReminders() {
  clearInterval(timer);
  timer = setInterval(() => void checkReminders(), 30_000);
  // Al abrir un proyecto (o cambiar de proyecto), comprobar enseguida.
  useProject.subscribe((s, prev) => { if (s.path && s.path !== prev.path) setTimeout(() => void checkReminders(), 1_500); });
}

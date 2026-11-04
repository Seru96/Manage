/**
 * Arrastrar personas desde el panel izquierdo:
 * - al calendario de Tareas o a un grupo de la lista de Tareas → abre una tarea nueva con
 *   ellas asignadas (y el día o la subdivisión donde se soltaron);
 * - al calendario de Subcontratas → apunta su jornada ese día, sin preguntar.
 * Va con eventos de puntero (como el resto de arrastres del calendario): funciona igual en el
 * Mac, en Windows y en las pruebas.
 */
import { create } from 'zustand';
import { siteFor } from '../core/labor';
import { attendanceId, withAssignees, type DateStr, type Person } from '../core/model';
import { fmtShort } from '../core/dates';
import { upsert, useProject } from '../store/project';
import { personLabel } from '../store/selectors';
import { newTask, toast, useView } from '../store/view';
import { initials } from './TasksView';

interface DragState { ids: string[]; label: string; color: string; x: number; y: number }
export const usePersonDrag = create<{ drag: DragState | null }>(() => ({ drag: null }));

let suppressClick = false;
/** ¿El clic que llega es el final de un arrastre? (Entonces no filtra.) */
export const wasDragged = () => { const v = suppressClick; suppressClick = false; return v; };

type Target = { kind: 'task' | 'attendance'; date: DateStr; el: HTMLElement } | { kind: 'group'; subdivisionId: string | null; el: HTMLElement };

/** Lo que hay bajo el puntero: un día de calendario (por geometría: los eventos tapan las celdas) o un grupo de Tareas. */
function targetAt(x: number, y: number): Target | null {
  for (const el of document.querySelectorAll<HTMLElement>('[data-drop] .cal-day[data-date]')) {
    const r = el.getBoundingClientRect();
    if (x >= r.left && x < r.right && y >= r.top && y < r.bottom) {
      const kind = el.closest<HTMLElement>('[data-drop]')!.dataset.drop === 'attendance' ? 'attendance' : 'task';
      return { kind, date: el.dataset.date!, el };
    }
  }
  const g = document.elementFromPoint(x, y)?.closest<HTMLElement>('.task-group[data-subdivision]');
  if (g) return { kind: 'group', subdivisionId: g.dataset.subdivision || null, el: g };
  return null;
}

let hovered: HTMLElement | null = null;
function hover(el: HTMLElement | null) {
  if (hovered === el) return;
  hovered?.classList.remove('drop-hover');
  el?.classList.add('drop-hover');
  hovered = el;
}

/** Empieza a arrastrar a una o varias personas (al moverse unos píxeles; antes es un clic). */
export function startPersonDrag(ev: React.PointerEvent, ids: string[], label: string, color: string) {
  if (ev.button !== 0 || !ids.length) return;
  const x0 = ev.clientX, y0 = ev.clientY;
  let active = false;
  const move = (e: PointerEvent) => {
    if (!active && Math.hypot(e.clientX - x0, e.clientY - y0) < 5) return;
    active = true;
    e.preventDefault();
    usePersonDrag.setState({ drag: { ids, label, color, x: e.clientX, y: e.clientY } });
    hover(targetAt(e.clientX, e.clientY)?.el ?? null);
  };
  const up = (e: PointerEvent) => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('keydown', esc);
    hover(null);
    usePersonDrag.setState({ drag: null });
    if (!active) return;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    const t = targetAt(e.clientX, e.clientY);
    if (t) dropPeople(ids, t);
  };
  const esc = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    active = false;
    up(new PointerEvent('pointerup'));
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('keydown', esc);
}

function dropPeople(ids: string[], t: Target) {
  const { entities } = useProject.getState();
  const filterSub = useView.getState().filters.subdivisionId;
  if (t.kind === 'group') return newTask({ ...withAssignees(ids), subdivisionId: t.subdivisionId });
  if (t.kind === 'task') return newTask({ ...withAssignees(ids), due: t.date, ...(filterSub ? { subdivisionId: filterSub } : {}) });

  const people = ids.map((id) => entities.person[id]).filter((p): p is Person => !!p);
  const subs = Object.values(entities.subdivision);
  const external = people.filter((p) => p.companyId);
  if (!external.length) return toast('El calendario de Subcontratas es para el personal de otras empresas. Arrástralo al de Tareas para asignarle trabajo.');
  let added = 0;
  const where = new Set<string>();
  for (const p of external) {
    const id = attendanceId(t.date, p.id);
    if (entities.attendance[id]) continue; // ya estaba: se respeta su sitio
    const sub = siteFor(p, filterSub, subs);
    upsert('attendance', { id, personId: p.id, date: t.date, subdivisionId: sub });
    if (sub) where.add(entities.subdivision[sub]?.name ?? '');
    added++;
  }
  const who = external.length === 1 ? personLabel(external[0]) : `${added} personas`;
  toast(added ? `${who}: jornada el ${fmtShort(t.date)}${where.size ? ` en ${[...where].join(', ')}` : ''}` : `Ya estaba${external.length > 1 ? 'n' : ''} apuntad${external.length > 1 ? 'os' : 'o'} el ${fmtShort(t.date)}`);
}

/** La etiqueta que sigue al puntero mientras se arrastra. */
export function DragGhost() {
  const drag = usePersonDrag((s) => s.drag);
  if (!drag) return null;
  return (
    <div className="drag-ghost" style={{ left: drag.x + 12, top: drag.y + 10 }} aria-hidden>
      <span className="avatar" style={{ background: drag.color }}>{drag.ids.length > 1 ? drag.ids.length : initials(drag.label)}</span>
      <span>{drag.label}</span>
    </div>
  );
}

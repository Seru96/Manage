import { useEffect, useMemo, useRef, useState } from 'react';
import { conflictTaskIds, taskSpan } from '../core/conflicts';
import { addDays, diffDays, fmtMonth, monthWeeks, parseDate, today } from '../core/dates';
import { REMINDER_KIND, STATUS, type DateStr } from '../core/model';
import { patch, useProject } from '../store/project';
import { inSubdivision, useConflicts, useFilteredTasks } from '../store/selectors';
import { editReminder, editTask, newTask, openMenu, useView } from '../store/view';
import { Icon } from './icons';

const WEEKDAYS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const MAX_LANES = 4;
const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

type DragMode = 'move' | 'start' | 'end';
interface Drag { key: string; mode: DragMode; origin: DateStr; start: DateStr; end: DateStr; delta: number }

/** Lo que se pinta en el calendario: una tarea (de su inicio a su fecha límite) o un recordatorio suelto (un día). */
interface Entry {
  key: string;
  kind: 'task' | 'reminder';
  id: string;
  name: string;
  start: DateStr;
  end: DateStr;
  /** Clase de color de fondo: el estado de la tarea o «reminder». */
  tone: string;
  /** Color de la franja: subdivisión o persona. */
  color: string;
  tip: string;
  who?: string;
  conflict?: boolean;
  critical?: boolean;
}

interface Segment { e: Entry; col: number; span: number; lane: number; clipL: boolean; clipR: boolean }

/** Reparte los eventos de una semana en carriles, como Calendario de Apple. */
function layoutWeek(week: DateStr[], items: Entry[]): Segment[] {
  const first = week[0]!, last = week[6]!;
  const segs = items
    .filter((i) => i.start <= last && i.end >= first)
    .map((i) => {
      const s = i.start < first ? first : i.start;
      const e = i.end > last ? last : i.end;
      return { e: i, col: diffDays(first, s), span: diffDays(s, e) + 1, lane: 0, clipL: i.start < first, clipR: i.end > last };
    })
    .sort((a, b) => a.col - b.col || b.span - a.span || a.e.name.localeCompare(b.e.name, 'es'));
  const lanes: number[] = [];
  for (const s of segs) {
    let lane = lanes.findIndex((end) => end < s.col);
    if (lane < 0) { lane = lanes.length; lanes.push(-1); }
    lanes[lane] = s.col + s.span - 1;
    s.lane = lane;
  }
  return segs;
}

/**
 * Vista mensual. Arrastrar mueve (también los recordatorios), tirar de los bordes alarga o
 * acorta una tarea, clic edita y clic derecho abre el menú (estado, mover, borrar).
 * El fondo dice el estado; la franja de la izquierda, la subdivisión o la persona.
 */
export function CalendarView() {
  const tasks = useFilteredTasks();
  const reminders = useProject((s) => s.entities.reminder);
  const subs = useProject((s) => s.entities.subdivision);
  const people = useProject((s) => s.entities.person);
  const filters = useView((s) => s.filters);
  const conflicts = useConflicts();
  const inConflict = useMemo(() => conflictTaskIds(conflicts), [conflicts]);
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [colorBy, setColorBy] = useState<'subdivision' | 'person'>('subdivision');
  const [drag, setDrag] = useState<Drag | null>(null);
  const moved = useRef(false);

  const weeks = useMemo(() => monthWeeks(cursor.y, cursor.m), [cursor]);
  const now = today();

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    for (const t of tasks) {
      const span = taskSpan(t);
      if (!span) continue;
      const who = people[t.assigneeId ?? ''];
      const color = (colorBy === 'person' ? who?.color : subs[t.subdivisionId ?? '']?.color) ?? '#8e8e93';
      out.push({
        key: `task:${t.id}`, kind: 'task', id: t.id, name: t.name, ...span, tone: t.status, color, who: who?.name,
        tip: `${t.name} · ${STATUS[t.status]}${who ? ` · ${who.name}` : ''}`, conflict: inConflict.has(t.id), critical: t.criticality === 'critica',
      });
    }
    if (!filters.personId) {
      const q = norm(filters.q.trim());
      for (const r of Object.values(reminders)) {
        if (r.taskId || !inSubdivision(r.subdivisionId, filters.subdivisionId, subs) || (q && !norm(r.title).includes(q)) || (filters.hideDone && r.done)) continue;
        const day = r.at.slice(0, 10);
        out.push({
          key: `reminder:${r.id}`, kind: 'reminder', id: r.id, name: `${r.at.slice(11, 16)} ${r.title}`, start: day, end: day,
          tone: 'reminder', color: subs[r.subdivisionId ?? '']?.color ?? 'var(--st-reminder)', tip: `${REMINDER_KIND[r.kind]}: ${r.title}`,
        });
      }
    }
    // Vista previa del arrastre.
    return out.map((e) => (drag?.key === e.key ? { ...e, ...preview(drag) } : e));
  }, [tasks, reminders, subs, people, colorBy, inConflict, filters, drag]);

  const conflictDays = useMemo(() => {
    const set = new Set<DateStr>();
    for (const c of conflicts) {
      if (filters.personId && c.personId !== filters.personId) continue;
      for (let d = c.from; d <= c.to; d = addDays(d, 1)) set.add(d);
    }
    return set;
  }, [conflicts, filters.personId]);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const d = dateAt(e);
      if (!d) return;
      const delta = diffDays(drag.origin, d);
      if (delta !== drag.delta) { moved.current = true; setDrag({ ...drag, delta }); }
    };
    const onUp = () => {
      if (drag.delta !== 0) commit(drag);
      setDrag(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [drag]);

  const startDrag = (ev: React.PointerEvent, e: Entry, mode: DragMode) => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    ev.stopPropagation();
    moved.current = false;
    setDrag({ key: e.key, mode, origin: dateAt(ev) ?? e.start, start: e.start, end: e.end, delta: 0 });
  };

  const go = (n: number) => setCursor(({ y, m }) => { const d = new Date(y, m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  return (
    <div className={`view calendar-view${drag ? ' dragging' : ''}`}>
      <div className="view-head">
        <h1>{fmtMonth(cursor.y, cursor.m)}</h1>
        <div className="seg-nav">
          <button className="btn icon-only" onClick={() => go(-1)} aria-label="Mes anterior"><Icon name="chevL" size={14} /></button>
          <button className="btn" onClick={() => { const d = new Date(); setCursor({ y: d.getFullYear(), m: d.getMonth() }); }}>Hoy</button>
          <button className="btn icon-only" onClick={() => go(1)} aria-label="Mes siguiente"><Icon name="chevR" size={14} /></button>
        </div>
        <div className="view-tools">
          <div className="segmented" role="radiogroup" aria-label="Color de la franja">
            <button className={colorBy === 'subdivision' ? 'on' : ''} onClick={() => setColorBy('subdivision')}>Por subdivisión</button>
            <button className={colorBy === 'person' ? 'on' : ''} onClick={() => setColorBy('person')}>Por persona</button>
          </div>
          <button className="btn primary" onClick={() => newTask()}><Icon name="plus" size={14} /> Nueva tarea</button>
        </div>
      </div>

      <div className="cal">
        <div className="cal-weekdays">{WEEKDAYS.map((d) => <span key={d}>{d}</span>)}</div>
        <div className="cal-weeks" style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
          {weeks.map((week) => {
            const segs = layoutWeek(week, entries);
            const hidden = new Map<number, number>();
            for (const s of segs) if (s.lane >= MAX_LANES) for (let c = s.col; c < s.col + s.span; c++) hidden.set(c, (hidden.get(c) ?? 0) + 1);
            return (
              <div key={week[0]} className="cal-week" data-week-start={week[0]}>
                {week.map((d, i) => {
                  const date = parseDate(d);
                  return (
                    <div key={d} data-date={d}
                      className={`cal-day${date.getMonth() !== cursor.m ? ' other' : ''}${d === now ? ' today' : ''}${i >= 5 ? ' weekend' : ''}${conflictDays.has(d) ? ' conflict' : ''}`}
                      onDoubleClick={() => newTask({ due: d })} title="Doble clic para crear una tarea este día">
                      <span className="cal-num">{date.getDate() === 1 ? date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : date.getDate()}</span>
                      {conflictDays.has(d) && <span className="cal-warn" title="Alguien está asignado a dos subdivisiones este día"><Icon name="warn" size={12} /></span>}
                      {hidden.get(i) ? <span className="cal-more">+{hidden.get(i)} más</span> : null}
                    </div>
                  );
                })}
                <div className="cal-events">
                  {segs.filter((s) => s.lane < MAX_LANES).map((s) => {
                    const e = s.e;
                    const resizable = e.kind === 'task';
                    return (
                      <div key={e.key} data-event={e.id} data-kind={e.kind}
                        className={`ev st-bg ${e.tone}${e.critical ? ' critical' : ''}${e.conflict ? ' conflict' : ''}${drag?.key === e.key ? ' active' : ''}${s.clipL ? ' clip-l' : ''}${s.clipR ? ' clip-r' : ''}`}
                        style={{ gridColumn: `${s.col + 1} / span ${s.span}`, gridRow: s.lane + 1, ['--ev' as string]: e.color }}
                        title={`${e.tip}\nArrastra para mover${resizable ? '; tira de los bordes para cambiar las fechas' : ''} · clic derecho: más opciones`}
                        onPointerDown={(ev) => startDrag(ev, e, 'move')}
                        onContextMenu={(ev) => openMenu(ev, e.kind, e.id)}
                        onClick={() => { if (!moved.current) (e.kind === 'task' ? editTask(e.id) : editReminder(e.id)); }}>
                        {resizable && !s.clipL && <span className="ev-handle l" onPointerDown={(ev) => startDrag(ev, e, 'start')} />}
                        {e.kind === 'reminder' && <Icon name="bell" size={11} />}
                        <span className="ev-label">{e.name}{e.who && colorBy === 'subdivision' ? <span className="ev-who"> · {e.who.split(' ')[0]}</span> : null}</span>
                        {resizable && !s.clipR && <span className="ev-handle r" onPointerDown={(ev) => startDrag(ev, e, 'end')} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="cal-legend" aria-label="Leyenda">
        {Object.entries(STATUS).map(([k, v]) => <span key={k}><span className={`st-dot ${k}`} />{v}</span>)}
        <span><span className="st-dot" style={{ background: 'var(--st-reminder)' }} />Recordatorio</span>
        <span className="cal-hint">Clic derecho en una tarea para cambiar su estado, moverla o borrarla</span>
      </div>
    </div>
  );
}

/** Guarda el arrastre: las fechas de la tarea o el día del recordatorio (con su hora). */
function commit(d: Drag) {
  const p = preview(d);
  const [kind, id] = d.key.split(':') as ['task' | 'reminder', string];
  const { entities } = useProject.getState();
  if (kind === 'task') {
    const t = entities.task[id];
    if (t) patch('task', id, { start: p.start === p.end && !t.start ? null : p.start, due: p.end });
  } else {
    const r = entities.reminder[id];
    if (r) patch('reminder', id, { at: `${p.start}${r.at.slice(10)}` });
  }
}

/** Día bajo el puntero, por geometría (los eventos tapan las celdas). */
function dateAt(e: { clientX: number; clientY: number }): DateStr | undefined {
  for (const el of document.querySelectorAll<HTMLElement>('.cal-day[data-date]')) {
    const r = el.getBoundingClientRect();
    if (e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom) return el.dataset.date;
  }
  return undefined;
}

function preview(d: Drag): { start: DateStr; end: DateStr } {
  if (d.mode === 'move') return { start: addDays(d.start, d.delta), end: addDays(d.end, d.delta) };
  if (d.mode === 'start') { const s = addDays(d.start, d.delta); return { start: s > d.end ? d.end : s, end: d.end }; }
  const e = addDays(d.end, d.delta);
  return { start: d.start, end: e < d.start ? d.start : e };
}

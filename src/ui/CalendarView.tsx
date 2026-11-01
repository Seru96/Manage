import { useEffect, useMemo, useRef, useState } from 'react';
import { conflictTaskIds, taskSpan } from '../core/conflicts';
import { addDays, diffDays, fmtMonth, monthWeeks, parseDate, today } from '../core/dates';
import type { DateStr, Task } from '../core/model';
import { patch, useProject } from '../store/project';
import { useConflicts, useFilteredTasks } from '../store/selectors';
import { editTask, newTask, useView } from '../store/view';
import { Icon } from './icons';

const WEEKDAYS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const MAX_LANES = 4;

type DragMode = 'move' | 'start' | 'end';
interface Drag { taskId: string; mode: DragMode; origin: DateStr; start: DateStr; end: DateStr; delta: number }

interface Segment { task: Task; col: number; span: number; lane: number; clipL: boolean; clipR: boolean }

/** Reparte los eventos de una semana en carriles, como Calendario de Apple. */
function layoutWeek(week: DateStr[], items: { task: Task; start: DateStr; end: DateStr }[]): Segment[] {
  const first = week[0]!, last = week[6]!;
  const segs = items
    .filter((i) => i.start <= last && i.end >= first)
    .map((i) => {
      const s = i.start < first ? first : i.start;
      const e = i.end > last ? last : i.end;
      return { task: i.task, col: diffDays(first, s), span: diffDays(s, e) + 1, lane: 0, clipL: i.start < first, clipR: i.end > last };
    })
    .sort((a, b) => a.col - b.col || b.span - a.span || a.task.name.localeCompare(b.task.name, 'es'));
  const lanes: number[] = []; // última columna ocupada en cada carril
  for (const s of segs) {
    let lane = lanes.findIndex((end) => end < s.col);
    if (lane < 0) { lane = lanes.length; lanes.push(-1); }
    lanes[lane] = s.col + s.span - 1;
    s.lane = lane;
  }
  return segs;
}

/** Vista mensual: arrastrar para mover, tirar de los bordes para alargar o acortar. */
export function CalendarView() {
  const tasks = useFilteredTasks();
  const subs = useProject((s) => s.entities.subdivision);
  const people = useProject((s) => s.entities.person);
  const personFilter = useView((s) => s.filters.personId);
  const conflicts = useConflicts();
  const inConflict = useMemo(() => conflictTaskIds(conflicts), [conflicts]);
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [colorBy, setColorBy] = useState<'subdivision' | 'person'>('subdivision');
  const [drag, setDrag] = useState<Drag | null>(null);
  const moved = useRef(false);

  const weeks = useMemo(() => monthWeeks(cursor.y, cursor.m), [cursor]);
  const now = today();

  // Fechas efectivas, con la vista previa del arrastre aplicada.
  const items = useMemo(() => tasks.flatMap((task) => {
    const span = taskSpan(task);
    if (!span) return [];
    if (drag?.taskId === task.id) return [{ task, ...preview(drag) }];
    return [{ task, ...span }];
  }), [tasks, drag]);

  // Días con conflicto (de las personas visibles).
  const conflictDays = useMemo(() => {
    const set = new Set<DateStr>();
    for (const c of conflicts) {
      if (personFilter && c.personId !== personFilter) continue;
      for (let d = c.from; d <= c.to; d = addDays(d, 1)) set.add(d);
    }
    return set;
  }, [conflicts, personFilter]);

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const d = dateAt(e);
      if (!d) return;
      const delta = diffDays(drag.origin, d);
      if (delta !== drag.delta) { moved.current = true; setDrag({ ...drag, delta }); }
    };
    const onUp = () => {
      const task = tasks.find((t) => t.id === drag.taskId);
      if (task && drag.delta !== 0) {
        const p = preview(drag);
        patch('task', task.id, { start: p.start === p.end && !task.start ? null : p.start, due: p.end });
      }
      setDrag(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
    return () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
  }, [drag, tasks]);

  const startDrag = (e: React.PointerEvent, task: Task, mode: DragMode) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const span = taskSpan(task)!;
    const origin = dateAt(e) ?? span.start;
    moved.current = false;
    setDrag({ taskId: task.id, mode, origin, start: span.start, end: span.end, delta: 0 });
  };

  const colorOf = (t: Task) => (colorBy === 'person' ? people[t.assigneeId ?? '']?.color : subs[t.subdivisionId ?? '']?.color) ?? '#8e8e93';
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
          <div className="segmented" role="radiogroup" aria-label="Color de los eventos">
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
            const segs = layoutWeek(week, items);
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
                    const color = colorOf(s.task);
                    const who = people[s.task.assigneeId ?? ''];
                    return (
                      <div key={s.task.id} data-event={s.task.id}
                        className={`ev crit-${s.task.criticality}${s.task.status === 'hecha' ? ' done' : ''}${inConflict.has(s.task.id) ? ' conflict' : ''}${drag?.taskId === s.task.id ? ' active' : ''}${s.clipL ? ' clip-l' : ''}${s.clipR ? ' clip-r' : ''}`}
                        style={{ gridColumn: `${s.col + 1} / span ${s.span}`, gridRow: s.lane + 1, ['--ev' as string]: color }}
                        title={`${s.task.name}${who ? ` · ${who.name}` : ''}\nArrastra para mover; tira de los bordes para cambiar las fechas`}
                        onPointerDown={(e) => startDrag(e, s.task, 'move')}
                        onClick={() => { if (!moved.current) editTask(s.task.id); }}>
                        {!s.clipL && <span className="ev-handle l" onPointerDown={(e) => startDrag(e, s.task, 'start')} />}
                        <span className="ev-label">{s.task.name}{who && colorBy === 'subdivision' ? <span className="ev-who"> · {who.name.split(' ')[0]}</span> : null}</span>
                        {!s.clipR && <span className="ev-handle r" onPointerDown={(e) => startDrag(e, s.task, 'end')} />}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
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

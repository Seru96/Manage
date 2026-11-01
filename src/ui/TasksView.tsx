import { useMemo, useState } from 'react';
import { deleteReminder, deleteTask, moveItem } from '../app/items';
import { fmtReminder } from '../app/reminders';
import { conflictTaskIds } from '../core/conflicts';
import { fmtShort, today } from '../core/dates';
import { CRITICALITY, isGeneral, REMINDER_KIND, STATUS, type Reminder, type Task, type TaskStatus } from '../core/model';
import { patch, useProject } from '../store/project';
import { inSubdivision, useConflicts, useFilteredTasks, useSubdivisions } from '../store/selectors';
import { editReminder, editTask, newReminder, newTask, openMenu, useView } from '../store/view';
import { Icon } from './icons';

type SortKey = 'due' | 'criticality' | 'name';
const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Fecha con la que se ordena: la límite de la tarea o el día del recordatorio. */
const dateOf = (x: { kind: 'task'; t: Task } | { kind: 'reminder'; r: Reminder }) => (x.kind === 'task' ? x.t.due ?? '9' : x.r.at.slice(0, 10));

/**
 * Lista de tareas agrupada por subdivisión. Los recordatorios sin tarea salen también, como
 * elementos propios. Clic para editar, clic derecho para el menú (estado, mover, borrar) y
 * arrastrar una fila a otro grupo para moverla de subdivisión.
 */
export function TasksView() {
  const tasks = useFilteredTasks();
  const allReminders = useProject((s) => s.entities.reminder);
  const subsMap = useProject((s) => s.entities.subdivision);
  const subs = useSubdivisions();
  const people = useProject((s) => s.entities.person);
  const filters = useView((s) => s.filters);
  const conflicts = useConflicts();
  const inConflict = useMemo(() => conflictTaskIds(conflicts), [conflicts]);
  const [sort, setSort] = useState<SortKey>('due');
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [dropOn, setDropOn] = useState<string | null>(null);

  // Recordatorios sueltos (sin tarea), con los mismos filtros. No tienen persona asignada.
  const reminders = useMemo(() => {
    if (filters.personId) return [];
    const q = norm(filters.q.trim());
    return Object.values(allReminders).filter((r) => !r.taskId && inSubdivision(r.subdivisionId, filters.subdivisionId, subsMap)
      && (!q || norm(r.title).includes(q)) && !(filters.hideDone && r.done));
  }, [allReminders, filters, subsMap]);

  const groups = useMemo(() => {
    type Item = { kind: 'task'; t: Task } | { kind: 'reminder'; r: Reminder };
    const cmp = (a: Item, b: Item) => {
      const name = (x: Item) => (x.kind === 'task' ? x.t.name : x.r.title);
      const rank = (x: Item) => (x.kind === 'task' ? CRITICALITY[x.t.criticality].rank : 1);
      if (sort === 'name') return name(a).localeCompare(name(b), 'es');
      if (sort === 'criticality') return rank(b) - rank(a) || dateOf(a).localeCompare(dateOf(b));
      return dateOf(a).localeCompare(dateOf(b)) || rank(b) - rank(a);
    };
    const by = new Map<string | null, Item[]>();
    const add = (sub: string | null, item: Item) => {
      const key = sub && subsMap[sub] ? sub : null;
      by.set(key, [...(by.get(key) ?? []), item]);
    };
    for (const t of tasks) add(t.subdivisionId, { kind: 'task', t });
    for (const r of reminders) add(r.subdivisionId, { kind: 'reminder', r });
    const visible = subs.filter((s) => inSubdivision(s.id, filters.subdivisionId, subsMap));
    const list = visible.map((s) => ({ id: s.id as string | null, name: s.name, color: s.color, general: isGeneral(s), items: (by.get(s.id) ?? []).sort(cmp) }));
    if (by.get(null)?.length) list.push({ id: null, name: 'Sin subdivisión', color: 'var(--muted)', general: false, items: by.get(null)!.sort(cmp) });
    return list;
  }, [tasks, reminders, subs, subsMap, sort, filters.subdivisionId]);

  const now = today();
  const count = tasks.length;

  const onDrop = (e: React.DragEvent, sub: string | null) => {
    e.preventDefault();
    setDropOn(null);
    const [kind, id] = e.dataTransfer.getData('text/x-manage-item').split(':') as ['task' | 'reminder', string];
    if (id) moveItem(kind, id, sub);
  };
  const dragProps = (kind: 'task' | 'reminder', id: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { e.dataTransfer.setData('text/x-manage-item', `${kind}:${id}`); e.dataTransfer.effectAllowed = 'move'; },
    onContextMenu: (e: React.MouseEvent) => openMenu(e, kind, id),
  });

  return (
    <div className="view tasks-view">
      <div className="view-head">
        <h1>Tareas</h1>
        <span className="muted">{count} {count === 1 ? 'tarea' : 'tareas'}{reminders.length ? ` · ${reminders.length} ${reminders.length === 1 ? 'recordatorio' : 'recordatorios'}` : ''}</span>
        <div className="view-tools">
          <label className="muted">Ordenar por{' '}
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="due">Fecha</option>
              <option value="criticality">Criticidad</option>
              <option value="name">Nombre</option>
            </select>
          </label>
          <button className="btn" onClick={() => newReminder({ subdivisionId: filters.subdivisionId })}><Icon name="bell" size={14} /> Recordatorio</button>
          <button className="btn primary" onClick={() => newTask()}><Icon name="plus" size={14} /> Nueva tarea</button>
        </div>
      </div>

      <div className="task-table">
        <div className="task-row head" aria-hidden>
          <span>Nombre</span><span>Criticidad</span><span>Asignado</span><span>Fecha</span><span>Estado</span><span />
        </div>
        {groups.map((g) => (
          <section key={g.id ?? 'none'} className={`task-group${dropOn === (g.id ?? '') ? ' drop' : ''}`} data-subdivision={g.id ?? ''}
            onDragOver={(e) => { if (e.dataTransfer.types.includes('text/x-manage-item')) { e.preventDefault(); setDropOn(g.id ?? ''); } }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropOn(null); }}
            onDrop={(e) => onDrop(e, g.id)}>
            <button className="group-head" onClick={() => setClosed((c) => ({ ...c, [g.id ?? '']: !c[g.id ?? ''] }))}>
              <span className={`chev${closed[g.id ?? ''] ? '' : ' open'}`}>›</span>
              <span className="swatch" style={{ background: g.color }} />
              <strong>{g.name}</strong>
              {g.general && <span className="muted group-note">abarca todas las subdivisiones</span>}
              <span className="muted">{g.items.length}</span>
              <span className="group-add" role="button" title="Nueva tarea en esta subdivisión"
                onClick={(e) => { e.stopPropagation(); newTask({ subdivisionId: g.id }); }}>
                <Icon name="plus" size={14} />
              </span>
            </button>
            {!closed[g.id ?? ''] && g.items.map((it) => {
              if (it.kind === 'reminder') {
                const r = it.r;
                return (
                  <div key={r.id} className={`task-row st-bg reminder${r.done ? ' done' : ''}`} data-reminder={r.id} onClick={() => editReminder(r.id)} {...dragProps('reminder', r.id)}>
                    <span className="task-name"><Icon name="bell" size={14} /><strong>{r.title}</strong><span className="muted desc">{REMINDER_KIND[r.kind]}</span></span>
                    <span />
                    <span />
                    <span className={!r.done && r.at.slice(0, 10) < now ? 'late' : ''}>{fmtReminder(r.at)}</span>
                    <span><span className="status-pill reminder">Recordatorio</span></span>
                    <span className="row-actions">
                      <button className="row-action danger" title="Borrar" onClick={(e) => { e.stopPropagation(); void deleteReminder(r.id); }}><Icon name="trash" size={15} /></button>
                    </span>
                  </div>
                );
              }
              const t = it.t;
              const who = people[t.assigneeId ?? ''];
              const late = t.due && t.due < now && t.status !== 'hecha';
              return (
                <div key={t.id} className={`task-row st-bg ${t.status}`} data-task={t.id} onClick={() => editTask(t.id)} {...dragProps('task', t.id)}>
                  <span className="task-name">
                    <strong>{t.name || 'Sin nombre'}</strong>
                    {inConflict.has(t.id) && <span className="conflict-badge" title="Esta persona tiene otra tarea en otra subdivisión en las mismas fechas"><Icon name="warn" size={13} /></span>}
                    {t.description && <span className="muted desc">{t.description}</span>}
                  </span>
                  <span><span className={`crit ${t.criticality}`}>{CRITICALITY[t.criticality].label}</span></span>
                  <span className="who">{who ? <><span className="avatar" style={{ background: who.color }}>{initials(who.name)}</span>{who.name}</> : <span className="muted">—</span>}</span>
                  <span className={late ? 'late' : ''}>{t.due ? (t.start && t.start !== t.due ? `${fmtShort(t.start)} – ${fmtShort(t.due)}` : fmtShort(t.due)) : <span className="muted">—</span>}</span>
                  <span onClick={(e) => e.stopPropagation()}>
                    <select className={`status st-bg ${t.status}`} value={t.status} aria-label="Estado" onChange={(e) => patch('task', t.id, { status: e.target.value as TaskStatus })}>
                      {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </span>
                  <span className="row-actions">
                    <button className="row-action danger" title="Borrar" onClick={(e) => { e.stopPropagation(); void deleteTask(t.id); }}><Icon name="trash" size={15} /></button>
                  </span>
                </div>
              );
            })}
            {!closed[g.id ?? ''] && !g.items.length && <p className="group-empty muted">Sin tareas. Arrastra aquí una tarea para moverla.</p>}
          </section>
        ))}
        {!groups.length && <p className="group-empty muted">Crea una subdivisión en el panel izquierdo para empezar.</p>}
      </div>
    </div>
  );
}

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

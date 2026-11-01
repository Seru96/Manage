import { useMemo, useState } from 'react';
import { conflictTaskIds } from '../core/conflicts';
import { fmtShort, today } from '../core/dates';
import { CRITICALITY, STATUS, type Task, type TaskStatus } from '../core/model';
import { patch, useProject } from '../store/project';
import { useConflicts, useFilteredTasks, useSubdivisions } from '../store/selectors';
import { editTask, newTask } from '../store/view';
import { Icon } from './icons';

type SortKey = 'due' | 'criticality' | 'name';

/** Lista de tareas agrupada por subdivisión. */
export function TasksView() {
  const tasks = useFilteredTasks();
  const subs = useSubdivisions();
  const people = useProject((s) => s.entities.person);
  const conflicts = useConflicts();
  const inConflict = useMemo(() => conflictTaskIds(conflicts), [conflicts]);
  const [sort, setSort] = useState<SortKey>('due');
  const [closed, setClosed] = useState<Record<string, boolean>>({});

  const groups = useMemo(() => {
    const cmp = (a: Task, b: Task) =>
      sort === 'name' ? a.name.localeCompare(b.name, 'es')
        : sort === 'criticality' ? CRITICALITY[b.criticality].rank - CRITICALITY[a.criticality].rank || (a.due ?? '9').localeCompare(b.due ?? '9')
          : (a.due ?? '9').localeCompare(b.due ?? '9') || CRITICALITY[b.criticality].rank - CRITICALITY[a.criticality].rank;
    const by = new Map<string | null, Task[]>();
    for (const t of tasks) {
      const key = t.subdivisionId && subs.some((s) => s.id === t.subdivisionId) ? t.subdivisionId : null;
      by.set(key, [...(by.get(key) ?? []), t]);
    }
    const list = subs.map((s) => ({ id: s.id as string | null, name: s.name, color: s.color, tasks: (by.get(s.id) ?? []).sort(cmp) }));
    if (by.get(null)?.length) list.push({ id: null, name: 'Sin subdivisión', color: 'var(--muted)', tasks: by.get(null)!.sort(cmp) });
    return list;
  }, [tasks, subs, sort]);

  const now = today();

  return (
    <div className="view tasks-view">
      <div className="view-head">
        <h1>Tareas</h1>
        <span className="muted">{tasks.length} {tasks.length === 1 ? 'tarea' : 'tareas'}</span>
        <div className="view-tools">
          <label className="muted">Ordenar por{' '}
            <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="due">Fecha límite</option>
              <option value="criticality">Criticidad</option>
              <option value="name">Nombre</option>
            </select>
          </label>
          <button className="btn primary" onClick={() => newTask()}><Icon name="plus" size={14} /> Nueva tarea</button>
        </div>
      </div>

      <div className="task-table">
        <div className="task-row head" aria-hidden>
          <span /><span>Nombre</span><span>Criticidad</span><span>Asignado</span><span>Fecha límite</span><span>Estado</span>
        </div>
        {groups.map((g) => (
          <section key={g.id ?? 'none'} className="task-group" data-subdivision={g.id ?? ''}>
            <button className="group-head" onClick={() => setClosed((c) => ({ ...c, [g.id ?? '']: !c[g.id ?? ''] }))}>
              <span className={`chev${closed[g.id ?? ''] ? '' : ' open'}`}>›</span>
              <span className="swatch" style={{ background: g.color }} />
              <strong>{g.name}</strong>
              <span className="muted">{g.tasks.length}</span>
              <span className="group-add" role="button" title="Nueva tarea en esta subdivisión"
                onClick={(e) => { e.stopPropagation(); newTask({ subdivisionId: g.id }); }}>
                <Icon name="plus" size={14} />
              </span>
            </button>
            {!closed[g.id ?? ''] && g.tasks.map((t) => {
              const who = people[t.assigneeId ?? ''];
              const late = t.due && t.due < now && t.status !== 'hecha';
              return (
                <div key={t.id} className={`task-row${t.status === 'hecha' ? ' done' : ''}`} data-task={t.id} onDoubleClick={() => editTask(t.id)} onClick={() => editTask(t.id)}>
                  <span>
                    <input type="checkbox" checked={t.status === 'hecha'} aria-label="Hecha" onClick={(e) => e.stopPropagation()}
                      onChange={(e) => patch('task', t.id, { status: e.target.checked ? 'hecha' : 'pendiente' })} />
                  </span>
                  <span className="task-name">
                    <strong>{t.name || 'Sin nombre'}</strong>
                    {inConflict.has(t.id) && <span className="conflict-badge" title="Esta persona tiene otra tarea en otra subdivisión en las mismas fechas"><Icon name="warn" size={13} /></span>}
                    {t.description && <span className="muted desc">{t.description}</span>}
                  </span>
                  <span><span className={`crit ${t.criticality}`}>{CRITICALITY[t.criticality].label}</span></span>
                  <span className="who">{who ? <><span className="avatar" style={{ background: who.color }}>{initials(who.name)}</span>{who.name}</> : <span className="muted">—</span>}</span>
                  <span className={late ? 'late' : ''}>{t.due ? fmtShort(t.due) : <span className="muted">—</span>}</span>
                  <span onClick={(e) => e.stopPropagation()}>
                    <select className={`status ${t.status}`} value={t.status} onChange={(e) => patch('task', t.id, { status: e.target.value as TaskStatus })}>
                      {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </span>
                </div>
              );
            })}
            {!closed[g.id ?? ''] && !g.tasks.length && <p className="group-empty muted">Sin tareas.</p>}
          </section>
        ))}
        {!groups.length && <p className="group-empty muted">Crea una subdivisión en el panel izquierdo para empezar.</p>}
      </div>
    </div>
  );
}

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');

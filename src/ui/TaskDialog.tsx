import { useEffect, useState } from 'react';
import { findConflicts } from '../core/conflicts';
import { fmtShort, today } from '../core/dates';
import { assignees, CRITICALITY, newId, STATUS, withAssignees, type Criticality, type Task, type TaskStatus } from '../core/model';
import { deleteTask } from '../app/items';
import { withDue, withStart } from '../core/taskDates';
import { upsert, useProject } from '../store/project';
import { personLabel, useGeneralIds, useSubdivisions } from '../store/selectors';
import { PeoplePicker } from './PeoplePicker';
import { closeEditor, useView } from '../store/view';

/** Crear o editar una tarea. */
export function TaskDialog() {
  const editing = useView((s) => s.editing);
  const tasks = useProject((s) => s.entities.task);
  const filters = useView((s) => s.filters);
  const subs = useSubdivisions();
  const generalIds = useGeneralIds();
  const people = useProject((s) => s.entities.person);
  const [t, setT] = useState<Task | null>(null);

  useEffect(() => {
    if (!editing) return setT(null);
    if ('id' in editing) setT(tasks[editing.id] ? { ...tasks[editing.id]! } : null);
    else setT({
      id: newId(), name: '', description: '', criticality: 'media', status: 'pendiente',
      subdivisionId: filters.subdivisionId ?? subs[0]?.id ?? null, ...withAssignees(filters.personId ? [filters.personId] : []),
      start: null, due: today(), createdAt: Date.now(), ...editing.draft,
    });
    // Solo al abrir: las ediciones de otros mientras tanto no pisan el formulario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeEditor(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!editing || !t) return null;
  const isNew = !tasks[t.id];
  const set = (c: Partial<Task>) => setT({ ...t, ...c });
  const save = () => {
    if (!t.name.trim()) return;
    const fixed = { ...t, name: t.name.trim(), start: t.start && t.due && t.start > t.due ? t.due : t.start };
    upsert('task', fixed);
    closeEditor();
  };
  const del = async () => { if (await deleteTask(t.id)) closeEditor(); };
  const clash = findConflicts([...Object.values(tasks).filter((x) => x.id !== t.id), t], generalIds).filter((c) => c.a.id === t.id || c.b.id === t.id);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeEditor(); }}>
      <form className="dialog task-dialog" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <h3>{isNew ? 'Nueva tarea' : 'Editar tarea'}</h3>
        <label className="field">Nombre
          <input autoFocus value={t.name} onChange={(e) => set({ name: e.target.value })} placeholder="Qué hay que hacer" />
        </label>
        <label className="field">Descripción
          <textarea rows={4} value={t.description} onChange={(e) => set({ description: e.target.value })} />
        </label>
        <div className="field-row">
          <label className="field">Subdivisión
            <select value={t.subdivisionId ?? ''} onChange={(e) => set({ subdivisionId: e.target.value || null })}>
              <option value="">Sin subdivisión</option>
              {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </div>
        <div className="field">Asignados
          <PeoplePicker value={assignees(t)} onChange={(ids) => set(withAssignees(ids))} />
        </div>
        <div className="field-row">
          <label className="field">Criticidad
            <select value={t.criticality} onChange={(e) => set({ criticality: e.target.value as Criticality })}>
              {Object.entries(CRITICALITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </label>
          <label className="field">Estado
            <select value={t.status} onChange={(e) => set({ status: e.target.value as TaskStatus })}>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>
        <div className="field-row">
          <label className="field"><span>Inicio <span className="muted">(opcional)</span></span>
            <input type="date" value={t.start ?? ''} onChange={(e) => set(withStart(t, e.target.value || null))} />
          </label>
          <label className="field">Fecha límite
            <input type="date" value={t.due ?? ''} min={t.start ?? undefined} onChange={(e) => set(withDue(t, e.target.value || null))} />
          </label>
        </div>
        {clash.length > 0 && (
          <p className="warn-box">
            ⚠︎ Ya tienen tareas en otra subdivisión en esas fechas:{' '}
            {clash.map((c) => { const o = c.a.id === t.id ? c.b : c.a; return `${personLabel(people[c.personId])}: «${o.name}» (${fmtShort(c.from)})`; }).join(', ')}.
          </p>
        )}
        <div className="dialog-buttons">
          {!isNew && <button type="button" className="danger-text" onClick={() => void del()}>Borrar</button>}
          <span style={{ flex: 1 }} />
          <button type="button" onClick={closeEditor}>Cancelar</button>
          <button type="submit" className="primary" disabled={!t.name.trim()}>{isNew ? 'Crear' : 'Guardar'}</button>
        </div>
      </form>
    </div>
  );
}

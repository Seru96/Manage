import { useEffect, useState } from 'react';
import { deleteReminder } from '../app/items';
import { toLocalIso } from '../app/reminders';
import { newId, REMINDER_KIND, type Reminder } from '../core/model';
import { upsert, useProject } from '../store/project';
import { useSubdivisions } from '../store/selectors';
import { closeReminderEditor, useView } from '../store/view';

function tomorrowAt9() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return toLocalIso(d);
}

/** Crear o editar un recordatorio (desde Tareas, Calendario o Recordatorios). */
export function ReminderDialog() {
  const editing = useView((s) => s.editingReminder);
  const reminders = useProject((s) => s.entities.reminder);
  const tasks = useProject((s) => s.entities.task);
  const filterSub = useView((s) => s.filters.subdivisionId);
  const subs = useSubdivisions();
  const [r, setR] = useState<Reminder | null>(null);

  useEffect(() => {
    if (!editing) return setR(null);
    if ('id' in editing) setR(reminders[editing.id] ? { ...reminders[editing.id]! } : null);
    else setR({ id: newId(), title: '', at: tomorrowAt9(), kind: 'prueba', subdivisionId: filterSub ?? subs[0]?.id ?? null, taskId: null, done: false, ...editing.draft });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeReminderEditor(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!editing || !r) return null;
  const isNew = !reminders[r.id];
  const set = (c: Partial<Reminder>) => setR({ ...r, ...c });
  const save = () => {
    if (!r.title.trim() || !r.at) return;
    upsert('reminder', { ...r, title: r.title.trim() });
    closeReminderEditor();
  };
  const subTasks = Object.values(tasks).filter((t) => !r.subdivisionId || t.subdivisionId === r.subdivisionId).sort((a, b) => a.name.localeCompare(b.name, 'es'));

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) closeReminderEditor(); }}>
      <form className="dialog task-dialog" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <h3>{isNew ? 'Nuevo recordatorio' : 'Editar recordatorio'}</h3>
        <label className="field">Título
          <input autoFocus value={r.title} onChange={(e) => set({ title: e.target.value })} placeholder="Pruebas FAT con el cliente" />
        </label>
        <div className="field-row">
          <label className="field">Cuándo
            <input type="datetime-local" value={r.at} onChange={(e) => e.target.value && set({ at: e.target.value })} />
          </label>
          <label className="field">Tipo
            <select value={r.kind} onChange={(e) => set({ kind: e.target.value as Reminder['kind'] })}>
              {Object.entries(REMINDER_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>
        <div className="field-row">
          <label className="field">Subdivisión
            <select value={r.subdivisionId ?? ''} onChange={(e) => set({ subdivisionId: e.target.value || null, taskId: null })}>
              <option value="">Todo el proyecto</option>
              {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="field">Tarea relacionada
            <select value={r.taskId ?? ''} onChange={(e) => set({ taskId: e.target.value || null })}>
              <option value="">Ninguna (sale como recordatorio en Tareas y Calendario)</option>
              {subTasks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        </div>
        <div className="dialog-buttons">
          {!isNew && <button type="button" className="danger-text" onClick={async () => { if (await deleteReminder(r.id)) closeReminderEditor(); }}>Borrar</button>}
          <span style={{ flex: 1 }} />
          <button type="button" onClick={closeReminderEditor}>Cancelar</button>
          <button type="submit" className="primary" disabled={!r.title.trim()}>{isNew ? 'Crear' : 'Guardar'}</button>
        </div>
      </form>
    </div>
  );
}

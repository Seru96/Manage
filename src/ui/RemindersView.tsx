import { useMemo, useState } from 'react';
import { fmtReminder, toLocalIso } from '../app/reminders';
import { newId, REMINDER_KIND, type Reminder } from '../core/model';
import { backend } from '../platform/backend';
import { patch, remove, upsert, useProject } from '../store/project';
import { useSubdivisions } from '../store/selectors';
import { useView } from '../store/view';
import { Icon } from './icons';

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

function tomorrowAt9() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return toLocalIso(d);
}

/** Recordatorios: pruebas con clientes e hitos, con aviso nativo a su hora. */
export function RemindersView() {
  const reminders = useProject((s) => s.entities.reminder);
  const tasks = useProject((s) => s.entities.task);
  const subsMap = useProject((s) => s.entities.subdivision);
  const subs = useSubdivisions();
  const { subdivisionId, q } = useView((s) => s.filters);
  const [draft, setDraft] = useState<Omit<Reminder, 'id' | 'done'>>({ title: '', at: tomorrowAt9(), kind: 'prueba', subdivisionId: null, taskId: null });
  const [showDone, setShowDone] = useState(false);

  const now = toLocalIso(new Date());
  const { overdue, upcoming, done } = useMemo(() => {
    const qq = norm(q.trim());
    const list = Object.values(reminders)
      .filter((r) => (!subdivisionId || r.subdivisionId === subdivisionId) && (!qq || norm(r.title).includes(qq)))
      .sort((a, b) => a.at.localeCompare(b.at));
    return {
      overdue: list.filter((r) => !r.done && r.at < now),
      upcoming: list.filter((r) => !r.done && r.at >= now),
      done: list.filter((r) => r.done).reverse(),
    };
  }, [reminders, subdivisionId, q, now]);

  const add = () => {
    if (!draft.title.trim() || !draft.at) return;
    upsert('reminder', { ...draft, id: newId(), title: draft.title.trim(), subdivisionId: draft.subdivisionId ?? subdivisionId, done: false });
    setDraft({ ...draft, title: '', taskId: null });
  };

  const row = (r: Reminder) => {
    const sub = subsMap[r.subdivisionId ?? ''];
    const task = tasks[r.taskId ?? ''];
    return (
      <div key={r.id} className={`rem-row${r.done ? ' done' : ''}${!r.done && r.at < now ? ' overdue' : ''}`} data-reminder={r.id}>
        <input type="checkbox" checked={r.done} aria-label="Hecho" onChange={(e) => patch('reminder', r.id, { done: e.target.checked })} />
        <span className={`rem-kind ${r.kind}`}>{REMINDER_KIND[r.kind]}</span>
        <input className="rem-title" defaultValue={r.title} key={r.title}
          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== r.title) patch('reminder', r.id, { title: v }); }} />
        <span className="rem-meta muted">
          {sub && <><span className="swatch" style={{ background: sub.color }} />{sub.name}</>}
          {task && <> · {task.name}</>}
        </span>
        <input type="datetime-local" className="rem-at" value={r.at} title={fmtReminder(r.at)}
          onChange={(e) => e.target.value && patch('reminder', r.id, { at: e.target.value })} />
        <button className="row-action danger" title="Borrar" onClick={async () => { if (await backend.ask(`¿Borrar «${r.title}»?`)) remove('reminder', r.id); }}>
          <Icon name="trash" size={15} />
        </button>
      </div>
    );
  };

  const subTasks = Object.values(tasks).filter((t) => !draft.subdivisionId || t.subdivisionId === draft.subdivisionId).sort((a, b) => a.name.localeCompare(b.name, 'es'));

  return (
    <div className="view reminders-view">
      <div className="view-head">
        <h1>Recordatorios</h1>
        <div className="view-tools">
          <button className="btn" onClick={() => void backend.notify('IMPLANTA Manage', 'Los avisos funcionan en este equipo.')}
            title="Envía una notificación de prueba (la primera vez el sistema pide permiso)"><Icon name="bell" size={14} /> Probar aviso</button>
        </div>
      </div>

      <form className="rem-form" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <input className="rem-new-title" placeholder="Nuevo recordatorio: «Pruebas FAT con el cliente»" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        <input type="datetime-local" value={draft.at} onChange={(e) => setDraft({ ...draft, at: e.target.value })} aria-label="Cuándo" />
        <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Reminder['kind'] })} aria-label="Tipo">
          {Object.entries(REMINDER_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={draft.subdivisionId ?? subdivisionId ?? ''} onChange={(e) => setDraft({ ...draft, subdivisionId: e.target.value || null, taskId: null })} aria-label="Subdivisión">
          <option value="">Todo el proyecto</option>
          {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={draft.taskId ?? ''} onChange={(e) => setDraft({ ...draft, taskId: e.target.value || null })} aria-label="Tarea relacionada">
          <option value="">Sin tarea</option>
          {subTasks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button type="submit" className="btn primary" disabled={!draft.title.trim()}><Icon name="plus" size={14} /> Añadir</button>
      </form>

      <div className="rem-list">
        {overdue.length > 0 && <><h2 className="rem-h overdue">Vencidos</h2>{overdue.map(row)}</>}
        <h2 className="rem-h">Próximos</h2>
        {upcoming.length ? upcoming.map(row) : <p className="group-empty muted">No hay recordatorios pendientes.</p>}
        {done.length > 0 && (
          <>
            <button className="rem-h link-like" onClick={() => setShowDone((v) => !v)}>
              <span className={`chev${showDone ? ' open' : ''}`}>›</span> Hechos ({done.length})
            </button>
            {showDone && done.map(row)}
          </>
        )}
      </div>
      <p className="muted rem-foot">Los avisos llegan como notificación del sistema mientras IMPLANTA Manage está abierta. Los que vencen con la app cerrada se avisan al abrir el proyecto.</p>
    </div>
  );
}

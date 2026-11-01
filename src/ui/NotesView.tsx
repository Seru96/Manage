import { useMemo, useState } from 'react';
import { newId, NOTE_SOURCE, type Note } from '../core/model';
import { backend } from '../platform/backend';
import { patch, remove, upsert, useProject } from '../store/project';
import { useSubdivisions } from '../store/selectors';
import { newTask, useView } from '../store/view';
import { Icon } from './icons';
import { SubChips } from './SubChips';

const fmt = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Anotaciones por subdivisión: feedback del cliente, del PM o notas internas. */
export function NotesView() {
  const notes = useProject((s) => s.entities.note);
  const user = useProject((s) => s.user);
  const tasks = useProject((s) => s.entities.task);
  const subs = useSubdivisions();
  const { subdivisionId, q } = useView((s) => s.filters);
  const [source, setSource] = useState<Note['source'] | ''>('');
  const [draft, setDraft] = useState({ body: '', source: 'cliente' as Note['source'], author: '' });
  const [editing, setEditing] = useState<string | null>(null);

  const shown = useMemo(() => {
    const qq = norm(q.trim());
    return Object.values(notes)
      .filter((n) => (!subdivisionId || n.subdivisionId === subdivisionId) && (!source || n.source === source)
        && (!qq || norm(`${n.body} ${n.author}`).includes(qq)))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [notes, subdivisionId, source, q]);

  const groups = useMemo(() => {
    const list = subs.map((s) => ({ id: s.id as string | null, name: s.name, color: s.color, notes: shown.filter((n) => n.subdivisionId === s.id) }));
    const loose = shown.filter((n) => !subs.some((s) => s.id === n.subdivisionId));
    if (loose.length) list.push({ id: null, name: 'Sin subdivisión', color: 'var(--muted)', notes: loose });
    return list.filter((g) => g.notes.length || g.id === subdivisionId);
  }, [shown, subs, subdivisionId]);

  const add = () => {
    if (!draft.body.trim()) return;
    upsert('note', {
      id: newId(), subdivisionId: subdivisionId ?? subs[0]?.id ?? null, source: draft.source,
      author: draft.author.trim() || user, body: draft.body.trim(), createdAt: Date.now(), taskId: null,
    });
    setDraft({ ...draft, body: '' });
  };

  const toTask = (n: Note) => {
    const first = n.body.split('\n')[0]!.slice(0, 80);
    const taskId = newId();
    patch('note', n.id, { taskId });
    newTask({ id: taskId, name: first, description: `${NOTE_SOURCE[n.source]} (${n.author}): ${n.body}`, subdivisionId: n.subdivisionId });
  };

  const target = subs.find((s) => s.id === subdivisionId);

  return (
    <div className="view notes-view">
      <div className="view-head">
        <h1>Anotaciones</h1>
        <span className="muted">{shown.length}</span>
        <div className="view-tools">
          <div className="segmented" role="radiogroup" aria-label="Origen">
            <button className={source === '' ? 'on' : ''} onClick={() => setSource('')}>Todas</button>
            {Object.entries(NOTE_SOURCE).map(([k, v]) => <button key={k} className={source === k ? 'on' : ''} onClick={() => setSource(k as Note['source'])}>{v}</button>)}
          </div>
        </div>
      </div>

      <SubChips />

      <form className="composer" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <textarea rows={3} placeholder={`Nueva anotación en ${target?.name ?? subs[0]?.name ?? 'el proyecto'}… (⌘↩ para añadir)`} value={draft.body}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); add(); } }} />
        <div className="composer-bar">
          <select value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value as Note['source'] })} aria-label="Origen">
            {Object.entries(NOTE_SOURCE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input className="composer-author" placeholder={`Autor (por defecto, ${user})`} value={draft.author} onChange={(e) => setDraft({ ...draft, author: e.target.value })} />
          <span style={{ flex: 1 }} />
          <button type="submit" className="btn primary" disabled={!draft.body.trim()}>Añadir</button>
        </div>
      </form>

      <div className="notes-list">
        {groups.map((g) => (
          <section key={g.id ?? 'none'} className="note-group">
            {!subdivisionId && <h2 className="note-group-title"><span className="swatch" style={{ background: g.color }} />{g.name}</h2>}
            {g.notes.map((n) => (
              <article key={n.id} className={`note-card ${n.source}`} data-note={n.id}>
                <header>
                  <span className={`note-src ${n.source}`}>{NOTE_SOURCE[n.source]}</span>
                  <strong>{n.author}</strong>
                  <span className="muted">{fmt.format(n.createdAt)}</span>
                  <span style={{ flex: 1 }} />
                  {n.taskId && tasks[n.taskId] ? <span className="muted note-linked">Convertida en tarea</span>
                    : <button className="row-action" title="Crear una tarea a partir de esta anotación" onClick={() => toTask(n)}><Icon name="tasks" size={15} /></button>}
                  <button className="row-action" title="Editar" onClick={() => setEditing(n.id)}><Icon name="newDoc" size={15} /></button>
                  <button className="row-action danger" title="Borrar" onClick={async () => { if (await backend.ask('¿Borrar esta anotación?')) remove('note', n.id); }}><Icon name="trash" size={15} /></button>
                </header>
                {editing === n.id ? (
                  <textarea className="note-edit" autoFocus defaultValue={n.body} rows={Math.max(3, n.body.split('\n').length)}
                    onBlur={(e) => { if (e.target.value.trim()) patch('note', n.id, { body: e.target.value.trim() }); setEditing(null); }}
                    onKeyDown={(e) => { if (e.key === 'Escape') setEditing(null); }} />
                ) : <p>{n.body}</p>}
              </article>
            ))}
            {!g.notes.length && <p className="group-empty muted">Sin anotaciones.</p>}
          </section>
        ))}
        {!groups.length && <p className="group-empty muted">No hay anotaciones{q ? ` que coincidan con «${q}»` : ''}.</p>}
      </div>
    </div>
  );
}

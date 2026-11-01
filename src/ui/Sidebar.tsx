import { useState } from 'react';
import { newId, PALETTE } from '../core/model';
import { backend } from '../platform/backend';
import { patch, remove, upsert, useProject } from '../store/project';
import { usePeople, useSubdivisions } from '../store/selectors';
import { setFilters, setView, useView, type ViewId } from '../store/view';
import { Icon, type IconName } from './icons';

const VIEWS: { id: ViewId; label: string; icon: IconName; key: string }[] = [
  { id: 'tasks', label: 'Tareas', icon: 'tasks', key: '⌘1' },
  { id: 'calendar', label: 'Calendario', icon: 'calendar', key: '⌘2' },
  { id: 'notes', label: 'Anotaciones', icon: 'notes', key: '⌘3' },
  { id: 'reminders', label: 'Recordatorios', icon: 'bell', key: '⌘4' },
  { id: 'access', label: 'Accesos a sitios', icon: 'badge', key: '⌘5' },
];

/** Panel izquierdo: las vistas del proyecto, sus subdivisiones y el equipo. */
export function Sidebar() {
  const view = useView((s) => s.view);
  const filters = useView((s) => s.filters);
  const subs = useSubdivisions();
  const people = usePeople();
  const tasks = useProject((s) => s.entities.task);
  const [adding, setAdding] = useState<'sub' | 'person' | null>(null);

  const countOf = (subId: string) => Object.values(tasks).filter((t) => t.subdivisionId === subId && t.status !== 'hecha').length;

  const add = (kind: 'sub' | 'person', name: string) => {
    const n = name.trim();
    setAdding(null);
    if (!n) return;
    if (kind === 'sub') upsert('subdivision', { id: newId(), name: n, color: PALETTE[subs.length % PALETTE.length]!, order: subs.length });
    else upsert('person', { id: newId(), name: n, color: PALETTE[(people.length + 3) % PALETTE.length]! });
  };

  return (
    <aside className="panel sidebar">
      <nav className="side-nav" aria-label="Vistas">
        {VIEWS.map((v) => (
          <button key={v.id} className={`side-item${view === v.id ? ' on' : ''}`} data-view={v.id} onClick={() => setView(v.id)} title={`${v.label} (${v.key})`}>
            <Icon name={v.icon} size={18} /><span>{v.label}</span>
          </button>
        ))}
      </nav>

      <section className="side-section">
        <div className="side-head">
          <h2>Subdivisiones</h2>
          <button className="icon-btn" onClick={() => setAdding('sub')} title="Nueva subdivisión (sitio, planta, fase…)" aria-label="Nueva subdivisión">+</button>
        </div>
        <ul className="side-list">
          {subs.map((s) => (
            <EditableItem key={s.id} label={s.name} color={s.color} count={countOf(s.id)} on={filters.subdivisionId === s.id}
              onClick={() => setFilters({ subdivisionId: filters.subdivisionId === s.id ? null : s.id })}
              onRename={(name) => patch('subdivision', s.id, { name })}
              onDelete={async () => {
                if (!(await backend.ask(`¿Borrar la subdivisión «${s.name}»? Sus tareas quedarán sin subdivisión.`))) return;
                for (const t of Object.values(tasks)) if (t.subdivisionId === s.id) patch('task', t.id, { subdivisionId: null });
                remove('subdivision', s.id);
              }} />
          ))}
          {adding === 'sub' && <NewItem placeholder="Nombre del sitio" onDone={(n) => add('sub', n)} />}
        </ul>
      </section>

      <section className="side-section">
        <div className="side-head">
          <h2>Equipo</h2>
          <button className="icon-btn" onClick={() => setAdding('person')} title="Añadir persona" aria-label="Añadir persona">+</button>
        </div>
        <ul className="side-list">
          {people.map((p) => (
            <EditableItem key={p.id} label={p.name} color={p.color} round on={filters.personId === p.id}
              onClick={() => setFilters({ personId: filters.personId === p.id ? null : p.id })}
              onRename={(name) => patch('person', p.id, { name })}
              onDelete={async () => {
                if (!(await backend.ask(`¿Quitar a ${p.name} del equipo? Sus tareas quedarán sin asignar.`))) return;
                for (const t of Object.values(tasks)) if (t.assigneeId === p.id) patch('task', t.id, { assigneeId: null });
                remove('person', p.id);
              }} />
          ))}
          {adding === 'person' && <NewItem placeholder="Nombre y apellido" onDone={(n) => add('person', n)} />}
          {!people.length && adding !== 'person' && <li className="side-empty muted">Añade a las personas a las que asignar tareas.</li>}
        </ul>
      </section>
    </aside>
  );
}

function NewItem({ placeholder, onDone }: { placeholder: string; onDone: (name: string) => void }) {
  return (
    <li className="side-row editing">
      <input autoFocus placeholder={placeholder} onBlur={(e) => onDone(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onDone(e.currentTarget.value); if (e.key === 'Escape') onDone(''); }} />
    </li>
  );
}

function EditableItem({ label, color, count, round, on, onClick, onRename, onDelete }: {
  label: string; color: string; count?: number; round?: boolean; on: boolean;
  onClick: () => void; onRename: (name: string) => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    const done = (v: string) => { setEditing(false); if (v.trim() && v.trim() !== label) onRename(v.trim()); };
    return (
      <li className="side-row editing">
        <input autoFocus defaultValue={label} onBlur={(e) => done(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') done(e.currentTarget.value); if (e.key === 'Escape') setEditing(false); }} />
      </li>
    );
  }
  return (
    <li className={`side-row${on ? ' on' : ''}`} onClick={onClick} onDoubleClick={() => setEditing(true)} title="Clic para filtrar · doble clic para renombrar">
      <span className={`swatch${round ? ' round' : ''}`} style={{ background: color }} />
      <span className="name">{label}</span>
      {count !== undefined && <span className="count">{count || ''}</span>}
      <button className="row-action danger" onClick={(e) => { e.stopPropagation(); onDelete(); }} aria-label="Borrar"><Icon name="trash" size={14} /></button>
    </li>
  );
}

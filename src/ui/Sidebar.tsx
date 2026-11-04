import { useState } from 'react';
import { toLocalIso } from '../app/reminders';
import { assignees, isGeneral, newId, PALETTE, withAssignees } from '../core/model';
import { backend } from '../platform/backend';
import { patch, remove, upsert, useProject } from '../store/project';
import { personLabel, useCompanies, usePeople, useSubdivisions } from '../store/selectors';
import { startPersonDrag, wasDragged } from './PersonDrag';
import { setFilters, setView, useView, type ViewId } from '../store/view';
import { Icon, type IconName } from './icons';

const VIEWS: { id: ViewId; label: string; icon: IconName; key: string }[] = [
  { id: 'tasks', label: 'Tareas', icon: 'tasks', key: '⌘1' },
  { id: 'calendar', label: 'Calendario', icon: 'calendar', key: '⌘2' },
  { id: 'reminders', label: 'Recordatorios', icon: 'bell', key: '⌘3' },
  { id: 'expenses', label: 'Gastos', icon: 'money', key: '⌘4' },
  { id: 'docs', label: 'Documentación', icon: 'docs', key: '⌘5' },
  { id: 'team', label: 'Equipo', icon: 'badge', key: '⌘6' },
];

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** Panel izquierdo: las vistas del proyecto, sus subdivisiones y el equipo. */
export function Sidebar() {
  const view = useView((s) => s.view);
  const filters = useView((s) => s.filters);
  const subs = useSubdivisions();
  const people = usePeople().filter((p) => !p.companyId);
  const tasks = useProject((s) => s.entities.task);
  const reminders = useProject((s) => s.entities.reminder);
  const nowIso = toLocalIso(new Date());
  const dueCount = Object.values(reminders).filter((r) => !r.done && r.at <= nowIso).length;
  const [adding, setAdding] = useState<'sub' | 'person' | null>(null);

  const open = Object.values(tasks).filter((t) => t.status !== 'hecha');
  const countOf = (subId: string, general: boolean) => (general ? open.length : open.filter((t) => t.subdivisionId === subId).length);

  const add = (kind: 'sub' | 'person', name: string) => {
    const n = name.trim();
    setAdding(null);
    if (!n) return;
    if (kind === 'sub') upsert('subdivision', { id: newId(), name: n, color: PALETTE[subs.length % PALETTE.length]!, order: subs.length });
    else {
      const [nombre = '', ...rest] = n.split(/\s+/);
      upsert('person', { id: newId(), name: n, color: PALETTE[(people.length + 3) % PALETTE.length]!, values: { nombre, apellidos: rest.join(' ') }, siteIds: [], companyId: null });
    }
  };

  return (
    <aside className="panel sidebar">
      <nav className="side-nav" aria-label="Vistas">
        {VIEWS.map((v) => (
          <button key={v.id} className={`side-item${view === v.id ? ' on' : ''}`} data-view={v.id} onClick={() => setView(v.id)} title={`${v.label} (${v.key})`}>
            <Icon name={v.icon} size={18} /><span>{v.label}</span>
            {v.id === 'reminders' && dueCount > 0 && <span className="side-badge" title="Recordatorios vencidos">{dueCount}</span>}
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
            <EditableItem key={s.id} label={s.name} color={s.color} count={countOf(s.id, isGeneral(s))} child={!isGeneral(s) && subs.some(isGeneral)} on={filters.subdivisionId === s.id}
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

      <PeoplePanel adding={adding === 'person'} onAdd={() => setAdding('person')} onAdded={(n) => add('person', n)} />
    </aside>
  );
}

/** Quita a una persona del equipo y de las tareas en las que estaba. */
export function removePerson(id: string) {
  for (const t of Object.values(useProject.getState().entities.task)) {
    const who = assignees(t);
    if (who.includes(id)) patch('task', t.id, withAssignees(who.filter((x) => x !== id)));
  }
  remove('person', id);
}

/**
 * Personal: el propio y una división por empresa, con buscador. Clic filtra; arrastrar a una
 * persona (o a toda una empresa desde su cabecera) al calendario le asigna una tarea o le apunta
 * la jornada.
 */
function PeoplePanel({ adding, onAdd, onAdded }: { adding: boolean; onAdd: () => void; onAdded: (name: string) => void }) {
  const filters = useView((s) => s.filters);
  const people = usePeople();
  const companies = useCompanies();
  const [q, setQ] = useState('');
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const qq = norm(q.trim());
  const hit = (p: (typeof people)[number]) => !qq || norm([personLabel(p), ...Object.values(p.values ?? {})].join(' ')).includes(qq);
  const groups = [{ id: 'own', name: 'Personal propio', color: '' }, ...companies].map((c) => {
    const all = people.filter((p) => (c.id === 'own' ? !p.companyId : p.companyId === c.id));
    return { ...c, all, list: all.filter(hit) };
  }).filter((g) => g.id === 'own' || g.all.length || !qq);

  return (
    <section className="side-section people-panel">
      <div className="side-head">
        <h2>Personal</h2>
        <button className="icon-btn" onClick={onAdd} title="Añadir persona propia (las de otras empresas, en Equipo)" aria-label="Añadir persona">+</button>
      </div>
      <label className="side-search">
        <Icon name="search" size={13} />
        <input type="search" placeholder="Buscar persona" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar persona" />
      </label>
      {groups.map((g) => {
        if (qq && !g.list.length) return null;
        const isClosed = !qq && closed[g.id];
        const on = filters.companyId === g.id;
        return (
          <div key={g.id} className="people-group" data-people-group={g.id}>
            <div className={`people-head${on ? ' on' : ''}`} title="Clic para filtrar por la empresa · arrastra para llevar a todos al calendario"
              onPointerDown={(e) => { if (!(e.target as HTMLElement).closest('.chev')) startPersonDrag(e, g.all.map((p) => p.id), g.name, g.color || 'var(--accent)'); }}
              onClick={(e) => { if (wasDragged() || (e.target as HTMLElement).closest('.chev')) return; setFilters({ companyId: on ? null : g.id, personId: null }); }}>
              <button className={`chev${isClosed ? '' : ' open'}`} aria-label={isClosed ? 'Desplegar' : 'Plegar'}
                onClick={() => setClosed((c) => ({ ...c, [g.id]: !c[g.id] }))}>›</button>
              {g.color ? <span className="swatch" style={{ background: g.color }} /> : <Icon name="person" size={13} />}
              <span className="name">{g.name}</span>
              <span className="count">{g.all.length || ''}</span>
            </div>
            {!isClosed && (
              <ul className="side-list">
                {g.list.map((p) => (
                  <EditableItem key={p.id} label={personLabel(p)} color={p.color} round child draggable on={filters.personId === p.id}
                    onPointerDown={(e) => startPersonDrag(e, [p.id], personLabel(p), p.color)}
                    onClick={() => { if (!wasDragged()) setFilters({ personId: filters.personId === p.id ? null : p.id }); }}
                    onRename={(name) => patch('person', p.id, { name })}
                    onDelete={async () => {
                      if (await backend.ask(`¿Quitar a ${personLabel(p)} del equipo? Se le quitará de sus tareas.`)) removePerson(p.id);
                    }} />
                ))}
                {g.id === 'own' && adding && <NewItem placeholder="Nombre y apellido" onDone={onAdded} />}
                {!g.all.length && !(g.id === 'own' && adding) && (
                  <li className="side-empty muted">{g.id === 'own' ? 'Añade a las personas a las que asignar tareas.' : 'Sin personal. Añádelo en Equipo.'}</li>
                )}
              </ul>
            )}
          </div>
        );
      })}
      {qq && groups.every((g) => !g.list.length) && <p className="side-empty muted">Nadie se llama así.</p>}
      {people.length > 0 && <p className="side-hint muted">Arrastra a alguien al calendario: en Tareas abre una tarea; en Subcontratas apunta su jornada.</p>}
    </section>
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

function EditableItem({ label, color, count, round, child, draggable, on, onClick, onPointerDown, onRename, onDelete }: {
  label: string; color: string; count?: number; round?: boolean; child?: boolean; draggable?: boolean; on: boolean;
  onClick: () => void; onPointerDown?: (e: React.PointerEvent) => void; onRename: (name: string) => void; onDelete: () => void;
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
    <li className={`side-row${on ? ' on' : ''}${child ? ' child' : ''}${draggable ? ' draggable' : ''}`} onClick={onClick} onDoubleClick={() => setEditing(true)}
      onPointerDown={(e) => { if (!(e.target as HTMLElement).closest('button')) onPointerDown?.(e); }} data-person-row={draggable ? label : undefined}
      title={`Clic para filtrar · doble clic para renombrar${draggable ? ' · arrástralo al calendario' : ''}`}>
      <span className={`swatch${round ? ' round' : ''}`} style={{ background: color }} />
      <span className="name">{label}</span>
      {count !== undefined && <span className="count">{count || ''}</span>}
      <button className="row-action danger" onClick={(e) => { e.stopPropagation(); onDelete(); }} aria-label="Borrar"><Icon name="trash" size={14} /></button>
    </li>
  );
}

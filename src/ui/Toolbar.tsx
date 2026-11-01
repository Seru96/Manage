import { useState } from 'react';
import { showStart, syncCommand } from '../app/session';
import { conflictDays } from '../core/conflicts';
import { fmtShort } from '../core/dates';
import { useProject, type SyncState } from '../store/project';
import { useConflicts, usePeople, useSubdivisions } from '../store/selectors';
import { editTask, setFilters, useView } from '../store/view';
import { Icon } from './icons';

const SYNC_TEXT: Record<SyncState, string> = {
  synced: 'Sincronizado',
  pending: 'Cambios por publicar',
  syncing: 'Sincronizando…',
  offline: 'Sin conexión: guardado en local',
};

/** Barra superior: deja hueco a los semáforos del Mac, como en IMPLANTA Install. */
export function Toolbar() {
  const name = useProject((s) => s.name);
  const sync = useProject((s) => s.sync);
  const syncError = useProject((s) => s.syncError);
  const lastSync = useProject((s) => s.lastSync);
  const filters = useView((s) => s.filters);
  const people = usePeople();
  const subs = useSubdivisions();
  const conflicts = useConflicts();
  const [showConflicts, setShowConflicts] = useState(false);

  return (
    <header className="toolbar" data-tauri-drag-region>
      <button className="home" onClick={showStart} title="Pantalla de inicio (⇧⌘1)" aria-label="Inicio"><Icon name="home" size={18} /></button>
      <div className="title" data-tauri-drag-region>
        <strong>{name}</strong>
        <span className={`save ${sync}`} data-sync={sync}
          title={syncError ?? (lastSync ? `Última sincronización: ${new Date(lastSync).toLocaleTimeString('es-ES')}` : undefined)}>
          {SYNC_TEXT[sync]}
        </span>
      </div>
      <button className="tb-btn" onClick={() => void syncCommand()} title="Sincronizar con la copia compartida (⌘S)" aria-label="Sincronizar">
        <Icon name="sync" size={16} />
      </button>

      <div className="tb-spacer" data-tauri-drag-region />

      <label className="tb-search">
        <Icon name="search" size={15} />
        <input data-global-search type="search" placeholder="Buscar tareas (⌘F)" value={filters.q}
          onChange={(e) => setFilters({ q: e.target.value })} />
      </label>
      <select className="tb-select" value={filters.personId ?? ''} onChange={(e) => setFilters({ personId: e.target.value || null })}
        aria-label="Filtrar por persona" title="Ver solo las tareas de una persona">
        <option value="">Todas las personas</option>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <select className="tb-select" value={filters.subdivisionId ?? ''} onChange={(e) => setFilters({ subdivisionId: e.target.value || null })}
        aria-label="Filtrar por subdivisión">
        <option value="">Todas las subdivisiones</option>
        {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <label className="tb-check" title="Ocultar las tareas hechas">
        <input type="checkbox" checked={filters.hideDone} onChange={(e) => setFilters({ hideDone: e.target.checked })} /> Ocultar hechas
      </label>

      <div className="tb-pop-anchor">
        <button className={`tb-btn conflicts${conflicts.length ? ' on' : ''}`} data-conflicts={conflicts.length}
          onClick={() => setShowConflicts((v) => !v)} disabled={!conflicts.length}
          title={conflicts.length ? 'Personas asignadas a dos subdivisiones en las mismas fechas' : 'Sin conflictos de asignación'}>
          <Icon name="warn" size={16} />{conflicts.length > 0 && <span>{conflicts.length}</span>}
        </button>
        {showConflicts && conflicts.length > 0 && (
          <div className="popover conflicts-pop" onMouseLeave={() => setShowConflicts(false)}>
            <h3>Conflictos de asignación</h3>
            {conflicts.map((c, i) => {
              const who = people.find((p) => p.id === c.personId)?.name ?? '¿?';
              const sub = (id: string | null) => subs.find((s) => s.id === id)?.name ?? '¿?';
              const days = conflictDays(c);
              return (
                <div key={i} className="conflict">
                  <strong>{who}</strong> está en <em>{sub(c.a.subdivisionId)}</em> y <em>{sub(c.b.subdivisionId)}</em>{' '}
                  {days === 1 ? `el ${fmtShort(c.from)}` : `del ${fmtShort(c.from)} al ${fmtShort(c.to)}`}
                  <div className="conflict-tasks">
                    <button className="link" onClick={() => { setShowConflicts(false); editTask(c.a.id); }}>{c.a.name}</button>
                    <button className="link" onClick={() => { setShowConflicts(false); editTask(c.b.id); }}>{c.b.name}</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </header>
  );
}

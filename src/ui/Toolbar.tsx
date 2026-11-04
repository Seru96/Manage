import { useState } from 'react';
import { exportExcel, importExcel } from '../app/excel';
import { showStart, syncCommand } from '../app/session';
import { conflictDays } from '../core/conflicts';
import { fmtShort } from '../core/dates';
import { useProject, type SyncState } from '../store/project';
import { inCompany, personLabel, useCompanies, useConflicts, usePeople, useSubdivisions } from '../store/selectors';
import { activeFilters, clearFilters, editTask, setFilters, useView } from '../store/view';
import { CRITICALITY, STATUS, type Criticality, type TaskStatus } from '../core/model';
import { openOptions } from '../store/theme';
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
  const [showExcel, setShowExcel] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const nFilters = activeFilters(filters) - (filters.subdivisionId ? 1 : 0);
  const excel = (fn: () => Promise<void>) => () => { setShowExcel(false); void fn(); };

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
        <input data-global-search type="search" placeholder="Buscar (⌘F)" value={filters.q}
          onChange={(e) => setFilters({ q: e.target.value })} />
      </label>
      <select className="tb-select" value={filters.subdivisionId ?? ''} onChange={(e) => setFilters({ subdivisionId: e.target.value || null })}
        aria-label="Filtrar por subdivisión">
        <option value="">Todas las subdivisiones</option>
        {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <div className="tb-pop-anchor" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setShowFilters(false); }}>
        <button className={`tb-btn filters${nFilters ? ' on' : ''}`} data-action="filters" onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}
          title="Filtrar por empresa, persona, estado o criticidad" aria-label="Filtros">
          <Icon name="filter" size={16} />{nFilters > 0 && <span data-filter-count>{nFilters}</span>}
        </button>
        {showFilters && <FiltersPopover />}
      </div>

      <div className="tb-pop-anchor" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setShowExcel(false); }}>
        <button className="tb-btn" data-action="excel" onClick={() => setShowExcel((v) => !v)} title="Exportar o importar el proyecto en Excel" aria-label="Excel" aria-expanded={showExcel}>
          <Icon name="excel" size={16} />
        </button>
        {showExcel && (
          <div className="context-menu tb-menu" role="menu">
            <button role="menuitem" data-action="export-xlsx" onClick={excel(exportExcel)}>Exportar a Excel… <kbd>⌘E</kbd></button>
            <button role="menuitem" data-action="import-xlsx" onClick={excel(importExcel)}>Importar desde Excel…</button>
            <span className="menu-label wrap">Al importar se actualiza lo que ya existe (por ID) y se añade lo nuevo; no se borra nada.</span>
          </div>
        )}
      </div>
      <button className="tb-btn" data-action="options" onClick={openOptions} title="Opciones: apariencia clara, híbrida u oscura (⌘,)" aria-label="Opciones">
        <Icon name="gear" size={16} />
      </button>
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
              const who = personLabel(people.find((p) => p.id === c.personId));
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

/** Los filtros que valen para todas las vistas (además de la subdivisión y la búsqueda). */
function FiltersPopover() {
  const filters = useView((s) => s.filters);
  const people = usePeople();
  const companies = useCompanies();
  const shown = people.filter((p) => inCompany(p, filters.companyId));
  const groups = [{ id: '', name: 'Personal propio' }, ...companies].map((c) => ({ ...c, list: shown.filter((p) => (p.companyId ?? '') === c.id) })).filter((g) => g.list.length);
  return (
    <div className="popover filters-pop" tabIndex={-1}>
      <h3>Filtros</h3>
      <label className="field">Empresa
        <select value={filters.companyId ?? ''} aria-label="Filtrar por empresa" onChange={(e) => {
          const companyId = e.target.value || null;
          const p = people.find((x) => x.id === filters.personId);
          setFilters({ companyId, ...(p && !inCompany(p, companyId) ? { personId: null } : {}) });
        }}>
          <option value="">Todas</option>
          <option value="own">Personal propio</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="field">Persona
        <select value={filters.personId ?? ''} aria-label="Filtrar por persona" onChange={(e) => setFilters({ personId: e.target.value || null })}>
          <option value="">Todas</option>
          {groups.map((g) => <optgroup key={g.id} label={g.name}>{g.list.map((p) => <option key={p.id} value={p.id}>{personLabel(p)}</option>)}</optgroup>)}
        </select>
      </label>
      <div className="field-row">
        <label className="field">Estado
          <select value={filters.status ?? ''} aria-label="Filtrar por estado" onChange={(e) => setFilters({ status: (e.target.value || null) as TaskStatus | null })}>
            <option value="">Todos</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="field">Criticidad
          <select value={filters.criticality ?? ''} aria-label="Filtrar por criticidad" onChange={(e) => setFilters({ criticality: (e.target.value || null) as Criticality | null })}>
            <option value="">Todas</option>
            {Object.entries(CRITICALITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
      </div>
      <label className="check"><input type="checkbox" checked={filters.hideDone} onChange={(e) => setFilters({ hideDone: e.target.checked })} /> Ocultar lo hecho</label>
      <p className="muted small">La empresa filtra también el calendario de subcontratas, el equipo y los pedidos.</p>
      <div className="dialog-buttons"><button type="button" className="link" onClick={clearFilters} disabled={!activeFilters(filters)}>Quitar filtros</button></div>
    </div>
  );
}

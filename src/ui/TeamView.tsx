import { useEffect, useMemo, useRef, useState } from 'react';
import { autoName, DEFAULT_ACCESS_COLUMNS, isGeneral, newId, PALETTE, type Person } from '../core/model';
import { backend } from '../platform/backend';
import { patch, remove, upsert, useProject } from '../store/project';
import { personLabel, useCompanies, useSubdivisions } from '../store/selectors';
import { useView } from '../store/view';
import { Icon } from './icons';
import { removePerson } from './Sidebar';
import { SubChips } from './SubChips';

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
/** Pestaña: todo el equipo, el personal propio o una empresa (su id). */
type Tab = 'all' | 'own' | string;

/**
 * Equipo: la tabla de personal (propio y de subcontratas) con columnas propias, el nombre
 * corto con el que se asignan tareas, su empresa y una casilla por sitio al que tiene acceso.
 */
export function TeamView() {
  const colsMap = useProject((s) => s.entities.accessColumn);
  const people = useProject((s) => s.entities.person);
  const subsMap = useProject((s) => s.entities.subdivision);
  const subs = useSubdivisions();
  const companies = useCompanies();
  const { subdivisionId, q } = useView((s) => s.filters);
  const [tab, setTab] = useState<Tab>('all');
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 }>({ col: 'apellidos', dir: 1 });
  const [renaming, setRenaming] = useState<string | null>(null);
  const [focusRow, setFocusRow] = useState<string | null>(null);
  const [addingCompany, setAddingCompany] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  const cols = useMemo(() => Object.values(colsMap).sort((a, b) => a.order - b.order), [colsMap]);

  // Columnas de serie la primera vez (ids fijos: si dos personas lo hacen a la vez, no se duplican).
  useEffect(() => {
    if (!cols.length) for (const c of DEFAULT_ACCESS_COLUMNS) upsert('accessColumn', c);
  }, [cols.length]);
  useEffect(() => { if (tab !== 'all' && tab !== 'own' && !companies.some((c) => c.id === tab)) setTab('all'); }, [tab, companies]);

  const inTab = (p: Person) => tab === 'all' || (tab === 'own' ? !p.companyId : p.companyId === tab);
  const rows = useMemo(() => {
    const qq = norm(q.trim());
    const val = (p: Person, col: string) => (col === '__name' ? personLabel(p) : p.values?.[col] ?? '');
    return Object.values(people)
      .filter((p) => inTab(p)
        && (!subdivisionId || isGeneral(subsMap[subdivisionId]) || (p.siteIds ?? []).some((id) => id === subdivisionId || isGeneral(subsMap[id])))
        && (!qq || norm([p.name, ...Object.values(p.values ?? {})].join(' ')).includes(qq)))
      .sort((a, b) => sort.dir * val(a, sort.col).localeCompare(val(b, sort.col), 'es', { numeric: true }) || personLabel(a).localeCompare(personLabel(b), 'es'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, subdivisionId, q, sort, subsMap, tab]);

  useEffect(() => {
    if (!focusRow) return;
    const row = tableRef.current?.querySelector(`[data-row="${focusRow}"]`);
    (row?.querySelector<HTMLInputElement>('input.cell[data-col="nombre"]') ?? row?.querySelector<HTMLInputElement>('input.cell[data-col]'))?.focus();
    setFocusRow(null);
  }, [focusRow, rows]);

  const addPerson = () => {
    const p: Person = {
      id: newId(), name: '', color: PALETTE[(Object.keys(people).length + 3) % PALETTE.length]!, values: {},
      siteIds: subdivisionId ? [subdivisionId] : [], companyId: tab !== 'all' && tab !== 'own' ? tab : null,
    };
    upsert('person', p);
    setSort({ col: '__none', dir: 1 }); // que la fila nueva no salte de sitio mientras se escribe
    setFocusRow(p.id);
  };
  const addColumn = () => {
    const id = newId();
    upsert('accessColumn', { id, label: 'Nueva columna', order: (cols.at(-1)?.order ?? 0) + 1 });
    setRenaming(id);
  };
  const addCompany = (name: string) => {
    setAddingCompany(false);
    if (!name.trim()) return;
    const id = newId();
    upsert('company', { id, name: name.trim(), color: PALETTE[(companies.length + 5) % PALETTE.length]! });
    setTab(id);
  };
  const setValue = (p: Person, col: string, v: string) => {
    const values = p.values ?? {};
    if ((values[col] ?? '') === v) return;
    const next = { ...values, [col]: v };
    // El nombre corto sigue a Nombre y Apellidos mientras no se haya cambiado a mano.
    const follow = !p.name.trim() || p.name === autoName(values);
    patch('person', p.id, { values: next, ...(follow ? { name: autoName(next) } : {}) });
  };
  const toggleSite = (p: Person, site: string, on: boolean) => {
    const cur = p.siteIds ?? [];
    patch('person', p.id, { siteIds: on ? [...new Set([...cur, site])] : cur.filter((s) => s !== site) });
  };

  const countIn = (site: string) => Object.values(people).filter((p) => p.siteIds?.includes(site)).length;
  const grid = `24px 170px 150px ${cols.map(() => '140px').join(' ')} 24px ${subs.map(() => '76px').join(' ')} 36px minmax(0, 1fr)`;
  const company = companies.find((c) => c.id === tab);

  return (
    <div className="view team-view">
      <div className="view-head">
        <h1>Equipo</h1>
        <span className="muted">{rows.length} {rows.length === 1 ? 'persona' : 'personas'}</span>
        <div className="view-tools">
          <button className="btn" onClick={addColumn}><Icon name="plus" size={14} /> Columna</button>
          <button className="btn primary" onClick={addPerson}><Icon name="plus" size={14} /> Persona{company ? ` de ${company.name}` : ''}</button>
        </div>
      </div>

      <div className="team-tabs" role="tablist">
        <button role="tab" className={`chip${tab === 'all' ? ' on' : ''}`} onClick={() => setTab('all')}>Todo el equipo</button>
        <button role="tab" className={`chip${tab === 'own' ? ' on' : ''}`} onClick={() => setTab('own')}>Personal propio</button>
        <span className="tabs-sep">Subcontratas</span>
        {companies.map((c) => (
          <CompanyChip key={c.id} id={c.id} name={c.name} color={c.color} on={tab === c.id} onClick={() => setTab(c.id)}
            count={Object.values(people).filter((p) => p.companyId === c.id).length} />
        ))}
        {addingCompany
          ? <input className="chip-input" autoFocus placeholder="Nombre de la empresa" onBlur={(e) => addCompany(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addCompany(e.currentTarget.value); if (e.key === 'Escape') setAddingCompany(false); }} />
          : <button className="chip add" onClick={() => setAddingCompany(true)} title="Añadir una empresa subcontratada"><Icon name="plus" size={12} /> Empresa</button>}
      </div>
      <SubChips allLabel="Todos los sitios" />

      <div className="access-table" ref={tableRef}>
        <div className="access-row head" style={{ gridTemplateColumns: grid }}>
          <span />
          <span className="col-head"><button className="col-label" onClick={() => setSort((s) => ({ col: '__name', dir: s.col === '__name' ? (-s.dir as 1 | -1) : 1 }))}
            title="Cómo sale en tareas y calendario (por defecto, primer nombre y primer apellido)">Nombre corto{sort.col === '__name' ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}</button></span>
          <span className="col-head"><span className="col-label">Empresa</span></span>
          {cols.map((c) => renaming === c.id ? (
            <input key={c.id} className="col-rename" autoFocus defaultValue={c.label}
              onFocus={(e) => e.target.select()}
              onBlur={(e) => { const v = e.target.value.trim(); if (v) patch('accessColumn', c.id, { label: v }); setRenaming(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null); }} />
          ) : (
            <span key={c.id} className="col-head" data-col={c.id}>
              <button className="col-label" onClick={() => setSort((s) => ({ col: c.id, dir: s.col === c.id ? (-s.dir as 1 | -1) : 1 }))}
                onDoubleClick={() => setRenaming(c.id)} title="Clic para ordenar · doble clic para renombrar">
                {c.label}{sort.col === c.id ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
              </button>
              <button className="col-del" title="Quitar columna" onClick={async () => {
                if (await backend.ask(`¿Quitar la columna «${c.label}»? Se borran sus valores.`)) {
                  remove('accessColumn', c.id);
                  for (const p of Object.values(people)) if (p.values && c.id in p.values) { const { [c.id]: _, ...rest } = p.values; patch('person', p.id, { values: rest }); }
                }
              }}>×</button>
            </span>
          ))}
          <span />
          {subs.map((s) => (
            <span key={s.id} className="site-head" title={isGeneral(s) ? 'Acceso general: a todos los sitios' : `${s.name}: ${countIn(s.id)} con acceso`}>
              <span className="swatch" style={{ background: s.color }} /><span className="site-name">{s.name}</span>
            </span>
          ))}
          <span />
        </div>
        {rows.map((p) => (
          <div key={p.id} className="access-row" data-row={p.id} style={{ gridTemplateColumns: grid }}>
            <span className="swatch round team-dot" style={{ background: p.color }} />
            {/* key con el valor: si cambia solo (al escribir el nombre), el campo se actualiza */}
            <input key={`n:${p.name}`} className="cell strong" defaultValue={p.name} aria-label="Nombre corto" placeholder={autoName(p.values) || 'Nombre corto'}
              onBlur={(e) => { const v = e.target.value.trim(); if (v !== p.name) patch('person', p.id, { name: v }); }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
            <select className="cell" value={p.companyId ?? ''} aria-label="Empresa" onChange={(e) => patch('person', p.id, { companyId: e.target.value || null })}>
              <option value="">Propio</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {cols.map((c) => (
              <input key={c.id} className="cell" data-col={c.id} defaultValue={p.values?.[c.id] ?? ''} aria-label={c.label}
                onBlur={(e) => setValue(p, c.id, e.target.value.trim())}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
            ))}
            <span />
            {subs.map((s) => (
              <label key={s.id} className="site-cell" title={`Acceso a ${s.name}`}>
                <input type="checkbox" checked={!!p.siteIds?.includes(s.id)} onChange={(e) => toggleSite(p, s.id, e.target.checked)} />
              </label>
            ))}
            <button className="row-action danger" title="Quitar del equipo" onClick={async () => {
              if (await backend.ask(`¿Quitar a ${personLabel(p)} del equipo? Se le quitará también de sus tareas.`)) removePerson(p.id);
            }}><Icon name="trash" size={15} /></button>
          </div>
        ))}
        {!rows.length && (
          <p className="group-empty muted">
            {Object.keys(people).length ? 'Nadie coincide con el filtro.' : 'Añade al equipo: personal propio y de subcontratas, con sus datos y los sitios a los que puede entrar.'}
          </p>
        )}
      </div>
    </div>
  );
}

/** Empresa: clic para filtrar, doble clic para renombrar, × para borrarla. */
function CompanyChip({ id, name, color, on, count, onClick }: { id: string; name: string; color: string; on: boolean; count: number; onClick: () => void }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    const done = (v: string) => { setEditing(false); if (v.trim() && v.trim() !== name) patch('company', id, { name: v.trim() }); };
    return <input className="chip-input" autoFocus defaultValue={name} onBlur={(e) => done(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') done(e.currentTarget.value); if (e.key === 'Escape') setEditing(false); }} />;
  }
  return (
    <span className={`chip company${on ? ' on' : ''}`} role="tab" data-company={id} onClick={onClick} onDoubleClick={() => setEditing(true)} title="Clic para filtrar · doble clic para renombrar">
      <span className="swatch" style={{ background: color }} />{name}<span className="muted">{count || ''}</span>
      <button className="chip-x" aria-label={`Borrar ${name}`} onClick={async (e) => {
        e.stopPropagation();
        if (!(await backend.ask(`¿Borrar la empresa «${name}»? Su personal pasará a propio.`))) return;
        for (const p of Object.values(useProject.getState().entities.person)) if (p.companyId === id) patch('person', p.id, { companyId: null });
        remove('company', id);
      }}>×</button>
    </span>
  );
}

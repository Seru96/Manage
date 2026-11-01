import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_ACCESS_COLUMNS, newId, type AccessPerson } from '../core/model';
import { backend } from '../platform/backend';
import { patch, remove, upsert, useProject } from '../store/project';
import { useSubdivisions } from '../store/selectors';
import { useView } from '../store/view';
import { Icon } from './icons';
import { SubChips } from './SubChips';

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * Accesos a sitios: una tabla de personal con columnas propias y una casilla por
 * subdivisión (sitio). Filtrar por sitio enseña solo a quien tiene acceso.
 */
export function AccessView() {
  const colsMap = useProject((s) => s.entities.accessColumn);
  const people = useProject((s) => s.entities.accessPerson);
  const subs = useSubdivisions();
  const { subdivisionId, q } = useView((s) => s.filters);
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 }>({ col: 'apellidos', dir: 1 });
  const [renaming, setRenaming] = useState<string | null>(null);
  const [focusRow, setFocusRow] = useState<string | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  const cols = useMemo(() => Object.values(colsMap).sort((a, b) => a.order - b.order), [colsMap]);

  // Columnas de serie la primera vez (ids fijos: si dos personas lo hacen a la vez, no se duplican).
  useEffect(() => {
    if (!cols.length) for (const c of DEFAULT_ACCESS_COLUMNS) upsert('accessColumn', c);
  }, [cols.length]);

  const rows = useMemo(() => {
    const qq = norm(q.trim());
    return Object.values(people)
      .filter((p) => (!subdivisionId || p.siteIds.includes(subdivisionId)) && (!qq || norm(Object.values(p.values).join(' ')).includes(qq)))
      .sort((a, b) => sort.dir * (a.values[sort.col] ?? '').localeCompare(b.values[sort.col] ?? '', 'es', { numeric: true })
        || (a.values.nombre ?? '').localeCompare(b.values.nombre ?? '', 'es'));
  }, [people, subdivisionId, q, sort]);

  useEffect(() => {
    if (!focusRow) return;
    tableRef.current?.querySelector<HTMLInputElement>(`[data-row="${focusRow}"] input.cell`)?.focus();
    setFocusRow(null);
  }, [focusRow, rows]);

  const addPerson = () => {
    const p: AccessPerson = { id: newId(), values: {}, siteIds: subdivisionId ? [subdivisionId] : [] };
    upsert('accessPerson', p);
    setSort({ col: '__none', dir: 1 }); // que la fila nueva no salte de sitio mientras se escribe
    setFocusRow(p.id);
  };
  const addColumn = () => {
    const id = newId();
    upsert('accessColumn', { id, label: 'Nueva columna', order: (cols.at(-1)?.order ?? 0) + 1 });
    setRenaming(id);
  };
  const setValue = (p: AccessPerson, col: string, v: string) => {
    if ((p.values[col] ?? '') !== v) patch('accessPerson', p.id, { values: { ...p.values, [col]: v } });
  };
  const toggleSite = (p: AccessPerson, site: string, on: boolean) =>
    patch('accessPerson', p.id, { siteIds: on ? [...new Set([...p.siteIds, site])] : p.siteIds.filter((s) => s !== site) });

  const countIn = (site: string) => Object.values(people).filter((p) => p.siteIds.includes(site)).length;
  const grid = `${cols.map(() => '150px').join(' ')} 32px ${subs.map(() => '76px').join(' ')} 36px minmax(0, 1fr)`;

  return (
    <div className="view access-view">
      <div className="view-head">
        <h1>Accesos a sitios</h1>
        <span className="muted">{rows.length} {rows.length === 1 ? 'persona' : 'personas'}</span>
        <div className="view-tools">
          <button className="btn" onClick={addColumn}><Icon name="plus" size={14} /> Columna</button>
          <button className="btn primary" onClick={addPerson}><Icon name="plus" size={14} /> Persona</button>
        </div>
      </div>
      <SubChips allLabel="Todos los sitios" />

      <div className="access-table" ref={tableRef}>
        <div className="access-row head" style={{ gridTemplateColumns: grid }}>
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
                  for (const p of Object.values(people)) if (c.id in p.values) { const { [c.id]: _, ...rest } = p.values; patch('accessPerson', p.id, { values: rest }); }
                }
              }}>×</button>
            </span>
          ))}
          <span />
          {subs.map((s) => (
            <span key={s.id} className="site-head" title={`${s.name}: ${countIn(s.id)} con acceso`}>
              <span className="swatch" style={{ background: s.color }} /><span className="site-name">{s.name}</span>
            </span>
          ))}
          <span />
        </div>
        {rows.map((p) => (
          <div key={p.id} className="access-row" data-row={p.id} style={{ gridTemplateColumns: grid }}>
            {cols.map((c) => (
              <input key={c.id} className="cell" defaultValue={p.values[c.id] ?? ''} aria-label={c.label}
                onBlur={(e) => setValue(p, c.id, e.target.value.trim())}
                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
            ))}
            <span />
            {subs.map((s) => (
              <label key={s.id} className="site-cell" title={`Acceso a ${s.name}`}>
                <input type="checkbox" checked={p.siteIds.includes(s.id)} onChange={(e) => toggleSite(p, s.id, e.target.checked)} />
              </label>
            ))}
            <button className="row-action danger" title="Quitar persona" onClick={async () => {
              const who = [p.values.nombre, p.values.apellidos].filter(Boolean).join(' ') || 'esta persona';
              if (await backend.ask(`¿Quitar a ${who} de la tabla de accesos?`)) remove('accessPerson', p.id);
            }}><Icon name="trash" size={15} /></button>
          </div>
        ))}
        {!rows.length && (
          <p className="group-empty muted">
            {Object.keys(people).length ? 'Nadie coincide con el filtro.' : 'Añade a las personas que necesitan acceso y marca a qué sitios pueden entrar.'}
          </p>
        )}
      </div>
    </div>
  );
}

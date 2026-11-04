import { useMemo, useState } from 'react';
import { fmtShort, parseDate, today } from '../core/dates';
import { attendanceId, isGeneral, type Attendance, type DateStr, type Person } from '../core/model';
import { patch, remove, upsert, useProject } from '../store/project';
import { inSubdivision, personLabel, useCompanies, usePeople, useSubdivisions } from '../store/selectors';
import { setFilters, setView, useView } from '../store/view';
import { LaborExpenseDialog } from './ExpensesView';
import { Icon } from './icons';
import { initials } from './TasksView';

/**
 * Calendario › Subcontratas: qué días ha ido a la obra cada persona de cada empresa. Clic en
 * un día para marcar quién fue. A la derecha, el resumen del mes por empresa.
 */
export function SubcontractMonth({ weeks, month }: { weeks: DateStr[][]; month: number }) {
  const attendance = useProject((s) => s.entities.attendance);
  const peopleMap = useProject((s) => s.entities.person);
  const companiesMap = useProject((s) => s.entities.company);
  const subsMap = useProject((s) => s.entities.subdivision);
  const companies = useCompanies();
  const { subdivisionId, personId, companyId } = useView((s) => s.filters);
  // El filtro de empresa es el de la barra superior («personal propio» aquí no aplica).
  const company = companyId && companyId !== 'own' ? companyId : null;
  const setCompany = (id: string | null) => setFilters({ companyId: id });
  const [day, setDay] = useState<DateStr | null>(null);
  const [charge, setCharge] = useState<string | null>(null);
  const now = today();

  const first = weeks[0]![0]!, last = weeks.at(-1)![6]!;
  const monthDays = weeks.flat().filter((d) => parseDate(d).getMonth() === month);
  const monthStart = monthDays[0]!, monthEnd = monthDays.at(-1)!;
  const visible = useMemo(() => Object.values(attendance).filter((a) => {
    const p = peopleMap[a.personId];
    return p && p.companyId && (!company || p.companyId === company) && (!personId || p.id === personId)
      && a.date >= first && a.date <= last && inSubdivision(a.subdivisionId, subdivisionId, subsMap);
  }), [attendance, peopleMap, company, personId, first, last, subdivisionId, subsMap]);

  /** Por día: cada empresa y, dentro, cada sitio con su gente. */
  const byDay = useMemo(() => {
    const m = new Map<DateStr, Map<string, Map<string, Person[]>>>();
    for (const a of visible) {
      const p = peopleMap[a.personId]!;
      const d = m.get(a.date) ?? new Map<string, Map<string, Person[]>>();
      const c = d.get(p.companyId!) ?? new Map<string, Person[]>();
      const site = a.subdivisionId && subsMap[a.subdivisionId] ? a.subdivisionId : '';
      c.set(site, [...(c.get(site) ?? []), p]);
      d.set(p.companyId!, c);
      m.set(a.date, d);
    }
    return m;
  }, [visible, peopleMap, subsMap]);

  // Resumen del mes visible (solo los días del mes, no los de relleno).
  const summary = useMemo(() => {
    const inMonth = visible.filter((a) => parseDate(a.date).getMonth() === month);
    const m = new Map<string, { days: Set<string>; people: Map<string, number>; sites: Map<string, number> }>();
    for (const a of inMonth) {
      const c = peopleMap[a.personId]!.companyId!;
      const s = m.get(c) ?? { days: new Set(), people: new Map(), sites: new Map() };
      s.days.add(a.date);
      s.people.set(a.personId, (s.people.get(a.personId) ?? 0) + 1);
      const site = a.subdivisionId && subsMap[a.subdivisionId] ? a.subdivisionId : '';
      s.sites.set(site, (s.sites.get(site) ?? 0) + 1);
      m.set(c, s);
    }
    return [...m].map(([id, s]) => ({ id, company: companiesMap[id], days: s.days.size, shifts: [...s.people.values()].reduce((x, y) => x + y, 0), people: [...s.people], sites: [...s.sites] }))
      .sort((a, b) => (a.company?.name ?? '').localeCompare(b.company?.name ?? '', 'es'));
  }, [visible, month, peopleMap, companiesMap, subsMap]);

  if (!companies.length) {
    return (
      <div className="empty-state">
        <Icon name="users" size={40} />
        <p>Para seguir a las subcontratas, añade sus empresas y su personal en <strong>Equipo</strong>.</p>
        <button className="btn primary" onClick={() => setView('team')}>Ir a Equipo</button>
      </div>
    );
  }

  return (
    <div className="sc-layout">
      <div className="sc-main">
        <div className="tabs-row">
          <button className={`chip${!company ? ' on' : ''}`} onClick={() => setCompany(null)}>Todas las empresas</button>
          {companies.map((c) => (
            <button key={c.id} className={`chip${company === c.id ? ' on' : ''}`} onClick={() => setCompany(c.id)}>
              <span className="swatch" style={{ background: c.color }} />{c.name}
            </button>
          ))}
        </div>
        <div className="cal" data-drop="attendance">
          <div className="cal-weekdays">{['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map((d) => <span key={d}>{d}</span>)}</div>
          <div className="cal-weeks" style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
            {weeks.map((week) => (
              <div key={week[0]} className="cal-week">
                {week.map((d, i) => {
                  const date = parseDate(d);
                  const groups = byDay.get(d);
                  return (
                    <div key={d} className={`cal-day sc-day${date.getMonth() !== month ? ' other' : ''}${i >= 5 ? ' weekend' : ''}${d === now ? ' today' : ''}`}
                      data-date={d} onClick={() => setDay(d)} title="Clic para marcar quién fue y dónde · arrastra aquí a alguien del panel para apuntarle la jornada">
                      <span className="cal-num">{date.getDate() === 1 ? fmtShort(d) : date.getDate()}</span>
                      <div className="sc-groups">
                        {groups && [...groups].map(([cid, sites]) => {
                          const c = companiesMap[cid];
                          const n = [...sites.values()].reduce((x, l) => x + l.length, 0);
                          return (
                            <div key={cid} className="sc-group" data-company={cid} style={{ '--ev': c?.color } as React.CSSProperties}
                              title={[...sites].map(([sid, l]) => `${c?.name} · ${subsMap[sid]?.name ?? 'sin sitio'}: ${l.map(personLabel).join(', ')}`).join('\n')}>
                              <strong>{c?.name}</strong><span className="sc-count">{n}</span>
                              {[...sites].map(([sid, l]) => (
                                <span key={sid} className="sc-site" data-site={sid} style={{ '--site': subsMap[sid]?.color ?? 'var(--muted)' } as React.CSSProperties}>
                                  <span className="sc-site-tag">{subsMap[sid]?.name ?? 'Sin sitio'}</span>
                                  <span className="sc-names">{l.map((p) => personLabel(p).split(' ')[0]).join(', ')}</span>
                                </span>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <aside className="sc-summary">
        <h3>Resumen del mes</h3>
        {!summary.length && <p className="muted">Aún no hay días marcados este mes. Haz clic en un día para marcar quién fue.</p>}
        {summary.map((s) => (
          <div key={s.id} className="sc-sum-company">
            <div className="sc-sum-head"><span className="swatch" style={{ background: s.company?.color }} /><strong>{s.company?.name}</strong></div>
            <div className="muted">{s.days} {s.days === 1 ? 'día' : 'días'} · {s.shifts} {s.shifts === 1 ? 'jornada' : 'jornadas'} · {s.people.length} {s.people.length === 1 ? 'persona' : 'personas'}</div>
            <div className="sc-sum-sites">
              {s.sites.map(([sid, n]) => (
                <span key={sid} className="sc-site-tag" style={{ '--site': subsMap[sid]?.color ?? 'var(--muted)' } as React.CSSProperties}>{subsMap[sid]?.name ?? 'Sin sitio'} · {n}</span>
              ))}
            </div>
            <ul>
              {s.people.sort((a, b) => b[1] - a[1]).map(([pid, n]) => <li key={pid}><span>{personLabel(peopleMap[pid])}</span><span className="muted">{n} {n === 1 ? 'día' : 'días'}</span></li>)}
            </ul>
            <button className="btn small" data-charge={s.id} onClick={() => setCharge(s.id)} title="Llevar las jornadas del mes a un pedido como gasto">
              <Icon name="money" size={13} /> Cargar a un pedido
            </button>
          </div>
        ))}
      </aside>

      {day && <AttendanceDialog date={day} onClose={() => setDay(null)} onlyCompany={company} />}
      {charge && <LaborExpenseDialog companyId={charge} from={monthStart} to={monthEnd} subdivisionId={subdivisionId} onClose={() => setCharge(null)} />}
    </div>
  );
}

/** Marcar quién de cada empresa fue un día y a qué sitio. */
function AttendanceDialog({ date, onlyCompany, onClose }: { date: DateStr; onlyCompany: string | null; onClose: () => void }) {
  const attendance = useProject((s) => s.entities.attendance);
  const people = usePeople().filter((p) => p.companyId && (!onlyCompany || p.companyId === onlyCompany));
  const companies = useCompanies().filter((c) => !onlyCompany || c.id === onlyCompany);
  const subs = useSubdivisions();
  const filterSub = useView((s) => s.filters.subdivisionId);
  const [sub, setSub] = useState<string | null>(() => {
    if (filterSub) return filterSub;
    return subs.find((s) => !isGeneral(s))?.id ?? subs[0]?.id ?? null;
  });
  const here = (p: Person): Attendance | undefined => attendance[attendanceId(date, p.id)];
  const set = (p: Person, on: boolean) => {
    if (on) upsert('attendance', { id: attendanceId(date, p.id), personId: p.id, date, subdivisionId: here(p)?.subdivisionId ?? sub });
    else remove('attendance', attendanceId(date, p.id));
  };
  const marked = people.filter((p) => here(p));
  const applyAll = () => { for (const p of marked) if (here(p)!.subdivisionId !== sub) patch('attendance', attendanceId(date, p.id), { subdivisionId: sub }); };
  const nice = parseDate(date).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const siteSelect = (value: string | null, onChange: (v: string | null) => void, label: string) => (
    <select value={value ?? ''} aria-label={label} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Sin sitio</option>
      {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog task-dialog att-dialog" role="dialog" aria-label="Asistencia" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <h3>¿Quién fue el {nice}?</h3>
        <div className="att-default">
          <label className="field">Sitio para los que marques
            {siteSelect(sub, setSub, 'Sitio para los que marques')}
          </label>
          {marked.some((p) => here(p)!.subdivisionId !== sub) && (
            <button type="button" className="link" onClick={applyAll}>Poner este sitio a los {marked.length} marcados</button>
          )}
        </div>
        <div className="att-list">
          {companies.map((c) => {
            const list = people.filter((p) => p.companyId === c.id);
            const all = list.length > 0 && list.every((p) => here(p));
            return (
              <section key={c.id} className="att-company" style={{ '--ev': c.color } as React.CSSProperties}>
                <div className="att-head">
                  <span className="swatch" style={{ background: c.color }} /><strong>{c.name}</strong>
                  <span className="muted">{list.filter((p) => here(p)).length}/{list.length}</span>
                  {list.length > 0 && <button type="button" className="link" onClick={() => list.forEach((p) => set(p, !all))}>{all ? 'Quitar a todos' : 'Marcar a todos'}</button>}
                </div>
                {list.map((p) => {
                  const a = here(p);
                  const site = subs.find((s) => s.id === a?.subdivisionId);
                  return (
                    <div key={p.id} className="att-person" data-person={p.id}>
                      <label className="att-who">
                        <input type="checkbox" checked={!!a} onChange={(e) => set(p, e.target.checked)} />
                        <span className="avatar" style={{ background: p.color }}>{initials(personLabel(p))}</span>
                        <span>{personLabel(p)}</span>
                      </label>
                      {a && (
                        <span className="att-site" style={{ '--site': site?.color ?? 'var(--muted)' } as React.CSSProperties}>
                          <span className="swatch" style={{ background: site?.color ?? 'transparent' }} />
                          {siteSelect(a.subdivisionId, (v) => patch('attendance', a.id, { subdivisionId: v }), `Sitio de ${personLabel(p)}`)}
                        </span>
                      )}
                    </div>
                  );
                })}
                {!list.length && <p className="muted">Sin personal. Añádelo en Equipo.</p>}
              </section>
            );
          })}
        </div>
        <div className="dialog-buttons"><button type="button" className="primary" onClick={onClose}>Hecho</button></div>
      </div>
    </div>
  );
}

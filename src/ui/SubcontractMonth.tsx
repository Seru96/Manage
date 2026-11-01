import { useMemo, useState } from 'react';
import { fmtShort, parseDate, today } from '../core/dates';
import { attendanceId, type Attendance, type DateStr, type Person } from '../core/model';
import { remove, upsert, useProject } from '../store/project';
import { inSubdivision, personLabel, useCompanies, usePeople, useSubdivisions } from '../store/selectors';
import { setView, useView } from '../store/view';
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
  const { subdivisionId, personId } = useView((s) => s.filters);
  const [company, setCompany] = useState<string | null>(null);
  const [day, setDay] = useState<DateStr | null>(null);
  const now = today();

  const first = weeks[0]![0]!, last = weeks.at(-1)![6]!;
  const visible = useMemo(() => Object.values(attendance).filter((a) => {
    const p = peopleMap[a.personId];
    return p && p.companyId && (!company || p.companyId === company) && (!personId || p.id === personId)
      && a.date >= first && a.date <= last && inSubdivision(a.subdivisionId, subdivisionId, subsMap);
  }), [attendance, peopleMap, company, personId, first, last, subdivisionId, subsMap]);

  const byDay = useMemo(() => {
    const m = new Map<DateStr, Map<string, Person[]>>();
    for (const a of visible) {
      const p = peopleMap[a.personId]!;
      const d = m.get(a.date) ?? new Map<string, Person[]>();
      d.set(p.companyId!, [...(d.get(p.companyId!) ?? []), p]);
      m.set(a.date, d);
    }
    return m;
  }, [visible, peopleMap]);

  // Resumen del mes visible (solo los días del mes, no los de relleno).
  const summary = useMemo(() => {
    const inMonth = visible.filter((a) => parseDate(a.date).getMonth() === month);
    const m = new Map<string, { days: Set<string>; people: Map<string, number> }>();
    for (const a of inMonth) {
      const c = peopleMap[a.personId]!.companyId!;
      const s = m.get(c) ?? { days: new Set(), people: new Map() };
      s.days.add(a.date);
      s.people.set(a.personId, (s.people.get(a.personId) ?? 0) + 1);
      m.set(c, s);
    }
    return [...m].map(([id, s]) => ({ id, company: companiesMap[id], days: s.days.size, shifts: [...s.people.values()].reduce((x, y) => x + y, 0), people: [...s.people] }))
      .sort((a, b) => (a.company?.name ?? '').localeCompare(b.company?.name ?? '', 'es'));
  }, [visible, month, peopleMap, companiesMap]);

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
        <div className="cal">
          <div className="cal-weekdays">{['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'].map((d) => <span key={d}>{d}</span>)}</div>
          <div className="cal-weeks" style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
            {weeks.map((week) => (
              <div key={week[0]} className="cal-week">
                {week.map((d, i) => {
                  const date = parseDate(d);
                  const groups = byDay.get(d);
                  return (
                    <div key={d} className={`cal-day sc-day${date.getMonth() !== month ? ' other' : ''}${i >= 5 ? ' weekend' : ''}${d === now ? ' today' : ''}`}
                      data-date={d} onClick={() => setDay(d)} title="Clic para marcar quién fue">
                      <span className="cal-num">{date.getDate() === 1 ? fmtShort(d) : date.getDate()}</span>
                      <div className="sc-groups">
                        {groups && [...groups].map(([cid, list]) => (
                          <div key={cid} className="sc-group" style={{ '--ev': companiesMap[cid]?.color } as React.CSSProperties}
                            title={`${companiesMap[cid]?.name}: ${list.map(personLabel).join(', ')}`}>
                            <strong>{companiesMap[cid]?.name}</strong><span className="sc-count">{list.length}</span>
                            <span className="sc-names">{list.map((p) => personLabel(p).split(' ')[0]).join(', ')}</span>
                          </div>
                        ))}
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
            <ul>
              {s.people.sort((a, b) => b[1] - a[1]).map(([pid, n]) => <li key={pid}><span>{personLabel(peopleMap[pid])}</span><span className="muted">{n} {n === 1 ? 'día' : 'días'}</span></li>)}
            </ul>
          </div>
        ))}
      </aside>

      {day && <AttendanceDialog date={day} onClose={() => setDay(null)} onlyCompany={company} />}
    </div>
  );
}

/** Marcar quién de cada empresa fue un día (y a qué subdivisión). */
function AttendanceDialog({ date, onlyCompany, onClose }: { date: DateStr; onlyCompany: string | null; onClose: () => void }) {
  const attendance = useProject((s) => s.entities.attendance);
  const people = usePeople().filter((p) => p.companyId && (!onlyCompany || p.companyId === onlyCompany));
  const companies = useCompanies().filter((c) => !onlyCompany || c.id === onlyCompany);
  const subs = useSubdivisions();
  const filterSub = useView((s) => s.filters.subdivisionId);
  const [sub, setSub] = useState<string | null>(filterSub ?? subs[0]?.id ?? null);
  const here = (p: Person): Attendance | undefined => attendance[attendanceId(date, p.id)];
  const set = (p: Person, on: boolean) => {
    if (on) upsert('attendance', { id: attendanceId(date, p.id), personId: p.id, date, subdivisionId: sub });
    else remove('attendance', attendanceId(date, p.id));
  };
  const nice = parseDate(date).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog task-dialog" role="dialog" aria-label="Asistencia" onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <h3>¿Quién fue el {nice}?</h3>
        <label className="field">Subdivisión de las que marques ahora
          <select value={sub ?? ''} onChange={(e) => setSub(e.target.value || null)}>
            <option value="">Sin subdivisión</option>
            {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <div className="att-list">
          {companies.map((c) => {
            const list = people.filter((p) => p.companyId === c.id);
            const all = list.length > 0 && list.every((p) => here(p));
            return (
              <section key={c.id} className="att-company">
                <div className="att-head">
                  <span className="swatch" style={{ background: c.color }} /><strong>{c.name}</strong>
                  <span className="muted">{list.filter((p) => here(p)).length}/{list.length}</span>
                  {list.length > 0 && <button type="button" className="link" onClick={() => list.forEach((p) => set(p, !all))}>{all ? 'Quitar a todos' : 'Marcar a todos'}</button>}
                </div>
                {list.map((p) => {
                  const a = here(p);
                  return (
                    <label key={p.id} className="att-person" data-person={p.id}>
                      <input type="checkbox" checked={!!a} onChange={(e) => set(p, e.target.checked)} />
                      <span className="avatar" style={{ background: p.color }}>{initials(personLabel(p))}</span>
                      <span>{personLabel(p)}</span>
                      {a?.subdivisionId && <span className="muted">· {subs.find((s) => s.id === a.subdivisionId)?.name}</span>}
                    </label>
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

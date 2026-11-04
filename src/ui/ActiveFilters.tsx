import { CRITICALITY, STATUS } from '../core/model';
import { useProject } from '../store/project';
import { personLabel } from '../store/selectors';
import { activeFilters, clearFilters, setFilters, useView, type Filters } from '../store/view';

/** Los filtros puestos, como etiquetas que se quitan con un clic (en todas las vistas). */
export function ActiveFilters() {
  const f = useView((s) => s.filters);
  const view = useView((s) => s.view);
  const { person, company, subdivision } = useProject((s) => s.entities);
  if (!activeFilters(f)) return null;
  const chips: { key: keyof Filters; label: string; color?: string }[] = [];
  if (f.subdivisionId) chips.push({ key: 'subdivisionId', label: subdivision[f.subdivisionId]?.name ?? 'Subdivisión', color: subdivision[f.subdivisionId]?.color });
  if (f.companyId) chips.push({ key: 'companyId', label: f.companyId === 'own' ? 'Personal propio' : company[f.companyId]?.name ?? 'Empresa', color: company[f.companyId]?.color });
  if (f.personId) chips.push({ key: 'personId', label: personLabel(person[f.personId]), color: person[f.personId]?.color });
  if (f.status) chips.push({ key: 'status', label: STATUS[f.status] });
  if (f.criticality) chips.push({ key: 'criticality', label: `Criticidad ${CRITICALITY[f.criticality].label.toLowerCase()}` });
  if (f.hideDone) chips.push({ key: 'hideDone', label: 'Sin lo hecho' });
  // En Equipo las pestañas ya enseñan la empresa y la subdivisión; no hace falta repetirlo.
  if (view === 'team' && chips.every((c) => c.key === 'companyId' || c.key === 'subdivisionId')) return null;
  return (
    <div className="active-filters" aria-label="Filtros puestos">
      <span className="muted">Filtrando:</span>
      {chips.map((c) => (
        <button key={c.key} className="chip on small" data-filter={c.key} title="Quitar este filtro"
          onClick={() => setFilters({ [c.key]: c.key === 'hideDone' ? false : null } as Partial<Filters>)}>
          {c.color && <span className="swatch" style={{ background: c.color }} />}{c.label}<span className="chip-x" aria-hidden>×</span>
        </button>
      ))}
      {chips.length > 1 && <button className="link" onClick={clearFilters}>Quitar todos</button>}
    </div>
  );
}

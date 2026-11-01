import { useSubdivisions } from '../store/selectors';
import { setFilters, useView } from '../store/view';

/** Elegir subdivisión (es el mismo filtro de la barra superior). */
export function SubChips({ allLabel = 'Todas las subdivisiones' }: { allLabel?: string }) {
  const subs = useSubdivisions();
  const subdivisionId = useView((s) => s.filters.subdivisionId);
  return (
    <div className="sub-chips">
      <button className={`chip${!subdivisionId ? ' on' : ''}`} onClick={() => setFilters({ subdivisionId: null })}>{allLabel}</button>
      {subs.map((s) => (
        <button key={s.id} className={`chip${subdivisionId === s.id ? ' on' : ''}`} onClick={() => setFilters({ subdivisionId: s.id })}>
          <span className="swatch" style={{ background: s.color }} />{s.name}
        </button>
      ))}
    </div>
  );
}

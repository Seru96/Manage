import { useProject } from '../store/project';
import { personLabel, usePeople } from '../store/selectors';
import { initials } from './TasksView';

/** Varias personas: las elegidas como fichas y un desplegable para añadir más (agrupado por empresa). */
export function PeoplePicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
  const people = usePeople();
  const map = useProject((s) => s.entities.person);
  const companies = useProject((s) => s.entities.company);
  const free = people.filter((p) => !value.includes(p.id));
  const groups = new Map<string, typeof free>();
  for (const p of free) {
    const g = companies[p.companyId ?? '']?.name ?? 'Personal propio';
    groups.set(g, [...(groups.get(g) ?? []), p]);
  }
  return (
    <div className="people-picker">
      {value.map((id) => {
        const p = map[id];
        return (
          <span key={id} className="person-chip" data-person={id}>
            <span className="avatar" style={{ background: p?.color ?? 'var(--muted)' }}>{initials(personLabel(p))}</span>
            {personLabel(p)}
            <button type="button" aria-label={`Quitar a ${personLabel(p)}`} onClick={() => onChange(value.filter((x) => x !== id))}>×</button>
          </span>
        );
      })}
      <select className="people-add" value="" aria-label="Añadir persona" onChange={(e) => e.target.value && onChange([...value, e.target.value])}>
        <option value="">{value.length ? '+ Añadir' : 'Sin asignar · añadir persona…'}</option>
        {[...groups].map(([g, list]) => (
          <optgroup key={g} label={g}>{list.map((p) => <option key={p.id} value={p.id}>{personLabel(p)}</option>)}</optgroup>
        ))}
      </select>
    </div>
  );
}

/**
 * Puesta al día de proyectos de versiones anteriores al abrirlos. Los ids se conservan, así
 * que si dos personas abren a la vez un proyecto antiguo, hacen exactamente el mismo cambio.
 */
import { autoName, DEFAULT_ACCESS_COLUMNS, PALETTE, type Entities, type Person } from '../core/model';
import { remove, upsert, useProject } from '../store/project';

export function migrateProject() {
  const e: Entities = useProject.getState().entities;
  // 0.2 → 0.3: la tabla de accesos pasa a ser el equipo.
  const access = Object.values(e.accessPerson);
  if (access.length && !Object.keys(e.accessColumn).length) for (const c of DEFAULT_ACCESS_COLUMNS) upsert('accessColumn', c);
  access.forEach((a, i) => {
    const old = e.person[a.id];
    const p: Person = {
      ...old, id: a.id, color: old?.color ?? PALETTE[(i + 3) % PALETTE.length]!,
      name: old?.name || autoName(a.values), values: { ...old?.values, ...a.values }, siteIds: a.siteIds, companyId: old?.companyId ?? null,
    };
    upsert('person', p);
    remove('accessPerson', a.id);
  });
  // Personas de la 0.2 (solo nombre): se rellenan las columnas Nombre y Apellidos.
  for (const p of Object.values(useProject.getState().entities.person)) {
    if (p.values) continue;
    const [nombre = '', ...rest] = p.name.trim().split(/\s+/);
    upsert('person', { ...p, values: { nombre, apellidos: rest.join(' ') }, siteIds: p.siteIds ?? [], companyId: p.companyId ?? null });
  }
}

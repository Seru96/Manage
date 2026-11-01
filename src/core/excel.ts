/**
 * Proyecto ⇄ libro de Excel. El libro tiene una hoja por tipo de dato y una cabecera fija,
 * así que se puede rellenar o retocar en Excel e importar de vuelta:
 *
 * - Proyecto: nombre y versión del formato.
 * - Subdivisiones, Equipo, Tareas, Anotaciones, Recordatorios y Accesos.
 *
 * Al importar, cada fila con un ID que ya existe actualiza ese elemento; las demás crean
 * uno nuevo. Las subdivisiones, personas y tareas se pueden nombrar por su nombre (si no
 * existen, se crean). Importar nunca borra nada: lo que no está en el libro se queda igual.
 */
import { toDateStr } from './dates';
import {
  CRITICALITY, DEFAULT_ACCESS_COLUMNS, isGeneral, NOTE_SOURCE, PALETTE, REMINDER_KIND, STATUS,
  type AccessColumn, type AccessPerson, type Criticality, type Entities, type EntityTypes, type Kind,
  type Note, type Person, type Reminder, type Subdivision, type Task, type TaskStatus, newId,
} from './model';
import type { SheetData } from './xlsx/read';
import type { XlsxSheet } from './xlsx/write';

export const FORMAT = 'IMPLANTA Manage · formato 1';

const SHEETS = {
  project: 'Proyecto',
  subdivision: 'Subdivisiones',
  person: 'Equipo',
  task: 'Tareas',
  note: 'Anotaciones',
  reminder: 'Recordatorios',
  access: 'Accesos',
} as const;

const H = {
  subdivision: ['ID', 'Nombre', 'Color', 'General', 'Orden'],
  person: ['ID', 'Nombre', 'Color'],
  task: ['ID', 'Subdivisión', 'Nombre', 'Descripción', 'Criticidad', 'Estado', 'Asignado', 'Inicio', 'Fecha límite'],
  note: ['ID', 'Subdivisión', 'Origen', 'Autor', 'Fecha', 'Texto'],
  reminder: ['ID', 'Título', 'Fecha y hora', 'Tipo', 'Subdivisión', 'Tarea', 'Hecho'],
};

const yes = (b: boolean) => (b ? 'Sí' : '');
const isYes = (s: string) => /^(s[ií]|x|✓|1|true|verdadero|yes)$/i.test(s.trim());
const pad = (n: number) => String(n).padStart(2, '0');
const localIso = (ms: number) => { const d = new Date(ms); return `${toDateStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// ---------- Exportar ----------

export function exportWorkbook(name: string, e: Entities): XlsxSheet[] {
  const subs = Object.values(e.subdivision).sort((a, b) => Number(isGeneral(b)) - Number(isGeneral(a)) || a.order - b.order);
  const subName = (id: string | null) => e.subdivision[id ?? '']?.name ?? '';
  const row = (cells: (string | number)[]) => ({ cells });
  const cols = Object.values(e.accessColumn).sort((a, b) => a.order - b.order);
  return [
    { name: SHEETS.project, header: ['Campo', 'Valor'], widths: [16, 50], rows: [
      row(['Nombre', name]), row(['Formato', FORMAT]), row(['Exportado', localIso(Date.now()).replace('T', ' ')]),
    ] },
    { name: SHEETS.subdivision, header: H.subdivision, widths: [38, 28, 10, 9, 7],
      rows: subs.map((s) => row([s.id, s.name, s.color, yes(isGeneral(s)), s.order])) },
    { name: SHEETS.person, header: H.person, widths: [38, 28, 10],
      rows: Object.values(e.person).sort((a, b) => a.name.localeCompare(b.name, 'es')).map((p) => row([p.id, p.name, p.color])) },
    { name: SHEETS.task, header: H.task, widths: [38, 18, 34, 50, 10, 12, 22, 12, 12],
      rows: Object.values(e.task).sort((a, b) => subName(a.subdivisionId).localeCompare(subName(b.subdivisionId), 'es') || (a.due ?? '9').localeCompare(b.due ?? '9'))
        .map((t) => row([t.id, subName(t.subdivisionId), t.name, t.description, CRITICALITY[t.criticality].label, STATUS[t.status],
          e.person[t.assigneeId ?? '']?.name ?? '', t.start ?? '', t.due ?? ''])) },
    { name: SHEETS.note, header: H.note, widths: [38, 18, 16, 18, 17, 70],
      rows: Object.values(e.note).sort((a, b) => a.createdAt - b.createdAt)
        .map((n) => row([n.id, subName(n.subdivisionId), NOTE_SOURCE[n.source], n.author, localIso(n.createdAt).replace('T', ' '), n.body])) },
    { name: SHEETS.reminder, header: H.reminder, widths: [38, 34, 17, 18, 18, 30, 7],
      rows: Object.values(e.reminder).sort((a, b) => a.at.localeCompare(b.at))
        .map((r) => row([r.id, r.title, r.at.replace('T', ' '), REMINDER_KIND[r.kind], subName(r.subdivisionId), e.task[r.taskId ?? '']?.name ?? '', yes(r.done)])) },
    { name: SHEETS.access, header: ['ID', ...cols.map((c) => c.label), ...subs.map((s) => s.name)], widths: [38, ...cols.map(() => 18), ...subs.map(() => 12)],
      rows: Object.values(e.accessPerson).map((p) => row([p.id, ...cols.map((c) => p.values[c.id] ?? ''), ...subs.map((s) => yes(p.siteIds.includes(s.id)))])) },
  ];
}

// ---------- Importar ----------

export interface ImportResult {
  /** Nombre del proyecto según la hoja «Proyecto» (si la hay). */
  name: string | null;
  /** Elementos a guardar (nuevos o actualizados), en orden. */
  upserts: { kind: Kind; item: EntityTypes[Kind] }[];
  created: Partial<Record<Kind, number>>;
  updated: Partial<Record<Kind, number>>;
  warnings: string[];
}

/** Igualdad de valores JSON sin importar el orden de las claves (y tratando undefined como ausente). */
const canon = (v: unknown): unknown => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canon(x)]))
  : v);
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();

/** Lee una fecha escrita como texto (2026-11-03, 03/11/2026) o como número de serie de Excel. */
export function parseDateCell(s: string): string | null {
  const v = s.trim();
  if (!v) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(v);
  if (m) return `${m[1]}-${pad(+m[2]!)}-${pad(+m[3]!)}${m[4] ? `T${pad(+m[4])}:${m[5]}` : ''}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(v);
  if (m) {
    const y = m[3]!.length === 2 ? 2000 + +m[3]! : +m[3]!;
    return `${y}-${pad(+m[2]!)}-${pad(+m[1]!)}${m[4] ? `T${pad(+m[4])}:${m[5]}` : ''}`;
  }
  if (/^\d{4,6}(\.\d+)?$/.test(v)) {
    // Serie de Excel: días desde el 30/12/1899 (la parte decimal es la hora).
    const serial = Number(v);
    const ms = Date.UTC(1899, 11, 30) + Math.round(serial * 86_400_000);
    const d = new Date(ms);
    const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    return serial % 1 ? `${date}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : date;
  }
  return null;
}

function byLabel<K extends string>(map: Record<K, string | { label: string }>, value: string, fallback: K): K {
  const v = norm(value);
  if (!v) return fallback;
  for (const [k, l] of Object.entries(map) as [K, string | { label: string }][]) {
    if (norm(k) === v || norm(typeof l === 'string' ? l : l.label) === v) return k;
  }
  return fallback;
}

/** Hoja → filas como objetos por cabecera (sin filas vacías). */
function table(sheet: SheetData | undefined): Record<string, string>[] {
  if (!sheet || !sheet.rows.length) return [];
  const header = sheet.rows[0]!.map((h) => h.trim());
  return sheet.rows.slice(1)
    .filter((r) => r.some((c) => c && c.trim()))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

export function importWorkbook(sheets: SheetData[], current: Entities): ImportResult {
  const find = (name: string) => sheets.find((s) => norm(s.name) === norm(name));
  const res: ImportResult = { name: null, upserts: [], created: {}, updated: {}, warnings: [] };
  // Estado de trabajo: lo que hay más lo que se va importando (para resolver referencias).
  const e: Entities = {
    subdivision: { ...current.subdivision }, person: { ...current.person }, task: { ...current.task }, note: { ...current.note },
    reminder: { ...current.reminder }, accessColumn: { ...current.accessColumn }, accessPerson: { ...current.accessPerson },
  };
  const put = <K extends Kind>(kind: K, item: EntityTypes[K]) => {
    const old = e[kind][item.id];
    const isNew = !old;
    if (old && same(old, item)) return; // sin cambios: no se reescribe ni se cuenta
    (e[kind] as Record<string, EntityTypes[K]>)[item.id] = item;
    res.upserts.push({ kind, item });
    const bucket = isNew ? res.created : res.updated;
    bucket[kind] = (bucket[kind] ?? 0) + 1;
  };

  const meta = find(SHEETS.project);
  if (meta) for (const r of meta.rows) if (norm(r[0] ?? '') === 'nombre' && r[1]?.trim()) res.name = r[1].trim();

  // Subdivisiones (también las que solo aparecen nombradas en otras hojas).
  const subByName = () => new Map(Object.values(e.subdivision).map((s) => [norm(s.name), s]));
  const subRef = (value: string): string | null => {
    const v = value.trim();
    if (!v) return null;
    if (e.subdivision[v]) return v;
    const hit = subByName().get(norm(v));
    if (hit) return hit.id;
    const n = Object.keys(e.subdivision).length;
    const s: Subdivision = { id: newId(), name: v, color: PALETTE[n % PALETTE.length]!, order: n, general: norm(v) === 'general' };
    put('subdivision', s);
    return s.id;
  };
  for (const r of table(find(SHEETS.subdivision))) {
    if (!r.Nombre) continue;
    const id = r.ID || subByName().get(norm(r.Nombre))?.id || newId();
    const old = e.subdivision[id];
    const n = Object.keys(e.subdivision).length;
    put('subdivision', {
      ...old, id, name: r.Nombre, color: /^#[0-9a-f]{6}$/i.test(r.Color ?? '') ? r.Color! : old?.color ?? PALETTE[n % PALETTE.length]!,
      order: r.Orden && !Number.isNaN(+r.Orden) ? +r.Orden : old?.order ?? n,
      // Solo se guarda el indicador si cambia lo que ya se deducía (p. ej. por llamarse «General»).
      general: !old ? (isYes(r.General ?? '') || undefined)
        : r.General === undefined || isYes(r.General) === isGeneral({ ...old, name: r.Nombre }) ? old.general : isYes(r.General),
    });
  }

  // Equipo
  const personRef = (value: string): string | null => {
    const v = value.trim();
    if (!v) return null;
    if (e.person[v]) return v;
    const hit = Object.values(e.person).find((p) => norm(p.name) === norm(v));
    if (hit) return hit.id;
    const n = Object.keys(e.person).length;
    const p: Person = { id: newId(), name: v, color: PALETTE[(n + 3) % PALETTE.length]! };
    put('person', p);
    return p.id;
  };
  for (const r of table(find(SHEETS.person))) {
    if (!r.Nombre) continue;
    const id = r.ID || Object.values(e.person).find((p) => norm(p.name) === norm(r.Nombre!))?.id || newId();
    const old = e.person[id];
    const n = Object.keys(e.person).length;
    put('person', { ...old, id, name: r.Nombre, color: /^#[0-9a-f]{6}$/i.test(r.Color ?? '') ? r.Color! : old?.color ?? PALETTE[(n + 3) % PALETTE.length]! });
  }

  // Tareas
  for (const [i, r] of table(find(SHEETS.task)).entries()) {
    if (!r.Nombre) { res.warnings.push(`Tareas, fila ${i + 2}: sin nombre, se ignora.`); continue; }
    const id = r.ID || newId();
    const old = e.task[id];
    let start = parseDateCell(r.Inicio ?? '')?.slice(0, 10) ?? null;
    const due = parseDateCell(r['Fecha límite'] ?? '')?.slice(0, 10) ?? null;
    if ((r.Inicio && !start) || (r['Fecha límite'] && !due)) res.warnings.push(`Tareas, fila ${i + 2}: fecha no reconocida.`);
    if (start && due && start > due) start = due;
    const t: Task = {
      createdAt: Date.now(), ...old, id, name: r.Nombre, description: r['Descripción'] ?? old?.description ?? '',
      subdivisionId: subRef(r['Subdivisión'] ?? ''),
      criticality: byLabel<Criticality>(CRITICALITY, r.Criticidad ?? '', old?.criticality ?? 'media'),
      status: byLabel<TaskStatus>(STATUS, r.Estado ?? '', old?.status ?? 'pendiente'),
      assigneeId: personRef(r.Asignado ?? ''),
      start, due,
    };
    put('task', t);
  }

  // Anotaciones
  for (const r of table(find(SHEETS.note))) {
    if (!r.Texto) continue;
    const id = r.ID || newId();
    const old = e.note[id];
    const when = parseDateCell(r.Fecha ?? '');
    const n: Note = {
      taskId: null, ...old, id, body: r.Texto, author: r.Autor || old?.author || '',
      source: byLabel<Note['source']>(NOTE_SOURCE, r.Origen ?? '', old?.source ?? 'interna'),
      subdivisionId: subRef(r['Subdivisión'] ?? ''),
      createdAt: when ? new Date(when.length > 10 ? when : `${when}T12:00`).getTime() : old?.createdAt ?? Date.now(),
    };
    put('note', n);
  }

  // Recordatorios
  const taskRef = (value: string): string | null => {
    const v = value.trim();
    if (!v) return null;
    if (e.task[v]) return v;
    return Object.values(e.task).find((t) => norm(t.name) === norm(v))?.id ?? null;
  };
  for (const [i, r] of table(find(SHEETS.reminder)).entries()) {
    if (!r['Título']) continue;
    const at = parseDateCell(r['Fecha y hora'] ?? '');
    if (!at) { res.warnings.push(`Recordatorios, fila ${i + 2}: falta la fecha, se ignora.`); continue; }
    const id = r.ID || newId();
    const old = e.reminder[id];
    const rem: Reminder = {
      ...old, id, title: r['Título'], at: at.length > 10 ? at : `${at}T09:00`,
      kind: byLabel<Reminder['kind']>(REMINDER_KIND, r.Tipo ?? '', old?.kind ?? 'otro'),
      subdivisionId: subRef(r['Subdivisión'] ?? ''), taskId: taskRef(r.Tarea ?? ''), done: isYes(r.Hecho ?? ''),
    };
    put('reminder', rem);
  }

  // Accesos: las columnas que se llaman como una subdivisión son sus casillas; el resto, columnas de la tabla.
  const access = find(SHEETS.access);
  if (access && access.rows.slice(1).some((r) => r.some((c) => c && c.trim()))) {
    const header = access.rows[0]!.map((h) => h.trim());
    if (!Object.keys(e.accessColumn).length) for (const c of DEFAULT_ACCESS_COLUMNS) put('accessColumn', c);
    const colFor = new Map<number, string>(); // índice → id de columna
    const siteFor = new Map<number, string>(); // índice → id de subdivisión
    header.forEach((h, idx) => {
      if (!h || norm(h) === 'id') return;
      const sub = subByName().get(norm(h));
      if (sub) { siteFor.set(idx, sub.id); return; }
      let col = Object.values(e.accessColumn).find((c) => norm(c.label) === norm(h));
      if (!col) {
        const order = Math.max(-1, ...Object.values(e.accessColumn).map((c) => c.order)) + 1;
        col = { id: newId(), label: h, order } satisfies AccessColumn;
        put('accessColumn', col);
      }
      colFor.set(idx, col.id);
    });
    const idIdx = header.findIndex((h) => norm(h) === 'id');
    for (const r of access.rows.slice(1)) {
      if (!r.some((c) => c && c.trim())) continue;
      const id = (idIdx >= 0 ? r[idIdx]?.trim() : '') || newId();
      const old = e.accessPerson[id];
      const values = { ...old?.values };
      for (const [idx, col] of colFor) values[col] = (r[idx] ?? '').trim();
      const sites = new Set(old?.siteIds ?? []);
      for (const [idx, sub] of siteFor) { if (isYes(r[idx] ?? '')) sites.add(sub); else sites.delete(sub); }
      put('accessPerson', { ...old, id, values, siteIds: [...sites] } satisfies AccessPerson);
    }
  }

  return res;
}

/** [singular, plural, masculino] */
const KIND_LABEL: Record<Kind, [string, string, boolean]> = {
  subdivision: ['subdivisión', 'subdivisiones', false], person: ['persona', 'personas', false], task: ['tarea', 'tareas', false],
  note: ['anotación', 'anotaciones', false], reminder: ['recordatorio', 'recordatorios', true],
  accessColumn: ['columna de accesos', 'columnas de accesos', false], accessPerson: ['persona en accesos', 'personas en accesos', false],
};

/** «3 tareas nuevas y 2 actualizadas, 1 subdivisión nueva…» */
export function describeImport(r: ImportResult): string {
  const parts: string[] = [];
  for (const kind of Object.keys(KIND_LABEL) as Kind[]) {
    const c = r.created[kind] ?? 0, u = r.updated[kind] ?? 0;
    if (!c && !u) continue;
    const [one, many, m] = KIND_LABEL[kind];
    const word = (n: number, base: string) => `${n} ${base}${m ? 'o' : 'a'}${n === 1 ? '' : 's'}`;
    const bits = [c && word(c, 'nuev'), u && word(u, 'actualizad')].filter(Boolean).join(' y ');
    parts.push(`${c + u === 1 ? one : many}: ${bits}`);
  }
  return parts.length ? parts.join('; ') : 'ningún cambio';
}

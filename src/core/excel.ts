/**
 * Proyecto ⇄ libro de Excel. El libro tiene una hoja por tipo de dato y una cabecera fija,
 * así que se puede rellenar o retocar en Excel e importar de vuelta:
 *
 * Proyecto, Subdivisiones, Empresas, Equipo, Tareas, Recordatorios, Pedidos, Gastos,
 * Planos y docs, Facturas y partes, Certificaciones y Asistencia (subcontratas).
 *
 * Al importar, cada fila con un ID que ya existe actualiza ese elemento; las demás crean
 * uno nuevo. Subdivisiones, empresas, personas, tareas y pedidos se pueden nombrar por su
 * nombre (las subdivisiones, empresas y personas se crean si no existen). Importar nunca
 * borra nada: lo que no está en el libro se queda igual. Las columnas calculadas (lo
 * gastado o disponible de un pedido) se ignoran al importar.
 */
import { toDateStr } from './dates';
import { latestVersions } from './docs';
import { orderTotals, parseMoney } from './money';
import {
  assignees, attendanceId, autoName, CRITICALITY, DEFAULT_ACCESS_COLUMNS, DOC_STATUS, isGeneral, LINK_FORMAT, newId, PALETTE,
  REMINDER_KIND, STATUS, withAssignees,
  type AccessColumn, type Company, type Criticality, type Doc, type DocLink, type DocSection, type DocStatus, type Entities,
  type EntityTypes, type Expense, type Kind, type LinkFormat, type Order, type Person, type Reminder, type Subdivision, type Task, type TaskStatus,
} from './model';
import type { SheetData } from './xlsx/read';
import type { CellValue, XlsxSheet } from './xlsx/write';

export const FORMAT = 'IMPLANTA Manage · formato 2';

const SHEETS = {
  project: 'Proyecto',
  subdivision: 'Subdivisiones',
  company: 'Empresas',
  person: 'Equipo',
  task: 'Tareas',
  reminder: 'Recordatorios',
  order: 'Pedidos',
  expense: 'Gastos',
  plano: 'Planos y docs',
  factura: 'Facturas y partes',
  certificacion: 'Certificaciones',
  attendance: 'Asistencia',
  /** Hoja de la 0.2 (se importa como Equipo). */
  access: 'Accesos',
} as const;

const H = {
  subdivision: ['ID', 'Nombre', 'Color', 'General', 'Orden'],
  company: ['ID', 'Nombre', 'Color'],
  task: ['ID', 'Subdivisión', 'Nombre', 'Descripción', 'Criticidad', 'Estado', 'Asignados', 'Inicio', 'Fecha límite'],
  reminder: ['ID', 'Título', 'Fecha y hora', 'Tipo', 'Subdivisión', 'Tarea', 'Hecho'],
  order: ['ID', 'Nº pedido', 'Nombre', 'Descripción', 'Proveedor', 'Subcontrata', 'Subdivisión', 'Fecha', 'Importe', 'Gastado', 'Disponible', 'Facturado', 'Sin facturar'],
  expense: ['ID', 'Nº pedido', 'Nombre', 'Descripción', 'Fecha', 'Importe', 'Facturado', 'Nº factura', 'Jornadas', '€ por jornada'],
  plano: ['ID', 'Serie', 'Subdivisión', 'Nombre', 'Descripción', 'Versión', 'Última', 'Estado', 'Fecha', 'Word', 'Excel', 'PDF', 'Visio', 'Otro'],
  factura: ['ID', 'Subdivisión', 'Nombre', 'Descripción', 'Fecha', 'ID gasto', 'Gasto', 'PDF'],
  certificacion: ['ID', 'Subdivisión', 'Nombre', 'Descripción', 'Fecha', 'PDF'],
  attendance: ['Fecha', 'Persona', 'Empresa', 'Subdivisión', 'Nota'],
};
const PERSON_FIXED = ['ID', 'Nombre corto', 'Empresa', 'Color'];
const FORMATS: LinkFormat[] = ['word', 'excel', 'pdf', 'visio', 'otro'];

const yes = (b: boolean) => (b ? 'Sí' : '');
const isYes = (s: string) => /^(s[ií]|x|✓|1|true|verdadero|yes)$/i.test(s.trim());
const pad = (n: number) => String(n).padStart(2, '0');
const localIso = (ms: number) => { const d = new Date(ms); return `${toDateStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const eur = (v: number): CellValue => ({ v, eur: true });
const label = (p: Person | undefined) => p?.name.trim() || autoName(p?.values) || '';

// ---------- Exportar ----------

export function exportWorkbook(name: string, e: Entities): XlsxSheet[] {
  const subs = Object.values(e.subdivision).sort((a, b) => Number(isGeneral(b)) - Number(isGeneral(a)) || a.order - b.order);
  const subName = (id: string | null) => e.subdivision[id ?? '']?.name ?? '';
  const company = (id: string | null | undefined) => e.company[id ?? '']?.name ?? '';
  const row = (cells: CellValue[]) => ({ cells });
  const cols = Object.values(e.accessColumn).sort((a, b) => a.order - b.order);
  const people = Object.values(e.person).sort((a, b) => company(a.companyId).localeCompare(company(b.companyId), 'es') || label(a).localeCompare(label(b), 'es'));
  const orders = Object.values(e.order).sort((a, b) => a.number.localeCompare(b.number, 'es', { numeric: true }));
  const expensesOf = (id: string) => Object.values(e.expense).filter((x) => x.orderId === id);
  const docs = (s: DocSection) => Object.values(e.doc).filter((d) => d.section === s)
    .sort((a, b) => subName(a.subdivisionId).localeCompare(subName(b.subdivisionId), 'es') || a.name.localeCompare(b.name, 'es') || a.version.localeCompare(b.version, 'es', { numeric: true }));
  const latest = new Set(latestVersions(docs('plano')).map((d) => d.id));
  const linksOf = (d: Doc, f: LinkFormat) => d.links.filter((l) => l.format === f).map((l) => l.target).join(' | ');
  const pdfOf = (d: Doc) => (d.links.find((l) => l.format === 'pdf') ?? d.links[0])?.target ?? '';
  const expenseText = (id: string | null) => {
    const x = e.expense[id ?? ''];
    if (!x) return '';
    return [e.order[x.orderId]?.number, x.name].filter(Boolean).join(' · ');
  };
  return [
    { name: SHEETS.project, header: ['Campo', 'Valor'], widths: [16, 50], rows: [
      row(['Nombre', name]), row(['Formato', FORMAT]), row(['Exportado', localIso(Date.now()).replace('T', ' ')]),
    ] },
    { name: SHEETS.subdivision, header: H.subdivision, widths: [38, 28, 10, 9, 7],
      rows: subs.map((s) => row([s.id, s.name, s.color, yes(isGeneral(s)), s.order])) },
    { name: SHEETS.company, header: H.company, widths: [38, 30, 10],
      rows: Object.values(e.company).sort((a, b) => a.name.localeCompare(b.name, 'es')).map((c) => row([c.id, c.name, c.color])) },
    { name: SHEETS.person, header: [...PERSON_FIXED, ...cols.map((c) => c.label), ...subs.map((s) => s.name)],
      widths: [38, 22, 22, 10, ...cols.map(() => 18), ...subs.map(() => 12)],
      rows: people.map((p) => row([p.id, p.name, company(p.companyId), p.color, ...cols.map((c) => p.values?.[c.id] ?? ''), ...subs.map((s) => yes(!!p.siteIds?.includes(s.id)))])) },
    { name: SHEETS.task, header: H.task, widths: [38, 18, 34, 50, 10, 12, 30, 12, 12],
      rows: Object.values(e.task).sort((a, b) => subName(a.subdivisionId).localeCompare(subName(b.subdivisionId), 'es') || (a.due ?? '9').localeCompare(b.due ?? '9'))
        .map((t) => row([t.id, subName(t.subdivisionId), t.name, t.description, CRITICALITY[t.criticality].label, STATUS[t.status],
          assignees(t).map((id) => label(e.person[id])).filter(Boolean).join('; '), t.start ?? '', t.due ?? ''])) },
    { name: SHEETS.reminder, header: H.reminder, widths: [38, 34, 17, 18, 18, 30, 7],
      rows: Object.values(e.reminder).sort((a, b) => a.at.localeCompare(b.at))
        .map((r) => row([r.id, r.title, r.at.replace('T', ' '), REMINDER_KIND[r.kind], subName(r.subdivisionId), e.task[r.taskId ?? '']?.name ?? '', yes(r.done)])) },
    { name: SHEETS.order, header: H.order, widths: [38, 16, 30, 40, 22, 22, 18, 12, 14, 14, 14, 14, 14],
      rows: orders.map((o) => {
        const t = orderTotals(o, expensesOf(o.id));
        return row([o.id, o.number, o.name, o.description, o.supplier, company(o.companyId), subName(o.subdivisionId), o.date ?? '', eur(o.amount), eur(t.spent), eur(t.available), eur(t.invoiced), eur(t.notInvoiced)]);
      }) },
    { name: SHEETS.expense, header: H.expense, widths: [38, 16, 30, 40, 12, 14, 10, 16, 10, 14],
      rows: orders.flatMap((o) => expensesOf(o.id).sort((a, b) => (a.date ?? '9').localeCompare(b.date ?? '9'))
        .map((x) => row([x.id, o.number || o.name, x.name, x.description, x.date ?? '', eur(x.amount), yes(x.invoiced), x.invoiceNumber,
          x.labor ? x.labor.shifts : '', x.labor ? eur(x.labor.rate) : '']))) },
    { name: SHEETS.plano, header: H.plano, widths: [38, 38, 18, 34, 40, 9, 8, 12, 12, 30, 30, 30, 30, 30],
      rows: docs('plano').map((d) => row([d.id, d.seriesId, subName(d.subdivisionId), d.name, d.description, d.version, yes(latest.has(d.id)), DOC_STATUS[d.status], d.date ?? '',
        ...FORMATS.map((f) => linksOf(d, f))])) },
    { name: SHEETS.factura, header: H.factura, widths: [38, 18, 34, 40, 12, 38, 34, 40],
      rows: docs('factura').map((d) => row([d.id, subName(d.subdivisionId), d.name, d.description, d.date ?? '', d.expenseId ?? '', expenseText(d.expenseId), pdfOf(d)])) },
    { name: SHEETS.certificacion, header: H.certificacion, widths: [38, 18, 34, 40, 12, 40],
      rows: docs('certificacion').map((d) => row([d.id, subName(d.subdivisionId), d.name, d.description, d.date ?? '', pdfOf(d)])) },
    { name: SHEETS.attendance, header: H.attendance, widths: [12, 26, 26, 18, 30],
      rows: Object.values(e.attendance).sort((a, b) => a.date.localeCompare(b.date) || label(e.person[a.personId]).localeCompare(label(e.person[b.personId]), 'es'))
        .map((a) => row([a.date, label(e.person[a.personId]), company(e.person[a.personId]?.companyId), subName(a.subdivisionId), a.note ?? ''])) },
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

/** Importe de una celda: número de Excel tal cual, o texto escrito a mano («1.234,56 €»). */
const money = (s: string | undefined): number | null => {
  const v = (s ?? '').trim();
  if (/^-?\d+(\.\d+)?(e-?\d+)?$/i.test(v)) return Math.round(Number(v) * 100) / 100;
  return parseMoney(v);
};
const color = (s: string | undefined, fallback: string) => (/^#[0-9a-f]{6}$/i.test(s ?? '') ? s! : fallback);
const date = (s: string | undefined) => parseDateCell(s ?? '')?.slice(0, 10) ?? null;

export function importWorkbook(sheets: SheetData[], current: Entities): ImportResult {
  const find = (name: string) => sheets.find((s) => norm(s.name) === norm(name));
  const res: ImportResult = { name: null, upserts: [], created: {}, updated: {}, warnings: [] };
  // Estado de trabajo: lo que hay más lo que se va importando (para resolver referencias).
  const e = Object.fromEntries(Object.entries(current).map(([k, v]) => [k, { ...v }])) as Entities;
  const put = <K extends Kind>(kind: K, item: EntityTypes[K]) => {
    const old = e[kind][item.id];
    const isNew = !old;
    if (old && same(old, item)) return; // sin cambios: no se reescribe ni se cuenta
    (e[kind] as Record<string, EntityTypes[K]>)[item.id] = item;
    res.upserts.push({ kind, item });
    const bucket = isNew ? res.created : res.updated;
    bucket[kind] = (bucket[kind] ?? 0) + 1;
  };
  const count = (kind: Kind) => Object.keys(e[kind]).length;

  const meta = find(SHEETS.project);
  if (meta) for (const r of meta.rows) if (norm(r[0] ?? '') === 'nombre' && r[1]?.trim()) res.name = r[1].trim();

  // Subdivisiones (también las que solo aparecen nombradas en otras hojas).
  const subByName = () => new Map(Object.values(e.subdivision).map((s) => [norm(s.name), s]));
  const subRef = (value: string | undefined): string | null => {
    const v = (value ?? '').trim();
    if (!v) return null;
    if (e.subdivision[v]) return v;
    const hit = subByName().get(norm(v));
    if (hit) return hit.id;
    const n = count('subdivision');
    const s: Subdivision = { id: newId(), name: v, color: PALETTE[n % PALETTE.length]!, order: n, general: norm(v) === 'general' };
    put('subdivision', s);
    return s.id;
  };
  for (const r of table(find(SHEETS.subdivision))) {
    if (!r.Nombre) continue;
    const id = r.ID || subByName().get(norm(r.Nombre))?.id || newId();
    const old = e.subdivision[id];
    const n = count('subdivision');
    put('subdivision', {
      ...old, id, name: r.Nombre, color: color(r.Color, old?.color ?? PALETTE[n % PALETTE.length]!),
      order: r.Orden && !Number.isNaN(+r.Orden) ? +r.Orden : old?.order ?? n,
      // Solo se guarda el indicador si cambia lo que ya se deducía (p. ej. por llamarse «General»).
      general: !old ? (isYes(r.General ?? '') || undefined)
        : r.General === undefined || isYes(r.General) === isGeneral({ ...old, name: r.Nombre }) ? old.general : isYes(r.General),
    });
  }

  // Empresas
  const companyRef = (value: string | undefined): string | null => {
    const v = (value ?? '').trim();
    if (!v || norm(v) === 'propio') return null;
    if (e.company[v]) return v;
    const hit = Object.values(e.company).find((c) => norm(c.name) === norm(v));
    if (hit) return hit.id;
    const c: Company = { id: newId(), name: v, color: PALETTE[(count('company') + 5) % PALETTE.length]! };
    put('company', c);
    return c.id;
  };
  for (const r of table(find(SHEETS.company))) {
    if (!r.Nombre) continue;
    const id = r.ID || Object.values(e.company).find((c) => norm(c.name) === norm(r.Nombre!))?.id || newId();
    const old = e.company[id];
    put('company', { ...old, id, name: r.Nombre, color: color(r.Color, old?.color ?? PALETTE[(count('company') + 5) % PALETTE.length]!) });
  }

  // Equipo: columnas fijas, las que se llaman como una subdivisión (casillas de acceso) y el resto, columnas de la tabla.
  const personByName = (v: string) => Object.values(e.person).find((p) => norm(label(p)) === norm(v) || norm([p.values?.nombre, p.values?.apellidos].filter(Boolean).join(' ')) === norm(v));
  const personRef = (value: string, companyName?: string): string | null => {
    const v = value.trim();
    if (!v) return null;
    if (e.person[v]) return v;
    const hit = personByName(v);
    if (hit) return hit.id;
    const [nombre = '', ...rest] = v.split(/\s+/);
    const p: Person = { id: newId(), name: v, color: PALETTE[(count('person') + 3) % PALETTE.length]!, values: { nombre, apellidos: rest.join(' ') }, siteIds: [], companyId: companyRef(companyName) };
    put('person', p);
    return p.id;
  };
  for (const sheet of [find(SHEETS.person), find(SHEETS.access)]) {
    if (!sheet || !sheet.rows.slice(1).some((r) => r.some((c) => c && c.trim()))) continue;
    const header = sheet.rows[0]!.map((h) => h.trim());
    const at = (h: string) => header.findIndex((x) => norm(x) === norm(h));
    if (!Object.keys(e.accessColumn).length) for (const c of DEFAULT_ACCESS_COLUMNS) put('accessColumn', c);
    const colFor = new Map<number, string>(); // índice → id de columna
    const siteFor = new Map<number, string>(); // índice → id de subdivisión
    header.forEach((h, idx) => {
      if (!h || PERSON_FIXED.some((f) => norm(f) === norm(h))) return;
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
    const [iId, iName, iCompany, iColor] = PERSON_FIXED.map(at) as [number, number, number, number];
    for (const r of sheet.rows.slice(1)) {
      if (!r.some((c) => c && c.trim())) continue;
      const cell = (i: number) => (i >= 0 ? (r[i] ?? '').trim() : undefined);
      const values: Record<string, string> = {};
      for (const [idx, col] of colFor) values[col] = (r[idx] ?? '').trim();
      const shortName = cell(iName);
      const id = cell(iId) || (shortName ? personByName(shortName)?.id : undefined) || newId();
      const old = e.person[id];
      const merged = { ...old?.values, ...values };
      const sites = new Set(old?.siteIds ?? []);
      for (const [idx, sub] of siteFor) { if (isYes(r[idx] ?? '')) sites.add(sub); else sites.delete(sub); }
      put('person', {
        ...old, id, values: merged, siteIds: [...sites],
        name: shortName !== undefined ? shortName : old?.name || autoName(merged),
        color: color(cell(iColor), old?.color ?? PALETTE[(count('person') + 3) % PALETTE.length]!),
        companyId: iCompany >= 0 ? companyRef(cell(iCompany)) : old?.companyId ?? null,
      });
    }
  }

  // Tareas
  for (const [i, r] of table(find(SHEETS.task)).entries()) {
    if (!r.Nombre) { res.warnings.push(`Tareas, fila ${i + 2}: sin nombre, se ignora.`); continue; }
    const id = r.ID || newId();
    const old = e.task[id];
    let start = date(r.Inicio);
    const due = date(r['Fecha límite']);
    if ((r.Inicio && !start) || (r['Fecha límite'] && !due)) res.warnings.push(`Tareas, fila ${i + 2}: fecha no reconocida.`);
    if (start && due && start > due) start = due;
    const who = (r.Asignados ?? r.Asignado ?? '').split(/[;,\n]/).map((x) => personRef(x)).filter((x): x is string => !!x);
    const t: Task = {
      createdAt: Date.now(), ...old, id, name: r.Nombre, description: r['Descripción'] ?? old?.description ?? '',
      subdivisionId: subRef(r['Subdivisión']),
      criticality: byLabel<Criticality>(CRITICALITY, r.Criticidad ?? '', old?.criticality ?? 'media'),
      status: byLabel<TaskStatus>(STATUS, r.Estado ?? '', old?.status ?? 'pendiente'),
      // Si son las mismas personas, se deja como estaba (las tareas de la 0.2 tienen solo `assigneeId`).
      ...(old && same(assignees(old), [...new Set(who)]) ? { assigneeIds: old.assigneeIds, assigneeId: old.assigneeId } : withAssignees([...new Set(who)])),
      start, due,
    };
    put('task', t);
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
      subdivisionId: subRef(r['Subdivisión']), taskId: taskRef(r.Tarea ?? ''), done: isYes(r.Hecho ?? ''),
    };
    put('reminder', rem);
  }

  // Pedidos (Gastado, Disponible… son calculados: no se leen)
  for (const [i, r] of table(find(SHEETS.order)).entries()) {
    if (!r['Nº pedido'] && !r.Nombre) continue;
    const id = r.ID || Object.values(e.order).find((o) => r['Nº pedido'] && norm(o.number) === norm(r['Nº pedido']!))?.id || newId();
    const old = e.order[id];
    const amount = money(r.Importe);
    if (r.Importe && amount === null) res.warnings.push(`Pedidos, fila ${i + 2}: importe no reconocido.`);
    const o: Order = {
      createdAt: Date.now(), ...old, id, number: r['Nº pedido'] ?? '', name: r.Nombre ?? '', description: r['Descripción'] ?? '', supplier: r.Proveedor ?? '',
      subdivisionId: subRef(r['Subdivisión']), date: date(r.Fecha), amount: amount ?? old?.amount ?? 0,
    };
    if (r.Subcontrata !== undefined) { const cid = companyRef(r.Subcontrata); if (cid || o.companyId) o.companyId = cid; }
    put('order', o);
  }

  // Gastos
  const orderRef = (v: string | undefined) => {
    const x = (v ?? '').trim();
    if (!x) return null;
    if (e.order[x]) return x;
    return Object.values(e.order).find((o) => norm(o.number) === norm(x) || norm(o.name) === norm(x))?.id ?? null;
  };
  for (const [i, r] of table(find(SHEETS.expense)).entries()) {
    if (!r.Nombre && !r.Importe) continue;
    const old = e.expense[r.ID ?? ''];
    const orderId = orderRef(r['Nº pedido']) ?? old?.orderId;
    if (!orderId) { res.warnings.push(`Gastos, fila ${i + 2}: no se encuentra el pedido «${r['Nº pedido'] ?? ''}», se ignora.`); continue; }
    const amount = money(r.Importe);
    if (r.Importe && amount === null) res.warnings.push(`Gastos, fila ${i + 2}: importe no reconocido.`);
    const x: Expense = {
      createdAt: Date.now(), ...old, id: r.ID || newId(), orderId, name: r.Nombre ?? '', description: r['Descripción'] ?? '', date: date(r.Fecha),
      amount: amount ?? old?.amount ?? 0, invoiced: isYes(r.Facturado ?? ''), invoiceNumber: r['Nº factura'] ?? '',
    };
    put('expense', x);
  }

  // Documentación
  const links = (old: DocLink[] | undefined, byFormat: [LinkFormat, string | undefined][]): DocLink[] => {
    const out: DocLink[] = [];
    for (const [format, cell] of byFormat) {
      for (const target of (cell ?? '').split(/\s*\|\s*|\n/).map((x) => x.trim()).filter(Boolean)) {
        out.push({ id: old?.find((l) => l.target === target)?.id ?? newId(), format, target });
      }
    }
    // Mismo orden que ya tenían (el libro los agrupa por formato).
    const pos = (l: DocLink) => { const i = old?.findIndex((o) => o.id === l.id) ?? -1; return i < 0 ? Infinity : i; };
    return out.map((l, i) => ({ l, i })).sort((a, b) => pos(a.l) - pos(b.l) || a.i - b.i).map((x) => x.l);
  };
  const docBase = (section: DocSection, r: Record<string, string>, old: Doc | undefined): Doc => {
    const id = r.ID || old?.id || newId();
    // Las facturas y certificaciones no tienen versiones: su serie es el propio documento.
    return {
    createdAt: Date.now(), version: 'A0', status: 'pendiente', expenseId: null, links: [], seriesId: section === 'plano' ? newId() : id, ...old,
    id, section, name: r.Nombre ?? '', description: r['Descripción'] ?? '', subdivisionId: subRef(r['Subdivisión']), date: date(r.Fecha),
    };
  };
  for (const r of table(find(SHEETS.plano))) {
    if (!r.Nombre) continue;
    const old = e.doc[r.ID ?? ''];
    const d = docBase('plano', r, old);
    const series = r.Serie || old?.seriesId || Object.values(e.doc).find((x) => x.section === 'plano' && norm(x.name) === norm(r.Nombre!))?.seriesId || d.seriesId;
    put('doc', {
      ...d, seriesId: series, version: (r['Versión'] || old?.version || 'A0').toUpperCase(),
      status: byLabel<DocStatus>(DOC_STATUS, r.Estado ?? '', old?.status ?? 'pendiente'),
      links: links(old?.links, FORMATS.map((f) => [f, r[LINK_FORMAT[f]]])),
    });
  }
  for (const r of table(find(SHEETS.factura))) {
    if (!r.Nombre) continue;
    const old = e.doc[r.ID ?? ''];
    const byId = r['ID gasto'] && e.expense[r['ID gasto']] ? r['ID gasto'] : null;
    const byName = r.Gasto ? Object.values(e.expense).find((x) => norm([e.order[x.orderId]?.number, x.name].filter(Boolean).join(' · ')) === norm(r.Gasto!) || norm(x.name) === norm(r.Gasto!))?.id : null;
    put('doc', { ...docBase('factura', r, old), expenseId: byId ?? byName ?? null, links: links(old?.links, [['pdf', r.PDF]]) });
  }
  for (const r of table(find(SHEETS.certificacion))) {
    if (!r.Nombre) continue;
    const old = e.doc[r.ID ?? ''];
    put('doc', { ...docBase('certificacion', r, old), links: links(old?.links, [['pdf', r.PDF]]) });
  }

  // Asistencia de subcontratas (una fila por persona y día)
  for (const [i, r] of table(find(SHEETS.attendance)).entries()) {
    const d = date(r.Fecha);
    if (!d || !r.Persona) { if (r.Fecha || r.Persona) res.warnings.push(`Asistencia, fila ${i + 2}: falta la fecha o la persona, se ignora.`); continue; }
    const personId = personRef(r.Persona, r.Empresa || undefined);
    if (!personId) continue;
    const id = attendanceId(d, personId);
    put('attendance', { ...e.attendance[id], id, personId, date: d, subdivisionId: subRef(r['Subdivisión']), ...(r.Nota ? { note: r.Nota } : {}) });
  }

  return res;
}

/** [singular, plural, masculino] */
const KIND_LABEL: Record<Kind, [string, string, boolean]> = {
  subdivision: ['subdivisión', 'subdivisiones', false], company: ['empresa', 'empresas', false], person: ['persona', 'personas', false],
  task: ['tarea', 'tareas', false], reminder: ['recordatorio', 'recordatorios', true],
  accessColumn: ['columna del equipo', 'columnas del equipo', false], accessPerson: ['persona en accesos', 'personas en accesos', false],
  order: ['pedido', 'pedidos', true], expense: ['gasto', 'gastos', true], doc: ['documento', 'documentos', true],
  attendance: ['día de subcontrata', 'días de subcontrata', true],
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

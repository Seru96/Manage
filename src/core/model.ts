/**
 * Modelo de datos. Cada entidad se guarda como una fila JSON en el `.manage`
 * (`kind` + `id`), así que añadir un campo no necesita migraciones.
 */
export type Criticality = 'baja' | 'media' | 'alta' | 'critica';
export type TaskStatus = 'pendiente' | 'en_curso' | 'bloqueada' | 'hecha';
/** Fecha de calendario sin hora: «2026-11-03». */
export type DateStr = string;

/** Subdivisión del proyecto (un sitio, una planta, una fase…). */
export interface Subdivision {
  id: string; name: string; color: string; order: number;
  /** La subdivisión «General» abarca a todas las demás: filtrar por ella enseña todo y sus
   * tareas no chocan con las de los sitios. */
  general?: boolean;
}

/** ¿Es la subdivisión general? (Los proyectos de la 0.1.0 la tienen sin marcar, pero se llama «General».) */
export const isGeneral = (s: Subdivision | undefined | null) => !!s && (s.general ?? s.name.trim().toLowerCase() === 'general');

/**
 * Persona del equipo (propia o de una subcontrata). Es a la vez la fila de la tabla Equipo
 * (`values`, una por columna, y los sitios con acceso) y a quien se asignan tareas.
 */
export interface Person {
  id: string;
  /** Nombre corto con el que sale en tareas y calendario. Por defecto, primer nombre y primer apellido. */
  name: string;
  color: string;
  /** Valor de cada columna de la tabla Equipo, por id de columna. */
  values?: Record<string, string>;
  /** Subdivisiones (sitios) a las que tiene acceso. */
  siteIds?: string[];
  /** Empresa subcontratada (vacío: personal propio). */
  companyId?: string | null;
}

/** Empresa subcontratada. */
export interface Company { id: string; name: string; color: string }

/**
 * Marcar o quitar un sitio de acceso. La general abarca a todos: marcarla marca todos los
 * sitios y quitarla los quita. Quitar otro sitio quita también la general; marcar el último
 * que faltaba la marca.
 */
export function toggleSiteIds(cur: string[], site: string, on: boolean, subs: Subdivision[]): string[] {
  const general = subs.filter((s) => isGeneral(s)).map((s) => s.id);
  if (general.includes(site)) return on ? subs.map((s) => s.id) : [];
  if (!on) return cur.filter((s) => s !== site && !general.includes(s));
  const next = [...new Set([...cur, site])];
  return subs.every((s) => isGeneral(s) || next.includes(s.id)) ? [...new Set([...next, ...general])] : next;
}

/** Nombre corto a partir de las columnas: primer nombre y primer apellido. */
export function autoName(values: Record<string, string> | undefined): string {
  const first = (s: string | undefined) => (s ?? '').trim().split(/\s+/)[0] ?? '';
  return [first(values?.nombre), first(values?.apellidos)].filter(Boolean).join(' ');
}

export interface Task {
  id: string;
  subdivisionId: string | null;
  name: string;
  description: string;
  criticality: Criticality;
  status: TaskStatus;
  /** Personas asignadas. */
  assigneeIds?: string[];
  /** La primera asignada (lo que leen las versiones 0.1 y 0.2). */
  assigneeId: string | null;
  /** Inicio (si falta, la tarea dura solo el día límite). */
  start: DateStr | null;
  /** Fecha límite. */
  due: DateStr | null;
  createdAt: number;
}

/** Personas asignadas a una tarea (también las de proyectos de la 0.2, con una sola). */
export const assignees = (t: Pick<Task, 'assigneeIds' | 'assigneeId'>): string[] => t.assigneeIds ?? (t.assigneeId ? [t.assigneeId] : []);
/** Cambios para asignar estas personas (manteniendo `assigneeId` para versiones antiguas). */
export const withAssignees = (ids: string[]): Pick<Task, 'assigneeIds' | 'assigneeId'> => ({ assigneeIds: ids, assigneeId: ids[0] ?? null });

/** Recordatorio con aviso nativo: pruebas con cliente, hitos… */
export interface Reminder {
  id: string;
  title: string;
  /** ISO local «2026-11-03T09:30». */
  at: string;
  kind: 'prueba' | 'hito' | 'otro';
  subdivisionId: string | null;
  taskId: string | null;
  done: boolean;
}

/** Columna de la tabla Equipo. Las de serie (nombre, apellidos, DNI, matrícula) tienen
 * ids fijos para que dos personas que abren la vista a la vez no las dupliquen. */
export interface AccessColumn { id: string; label: string; order: number }

export const DEFAULT_ACCESS_COLUMNS: AccessColumn[] = [
  { id: 'nombre', label: 'Nombre', order: 0 },
  { id: 'apellidos', label: 'Apellidos', order: 1 },
  { id: 'dni', label: 'DNI', order: 2 },
  { id: 'matricula', label: 'Matrícula', order: 3 },
];

/** Tabla de accesos de la 0.2: al abrir el proyecto se pasa al equipo (`Person`). */
export interface AccessPerson {
  id: string;
  /** Valor de cada columna, por id de columna. */
  values: Record<string, string>;
  /** Subdivisiones (sitios) a las que tiene acceso. */
  siteIds: string[];
}

/** Día en que una persona de una subcontrata fue a la obra. Id fijo «fecha:persona»: marcarlo
 * dos personas a la vez no lo duplica. */
export interface Attendance { id: string; personId: string; date: DateStr; subdivisionId: string | null; note?: string }
export const attendanceId = (date: DateStr, personId: string) => `${date}:${personId}`;

/** Pedido: el dinero disponible para un capítulo de la obra. Se reparte en gastos. */
export interface Order {
  id: string;
  number: string;
  name: string;
  description: string;
  supplier: string;
  amount: number;
  date: DateStr | null;
  subdivisionId: string | null;
  /** Empresa subcontratada a la que se hizo el pedido (opcional). */
  companyId?: string | null;
  createdAt: number;
}

/**
 * Gasto de jornadas de una subcontrata: las que apuntó su gente en el calendario entre dos
 * fechas (de las personas elegidas y, si se indica, de un sitio), a un precio por jornada.
 * El importe del gasto es `rate × shifts`; `shifts` se guarda para que no cambie solo.
 */
export interface Labor {
  companyId: string;
  from: DateStr;
  to: DateStr;
  personIds: string[];
  subdivisionId: string | null;
  /** Precio de una jornada de una persona. */
  rate: number;
  shifts: number;
}

/** Gasto contra un pedido. */
export interface Expense {
  id: string;
  orderId: string;
  name: string;
  description: string;
  amount: number;
  date: DateStr | null;
  invoiced: boolean;
  invoiceNumber: string;
  /** Si es un gasto de jornadas de subcontrata, de dónde salen. */
  labor?: Labor | null;
  createdAt: number;
}

export type DocSection = 'plano' | 'factura' | 'certificacion';
export type DocStatus = 'pendiente' | 'realizado' | 'firmado';
export type LinkFormat = 'word' | 'excel' | 'pdf' | 'visio' | 'otro';
/** Enlace a un fichero (ruta relativa a la carpeta del proyecto, absoluta) o a una web. */
export interface DocLink { id: string; format: LinkFormat; target: string }

/**
 * Documento: plano o documento (con versiones A0, A1…), factura o parte de trabajo
 * (con su gasto) o certificación.
 */
export interface Doc {
  id: string;
  section: DocSection;
  /** Todas las versiones de un mismo documento comparten serie. */
  seriesId: string;
  name: string;
  description: string;
  subdivisionId: string | null;
  /** Solo planos y documentos. */
  version: string;
  status: DocStatus;
  date: DateStr | null;
  links: DocLink[];
  /** Facturas y partes: el gasto con el que se corresponden. */
  expenseId: string | null;
  createdAt: number;
}

export interface EntityTypes {
  subdivision: Subdivision;
  person: Person;
  company: Company;
  task: Task;
  reminder: Reminder;
  accessColumn: AccessColumn;
  accessPerson: AccessPerson;
  attendance: Attendance;
  order: Order;
  expense: Expense;
  doc: Doc;
}
export type Kind = keyof EntityTypes;
export const KINDS: Kind[] = ['subdivision', 'person', 'company', 'task', 'reminder', 'accessColumn', 'accessPerson', 'attendance', 'order', 'expense', 'doc'];

export type Entities = { [K in Kind]: Record<string, EntityTypes[K]> };
export const emptyEntities = (): Entities => Object.fromEntries(KINDS.map((k) => [k, {}])) as Entities;

export const CRITICALITY: Record<Criticality, { label: string; rank: number }> = {
  baja: { label: 'Baja', rank: 0 },
  media: { label: 'Media', rank: 1 },
  alta: { label: 'Alta', rank: 2 },
  critica: { label: 'Crítica', rank: 3 },
};
export const STATUS: Record<TaskStatus, string> = {
  pendiente: 'Sin iniciar',
  en_curso: 'En curso',
  bloqueada: 'Bloqueada',
  hecha: 'Completada',
};

/** Colores de subdivisiones y personas (los del sistema de Apple, legibles en claro y oscuro). */
export const PALETTE = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff375f', '#64d2ff', '#ffd60a', '#ac8e68', '#5e5ce6', '#ff6961'];

export const newId = () => crypto.randomUUID();

export const REMINDER_KIND: Record<Reminder['kind'], string> = { prueba: 'Prueba con cliente', hito: 'Hito', otro: 'Otro' };

export const DOC_SECTION: Record<DocSection, string> = { plano: 'Planos y docs', factura: 'Facturas y partes', certificacion: 'Certificaciones' };
export const DOC_STATUS: Record<DocStatus, string> = { pendiente: 'Sin iniciar', realizado: 'Realizado', firmado: 'Firmado' };
export const LINK_FORMAT: Record<LinkFormat, string> = { word: 'Word', excel: 'Excel', pdf: 'PDF', visio: 'Visio', otro: 'Otro' };

/** Formato según la extensión del fichero. */
export function formatOf(target: string): LinkFormat {
  const ext = /\.([a-z0-9]+)(?:[?#].*)?$/i.exec(target)?.[1]?.toLowerCase() ?? '';
  if (['doc', 'docx', 'docm', 'dot', 'dotx', 'rtf', 'odt'].includes(ext)) return 'word';
  if (['xls', 'xlsx', 'xlsm', 'xlsb', 'csv', 'ods'].includes(ext)) return 'excel';
  if (ext === 'pdf') return 'pdf';
  if (['vsd', 'vsdx', 'vsdm', 'vdx'].includes(ext)) return 'visio';
  return 'otro';
}

/** Versión siguiente: A0 → A1, A9 → A10, B → B1. */
export function nextVersion(v: string): string {
  const m = /^(.*?)(\d+)$/.exec(v.trim());
  if (!m) return `${v.trim() || 'A'}${v.trim() ? '1' : '0'}`;
  return `${m[1]}${Number(m[2]) + 1}`;
}

/** Orden de versiones: por letra y luego por número (A2 < A10 < B0). */
export const compareVersions = (a: string, b: string) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' });

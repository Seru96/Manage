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

/** Persona del equipo a la que se asignan tareas. */
export interface Person { id: string; name: string; color: string }

export interface Task {
  id: string;
  subdivisionId: string | null;
  name: string;
  description: string;
  criticality: Criticality;
  status: TaskStatus;
  assigneeId: string | null;
  /** Inicio (si falta, la tarea dura solo el día límite). */
  start: DateStr | null;
  /** Fecha límite. */
  due: DateStr | null;
  createdAt: number;
}

/** Anotación por subdivisión: feedback del cliente o del Project Manager. */
export interface Note {
  id: string;
  /** Si se convirtió en tarea. */
  taskId?: string | null;
  subdivisionId: string | null;
  source: 'cliente' | 'pm' | 'interna';
  author: string;
  body: string;
  createdAt: number;
}

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

/** Columna de la tabla de accesos. Las de serie (nombre, apellidos, DNI, matrícula) tienen
 * ids fijos para que dos personas que abren la vista a la vez no las dupliquen. */
export interface AccessColumn { id: string; label: string; order: number }

export const DEFAULT_ACCESS_COLUMNS: AccessColumn[] = [
  { id: 'nombre', label: 'Nombre', order: 0 },
  { id: 'apellidos', label: 'Apellidos', order: 1 },
  { id: 'dni', label: 'DNI', order: 2 },
  { id: 'matricula', label: 'Matrícula', order: 3 },
];

/** Persona con acceso a sitios (personal propio o de subcontratas). */
export interface AccessPerson {
  id: string;
  /** Valor de cada columna, por id de columna. */
  values: Record<string, string>;
  /** Subdivisiones (sitios) a las que tiene acceso. */
  siteIds: string[];
}

export interface EntityTypes {
  subdivision: Subdivision;
  person: Person;
  task: Task;
  note: Note;
  reminder: Reminder;
  accessColumn: AccessColumn;
  accessPerson: AccessPerson;
}
export type Kind = keyof EntityTypes;
export const KINDS: Kind[] = ['subdivision', 'person', 'task', 'note', 'reminder', 'accessColumn', 'accessPerson'];

export type Entities = { [K in Kind]: Record<string, EntityTypes[K]> };
export const emptyEntities = (): Entities =>
  ({ subdivision: {}, person: {}, task: {}, note: {}, reminder: {}, accessColumn: {}, accessPerson: {} });

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

export const NOTE_SOURCE: Record<Note['source'], string> = { cliente: 'Cliente', pm: 'Project Manager', interna: 'Interna' };
export const REMINDER_KIND: Record<Reminder['kind'], string> = { prueba: 'Prueba con cliente', hito: 'Hito', otro: 'Otro' };

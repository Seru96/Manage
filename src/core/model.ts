/**
 * Modelo de datos. Cada entidad se guarda como una fila JSON en el `.manage`
 * (`kind` + `id`), así que añadir un campo no necesita migraciones.
 */
export type Criticality = 'baja' | 'media' | 'alta' | 'critica';
export type TaskStatus = 'pendiente' | 'en_curso' | 'bloqueada' | 'hecha';
/** Fecha de calendario sin hora: «2026-11-03». */
export type DateStr = string;

/** Subdivisión del proyecto (un sitio, una planta, una fase…). */
export interface Subdivision { id: string; name: string; color: string; order: number }

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

/** Columna personalizable de la tabla de accesos. */
export interface AccessColumn { id: string; label: string; order: number }

/** Persona con acceso a sitios (personal propio o de subcontratas). */
export interface AccessPerson {
  id: string;
  firstName: string;
  lastName: string;
  dni: string;
  plate: string;
  /** Valores de las columnas personalizadas, por id de columna. */
  extra: Record<string, string>;
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
  pendiente: 'Pendiente',
  en_curso: 'En curso',
  bloqueada: 'Bloqueada',
  hecha: 'Hecha',
};

/** Colores de subdivisiones y personas (los del sistema de Apple, legibles en claro y oscuro). */
export const PALETTE = ['#0a84ff', '#30d158', '#ff9f0a', '#bf5af2', '#ff375f', '#64d2ff', '#ffd60a', '#ac8e68', '#5e5ce6', '#ff6961'];

export const newId = () => crypto.randomUUID();

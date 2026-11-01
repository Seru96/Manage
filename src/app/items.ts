/** Acciones sobre tareas y recordatorios que se usan desde todas las vistas. */
import { newId, type Task } from '../core/model';
import { backend } from '../platform/backend';
import { patch, remove, upsert, useProject } from '../store/project';
import { toast } from '../store/view';

export async function deleteTask(id: string) {
  const t = useProject.getState().entities.task[id];
  if (!t || !(await backend.ask(`¿Borrar la tarea «${t.name}»?`))) return false;
  remove('task', id);
  // Los recordatorios que colgaban de ella pasan a ser recordatorios sueltos.
  for (const r of Object.values(useProject.getState().entities.reminder)) if (r.taskId === id) patch('reminder', r.id, { taskId: null });
  return true;
}

export async function deleteReminder(id: string) {
  const r = useProject.getState().entities.reminder[id];
  if (!r || !(await backend.ask(`¿Borrar el recordatorio «${r.title}»?`))) return false;
  remove('reminder', id);
  return true;
}

export function duplicateTask(id: string) {
  const t = useProject.getState().entities.task[id];
  if (!t) return;
  const copy: Task = { ...t, id: newId(), name: `${t.name} (copia)`, createdAt: Date.now() };
  upsert('task', copy);
  toast('Tarea duplicada');
}

export function moveItem(kind: 'task' | 'reminder', id: string, subdivisionId: string | null) {
  if (kind === 'task') patch('task', id, { subdivisionId });
  else patch('reminder', id, { subdivisionId });
}

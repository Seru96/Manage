import { newId, PALETTE } from '../core/model';
import { backend } from '../platform/backend';
import { flush, loadProject, syncNow, unloadProject, upsert, useProject } from '../store/project';
import { toast, useView } from '../store/view';

const stem = (path: string) => path.replace(/^.*[\\/]/, '').replace(/\.manage$/i, '');

/** Nuevo proyecto: se elige dónde guardarlo (idealmente, la carpeta de Teams sincronizada). */
export async function createProject(opts: { suggestedName?: string; empty?: boolean } = {}): Promise<boolean> {
  const path = await backend.pickSavePath(opts.suggestedName ?? 'Proyecto nuevo');
  if (!path) return false;
  await closeProject(false);
  const name = stem(path);
  const snap = await backend.create(path, newId(), name);
  loadProject(path, snap, await backend.whoami());
  // Una subdivisión para empezar, para que la vista de tareas no esté vacía.
  if (!opts.empty) upsert('subdivision', { id: newId(), name: 'General', color: PALETTE[0]!, order: 0, general: true });
  useView.setState({ screen: 'workspace', view: 'tasks' });
  return true;
}

export async function openProject(path?: string): Promise<boolean> {
  const target = path ?? (await backend.pickOpenPath());
  if (!target) return false;
  if (useProject.getState().path === target) {
    useView.setState({ screen: 'workspace' });
    return true;
  }
  await closeProject(false);
  const snap = await backend.open(target);
  loadProject(target, snap, await backend.whoami());
  useView.setState({ screen: 'workspace' });
  return true;
}

export async function closeProject(toStart = true) {
  const path = useProject.getState().path;
  if (path) {
    await flush();
    try { await backend.close(path); } catch (e) { toast(`Cambios guardados en local; se publicarán al volver a abrir (${e})`); }
    unloadProject();
  }
  if (toStart) useView.setState({ screen: 'start' });
}

export const showStart = () => useView.setState({ screen: 'start' });

export async function syncCommand() {
  await syncNow();
  const { sync, syncError } = useProject.getState();
  toast(sync === 'offline' ? `Sin conexión con la copia compartida: ${syncError}` : 'Sincronizado');
}

/**
 * Proyecto abierto. El frontend es la fuente de verdad mientras está abierto; cada cambio
 * se guarda al momento en la copia de trabajo local (Rust) y se publica en la copia
 * compartida en segundo plano.
 */
import { create } from 'zustand';
import { backend, type Change, type Snapshot } from '../platform/backend';
import { emptyEntities, KINDS, type Entities, type EntityTypes, type Kind } from '../core/model';

export type SyncState = 'synced' | 'pending' | 'syncing' | 'offline';

interface ProjectState {
  path: string | null;
  name: string;
  user: string;
  entities: Entities;
  sync: SyncState;
  syncError: string | null;
  lastSync: number | null;
}

export const useProject = create<ProjectState>(() => ({
  path: null, name: '', user: '', entities: emptyEntities(), sync: 'synced', syncError: null, lastSync: null,
}));

export function entitiesFrom(snap: Snapshot): Entities {
  const e = emptyEntities();
  for (const r of snap.rows) {
    if (!KINDS.includes(r.kind as Kind)) continue; // tipos de versiones más nuevas: se respetan sin tocarlos
    try { (e[r.kind as Kind] as Record<string, unknown>)[r.id] = JSON.parse(r.json); } catch { /* fila dañada: se ignora */ }
  }
  return e;
}

export function loadProject(path: string, snap: Snapshot, user: string) {
  useProject.setState({ path, name: snap.name, user, entities: entitiesFrom(snap), sync: 'synced', syncError: null, lastSync: Date.now() });
  startAutoSync();
}

export function unloadProject() {
  stopAutoSync();
  useProject.setState({ path: null, name: '', entities: emptyEntities() });
}

// ---------- Escrituras ----------

let queue: Change[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;

function enqueue(c: Change) {
  queue = queue.filter((q) => !(q.kind === c.kind && q.id === c.id));
  queue.push(c);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => void flush(), 250);
  useProject.setState({ sync: 'pending' });
  scheduleSync(4_000);
}

/** Escribe lo pendiente en la copia de trabajo (local, rápido). */
export async function flush() {
  clearTimeout(flushTimer);
  const path = useProject.getState().path;
  if (!path || !queue.length) return;
  const batch = queue;
  queue = [];
  try {
    await backend.apply(path, batch);
  } catch (e) {
    queue = [...batch, ...queue];
    useProject.setState({ syncError: `No se pudo guardar: ${e}` });
  }
}

export function upsert<K extends Kind>(kind: K, item: EntityTypes[K]) {
  useProject.setState((s) => ({ entities: { ...s.entities, [kind]: { ...s.entities[kind], [item.id]: item } } }));
  enqueue({ kind, id: item.id, json: JSON.stringify(item) });
}

export function patch<K extends Kind>(kind: K, id: string, changes: Partial<EntityTypes[K]>) {
  const cur = useProject.getState().entities[kind][id];
  if (cur) upsert(kind, { ...cur, ...changes });
}

export function remove(kind: Kind, id: string) {
  useProject.setState((s) => {
    const next = { ...s.entities[kind] };
    delete next[id];
    return { entities: { ...s.entities, [kind]: next } };
  });
  enqueue({ kind, id, json: null });
}

export async function renameProject(name: string) {
  const path = useProject.getState().path;
  if (!path || !name.trim()) return;
  useProject.setState({ name: name.trim() });
  await backend.rename(path, name.trim());
  scheduleSync(1_000);
}

// ---------- Sincronización con la copia compartida ----------

let syncTimer: ReturnType<typeof setTimeout> | undefined;
let interval: ReturnType<typeof setInterval> | undefined;
let running: Promise<void> | null = null;

function scheduleSync(ms: number) {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => void syncNow(), ms);
}

/** Trae lo de los demás y publica lo propio. */
export function syncNow(): Promise<void> {
  if (running) return running;
  running = (async () => {
    const path = useProject.getState().path;
    if (!path) return;
    await flush();
    useProject.setState({ sync: 'syncing' });
    try {
      const r = await backend.sync(path);
      if (r.snapshot && useProject.getState().path === path) {
        // Lo que aún no se ha escrito (cola) gana a lo que llega.
        const incoming = entitiesFrom(r.snapshot);
        for (const c of queue) {
          const k = c.kind as Kind;
          if (c.json === null) delete incoming[k][c.id];
          else (incoming[k] as Record<string, unknown>)[c.id] = JSON.parse(c.json);
        }
        useProject.setState({ entities: incoming, name: r.snapshot.name });
      }
      useProject.setState({ sync: r.pending || queue.length ? 'pending' : 'synced', syncError: null, lastSync: Date.now() });
    } catch (e) {
      useProject.setState({ sync: 'offline', syncError: String(e) });
    }
  })().finally(() => { running = null; });
  return running;
}

const onFocus = () => scheduleSync(300);

function startAutoSync() {
  stopAutoSync();
  interval = setInterval(() => void syncNow(), 60_000);
  window.addEventListener('focus', onFocus);
}

function stopAutoSync() {
  clearInterval(interval);
  clearTimeout(syncTimer);
  window.removeEventListener('focus', onFocus);
}

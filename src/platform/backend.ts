/**
 * Contrato IPC con Rust (refleja `src-tauri/src/commands.rs` y `manage-storage`).
 * En el navegador (desarrollo y pruebas) se usa un backend en localStorage.
 */
export interface Row { kind: string; id: string; json: string; updatedAt: number; updatedBy: string }
export interface Snapshot { projectId: string; name: string; revision: number; rows: Row[] }
export interface Change { kind: string; id: string; json: string | null }
export interface SyncResult { pulled: number; published: boolean; conflictCopies: string[]; snapshot: Snapshot | null; pending: boolean }
export interface RecentProject { path: string; name: string; openedAt: number; modifiedAt?: number | null }

export interface Backend {
  readonly kind: 'tauri' | 'browser';
  whoami(): Promise<string>;
  pickSavePath(suggestedName: string): Promise<string | null>;
  pickOpenPath(): Promise<string | null>;
  create(path: string, projectId: string, name: string): Promise<Snapshot>;
  open(path: string): Promise<Snapshot>;
  apply(path: string, changes: Change[]): Promise<number>;
  rename(path: string, name: string): Promise<void>;
  sync(path: string): Promise<SyncResult>;
  close(path: string): Promise<void>;
  recentList(): Promise<RecentProject[]>;
  recentForget(path: string): Promise<void>;
  notify(title: string, body: string): Promise<void>;
  /** Pregunta de sí/no con el diálogo nativo. */
  ask(message: string): Promise<boolean>;
  onMenu(handler: (id: string) => void): void;
}

export const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const FILTER = [{ name: 'Proyecto IMPLANTA Manage', extensions: ['manage'] }];

function tauriBackend(): Backend {
  const core = import('@tauri-apps/api/core');
  const call = async <T>(cmd: string, args?: Record<string, unknown>) => (await core).invoke<T>(cmd, args);
  return {
    kind: 'tauri',
    whoami: () => call('whoami'),
    async pickSavePath(name) {
      const { save } = await import('@tauri-apps/plugin-dialog');
      return save({ defaultPath: `${name}.manage`, filters: FILTER, title: 'Nuevo proyecto (elige la carpeta de SharePoint/Teams sincronizada)' });
    },
    async pickOpenPath() {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const r = await open({ multiple: false, filters: FILTER, title: 'Abrir proyecto' });
      return typeof r === 'string' ? r : null;
    },
    create: (path, projectId, name) => call('project_create', { path, projectId, name }),
    open: (path) => call('project_open', { path }),
    apply: (path, changes) => call('project_apply', { path, changes }),
    rename: (path, name) => call('project_rename', { path, name }),
    sync: (path) => call('project_sync', { path }),
    close: (path) => call('project_close', { path }),
    recentList: () => call('recent_list'),
    recentForget: (path) => call('recent_forget', { path }),
    async notify(title, body) {
      const n = await import('@tauri-apps/plugin-notification');
      let ok = await n.isPermissionGranted();
      if (!ok) ok = (await n.requestPermission()) === 'granted';
      if (ok) n.sendNotification({ title, body });
    },
    async ask(message) {
      const { ask } = await import('@tauri-apps/plugin-dialog');
      return ask(message, { title: 'IMPLANTA Manage', kind: 'warning', okLabel: 'Sí', cancelLabel: 'Cancelar' });
    },
    onMenu(handler) {
      void import('@tauri-apps/api/event').then(({ listen }) => listen<string>('menu', (e) => handler(e.payload)));
    },
  };
}

/** Backend del navegador: cada «fichero» es una entrada de localStorage. */
function browserBackend(): Backend {
  const KEY = 'manage:file:';
  type File = { projectId: string; name: string; revision: number; rows: Row[] };
  const read = (path: string): File | null => JSON.parse(localStorage.getItem(KEY + path) ?? 'null');
  const write = (path: string, f: File) => localStorage.setItem(KEY + path, JSON.stringify(f));
  const recents = (): RecentProject[] => JSON.parse(localStorage.getItem('manage:recents') ?? '[]');
  const touch = (path: string, name: string) =>
    localStorage.setItem('manage:recents', JSON.stringify([{ path, name, openedAt: Date.now() }, ...recents().filter((r) => r.path !== path)]));
  const snap = (f: File): Snapshot => ({ ...f, rows: f.rows.filter((r) => r.json !== null) });
  return {
    kind: 'browser',
    whoami: async () => 'usuario',
    pickSavePath: async (name) => { const n = prompt('Nombre del proyecto', name); return n ? `Navegador/${n}.manage` : null; },
    pickOpenPath: async () => recents()[0]?.path ?? null,
    async create(path, projectId, name) { const f = { projectId, name, revision: 1, rows: [] }; write(path, f); touch(path, name); return snap(f); },
    async open(path) { const f = read(path); if (!f) throw new Error(`no existe ${path}`); touch(path, f.name); return snap(f); },
    async apply(path, changes) {
      const f = read(path)!;
      const now = Date.now();
      for (const c of changes) {
        f.rows = f.rows.filter((r) => !(r.kind === c.kind && r.id === c.id));
        f.rows.push({ kind: c.kind, id: c.id, json: c.json as string, updatedAt: now, updatedBy: 'usuario' });
      }
      write(path, f);
      return changes.length;
    },
    async rename(path, name) { const f = read(path)!; f.name = name; write(path, f); touch(path, name); },
    sync: async () => ({ pulled: 0, published: true, conflictCopies: [], snapshot: null, pending: false }),
    close: async () => {},
    recentList: async () => recents().filter((r) => read(r.path)),
    recentForget: async (path) => localStorage.setItem('manage:recents', JSON.stringify(recents().filter((r) => r.path !== path))),
    async notify(title, body) { if ('Notification' in window && (await Notification.requestPermission()) === 'granted') new Notification(title, { body }); },
    ask: async (message) => confirm(message),
    onMenu: () => {},
  };
}

export const backend: Backend = isTauri() ? tauriBackend() : browserBackend();

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
  /** Pide dónde guardar y guarda un .xlsx. Devuelve false si se cancela. */
  saveXlsx(suggestedName: string, data: Uint8Array): Promise<boolean>;
  /** Pide un .xlsx y lo lee. */
  pickXlsx(): Promise<{ name: string; bytes: Uint8Array } | null>;
  /** Elige un fichero cualquiera (para enlazarlo a un documento). Devuelve su ruta. */
  pickFile(title: string, extensions?: string[]): Promise<string | null>;
  /** Abre un enlace (web o fichero; relativo a la carpeta del proyecto) con la app del sistema. */
  openLink(projectPath: string, target: string): Promise<void>;
}

export const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const XLSX = [{ name: 'Libro de Excel', extensions: ['xlsx'] }];
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
    async saveXlsx(name, data) {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const path = await save({ defaultPath: `${name}.xlsx`, filters: XLSX, title: 'Exportar a Excel' });
      if (!path) return false;
      await call('export_xlsx', { path, data: Array.from(data) });
      return true;
    },
    async pickXlsx() {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const path = await open({ multiple: false, filters: XLSX, title: 'Importar desde Excel' });
      if (typeof path !== 'string') return null;
      const buf = await call<ArrayBuffer>('import_xlsx', { path });
      return { name: path.split(/[\\/]/).pop() ?? path, bytes: new Uint8Array(buf) };
    },
    async pickFile(title, extensions) {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const r = await open({ multiple: false, title, filters: extensions ? [{ name: 'Documento', extensions }] : undefined });
      return typeof r === 'string' ? r : null;
    },
    openLink: (project, target) => call('open_link', { project, target }),
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
    async saveXlsx(name, data) {
      const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: `${name}.xlsx` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return true;
    },
    pickXlsx: () => new Promise((resolve) => {
      const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.xlsx' });
      input.dataset.xlsxPicker = '';
      input.style.display = 'none';
      input.onchange = async () => {
        const f = input.files?.[0];
        input.remove();
        resolve(f ? { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) } : null);
      };
      input.oncancel = () => { input.remove(); resolve(null); };
      document.body.append(input);
      input.click();
    }),
    pickFile: async () => null,
    async openLink(_project, target) {
      if (/^https?:\/\//i.test(target)) window.open(target, '_blank', 'noopener');
      else throw new Error('En el navegador solo se abren enlaces web; los ficheros se abren desde la app');
    },
  };
}

export const backend: Backend = isTauri() ? tauriBackend() : browserBackend();

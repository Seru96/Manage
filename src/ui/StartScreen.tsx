import { useCallback, useEffect, useMemo, useState } from 'react';
import { newProjectFromExcel } from '../app/excel';
import { createProject, openProject } from '../app/session';
import { backend, type RecentProject } from '../platform/backend';
import { useProject } from '../store/project';
import { openOptions } from '../store/theme';
import { useView } from '../store/view';
import { Icon, type IconName } from './icons';

declare const __APP_VERSION__: string;

const fmtDate = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
const startOfDay = (ms: number) => new Date(ms).setHours(0, 0, 0, 0);
function relative(ms: number): string {
  const days = Math.floor((startOfDay(Date.now()) - startOfDay(ms)) / 86_400_000);
  const time = new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  if (days <= 0) return `Hoy, ${time}`;
  if (days === 1) return `Ayer, ${time}`;
  return fmtDate.format(ms);
}
/** Ruta con ~ y sin el nombre del fichero, como Finder o el Explorador. */
const folderOf = (path: string) =>
  path.replace(/[\\/][^\\/]*$/, '').replace(/^\/Users\/[^/]+/, '~').replace(/^[A-Z]:\\Users\\[^\\]+/i, '~');

function greeting() {
  const h = new Date().getHours();
  return h < 6 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
}

/**
 * Pantalla de inicio, igual que la de IMPLANTA Install: barra lateral con Inicio, Nuevo
 * y Abrir, y a la derecha cómo empezar y los proyectos recientes.
 */
export function StartScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openPath = useProject((s) => s.path);

  const act = async (fn: () => Promise<boolean>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(String(e)); } finally { setBusy(false); }
  };
  const create = () => act(() => createProject());
  const fromExcel = () => act(async () => { await newProjectFromExcel(); return true; });
  const open = (path?: string) => act(() => openProject(path));

  const nav = (id: string, icon: IconName, label: string, onClick: () => void, on = false, hint?: string) => (
    <button className={`start-nav-item${on ? ' on' : ''}`} data-nav={id} onClick={onClick} disabled={busy && !on} title={hint}>
      <Icon name={icon} /><span>{label}</span>
    </button>
  );

  return (
    <div className="start">
      <aside className="start-side">
        <div className="start-drag" data-tauri-drag-region />
        <div className="start-brand">
          <img src="/app-icon.png" alt="" width={28} height={28} />
          <span className="start-brand-name"><small>IMPLANTA</small>Manage</span>
        </div>
        <nav className="start-nav" aria-label="Inicio">
          {nav('home', 'home', 'Inicio', () => {}, true)}
          {nav('new', 'newDoc', 'Nuevo', () => void create(), false, 'Proyecto nuevo (⇧⌘N)')}
          {nav('open', 'folder', 'Abrir', () => void open(), false, 'Abrir un .manage (⌘O)')}
          {openPath && nav('back', 'tasks', 'Volver al proyecto', () => useView.setState({ screen: 'workspace' }))}
        </nav>
        <div className="start-foot">
          <button className="start-nav-item start-options" data-action="options" onClick={openOptions} title="Opciones (⌘,)">
            <Icon name="gear" /><span>Opciones</span>
          </button>
          <span className="start-version">Versión {__APP_VERSION__}</span>
        </div>
      </aside>

      <main className="start-main">
        <div className="start-drag" data-tauri-drag-region />
        {error && <p className="start-error">No se pudo abrir: {error}</p>}
        <Home busy={busy} create={create} open={open} fromExcel={fromExcel} />
      </main>
    </div>
  );
}

function Home({ busy, create, open, fromExcel }: { busy: boolean; create: () => void; open: (path?: string) => void; fromExcel: () => void }) {
  const [recents, setRecents] = useState<RecentProject[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const reload = useCallback(() => { backend.recentList().then(setRecents, () => setRecents([])); }, []);
  useEffect(reload, [reload]);
  const forget = async (path: string) => { await backend.recentForget(path); reload(); };

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (recents ?? []).filter((r) => !q || r.name.toLowerCase().includes(q) || r.path.toLowerCase().includes(q));
  }, [recents, query]);

  return (
    <>
      <h1 className="start-title">{greeting()}</h1>

      <section className="start-section" aria-labelledby="start-new">
        <h2 id="start-new">Nuevo</h2>
        <div className="start-templates">
          <button className="template" data-start="blank" disabled={busy} onClick={create}>
            <span className="thumb" aria-hidden><Icon name="plus" size={28} /></span>
            <span className="label">Proyecto en blanco</span>
          </button>
          <button className="template" data-start="open" disabled={busy} onClick={() => open()}>
            <span className="thumb" aria-hidden><Icon name="folder" size={28} /></span>
            <span className="label">Abrir…</span>
          </button>
          <button className="template" data-start="excel" disabled={busy} onClick={fromExcel} title="Crear un proyecto a partir de un Excel exportado desde Manage (o con el mismo formato)">
            <span className="thumb" aria-hidden><Icon name="excel" size={28} /></span>
            <span className="label">Desde Excel…</span>
          </button>
        </div>
        <p className="start-hint muted">
          Guarda el proyecto en la carpeta del canal de Teams (SharePoint) sincronizada con OneDrive: cada
          persona trabaja en su copia local y Manage la sincroniza con ese fichero.
        </p>
      </section>

      <section className="start-section" aria-labelledby="start-recents">
        <div className="start-head">
          <h2 id="start-recents">Recientes</h2>
          {!!recents?.length && (
            <label className="start-search">
              <Icon name="search" size={16} />
              <input type="search" placeholder="Buscar" value={query} aria-label="Buscar proyectos"
                onChange={(e) => { setQuery(e.target.value); setSelected(null); }} />
            </label>
          )}
        </div>
        {recents && recents.length === 0 && (
          <div className="start-empty">
            <p>Aún no hay proyectos recientes.</p>
            <p className="muted">Crea un proyecto o abre uno de la carpeta compartida del departamento.</p>
          </div>
        )}
        {!!recents?.length && (
          <div className="file-table" role="listbox" aria-label="Proyectos recientes">
            <div className="file-row head" aria-hidden><span>Nombre</span><span>Ubicación</span><span>Abierto</span><span /></div>
            {shown.map((r) => (
              <div key={r.path} role="option" aria-selected={selected === r.path} className={`file-row${selected === r.path ? ' on' : ''}`}
                onClick={() => setSelected(r.path)} onDoubleClick={() => open(r.path)} title={r.path}>
                <span className="name"><Icon name="tasks" size={18} /><strong>{r.name}</strong></span>
                <span className="muted">{folderOf(r.path)}</span>
                <span className="muted">{relative(r.openedAt)}</span>
                <button className="row-action" title="Quitar de recientes" onClick={(e) => { e.stopPropagation(); void forget(r.path); }}>
                  <Icon name="close" size={14} />
                </button>
              </div>
            ))}
            {!shown.length && <p className="file-none muted">Ningún proyecto coincide con «{query}».</p>}
          </div>
        )}
      </section>
    </>
  );
}

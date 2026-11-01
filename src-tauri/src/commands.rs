//! Superficie IPC. Los tipos se reflejan a mano en `src/platform/backend.ts`.

use std::path::PathBuf;

use manage_storage::sync::{SharedProject, SyncReport};
use manage_storage::{Change, Snapshot};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::{recents, OpenProjects};

type CmdResult<T> = Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

fn now_ms() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// Carpeta de las copias de trabajo (fuera de OneDrive, en los datos locales de la app).
fn work_dir(app: &AppHandle) -> CmdResult<PathBuf> {
    app.path().app_local_data_dir().map(|d| d.join("trabajo")).map_err(err)
}

/// Nombre con el que se firman los cambios (usuario del sistema).
#[tauri::command]
pub fn whoami() -> String {
    std::env::var("USERNAME").or_else(|_| std::env::var("USER")).unwrap_or_else(|_| "usuario".into())
}

#[tauri::command]
pub fn project_create(app: AppHandle, path: PathBuf, project_id: String, name: String, open: State<OpenProjects>) -> CmdResult<Snapshot> {
    let p = SharedProject::create(&path, &work_dir(&app)?, &project_id, &name, &whoami()).map_err(err)?;
    let snap = p.snapshot().map_err(err)?;
    recents::touch(&app, &path, &snap.name);
    open.0.lock().insert(path, p);
    Ok(snap)
}

#[tauri::command]
pub fn project_open(app: AppHandle, path: PathBuf, open: State<OpenProjects>) -> CmdResult<Snapshot> {
    let p = SharedProject::open(&path, &work_dir(&app)?, &whoami()).map_err(err)?;
    let snap = p.snapshot().map_err(err)?;
    recents::touch(&app, &path, &snap.name);
    open.0.lock().insert(path, p);
    Ok(snap)
}

#[tauri::command]
pub fn project_apply(path: PathBuf, changes: Vec<Change>, open: State<OpenProjects>) -> CmdResult<usize> {
    let mut map = open.0.lock();
    let p = map.get_mut(&path).ok_or("el proyecto no está abierto")?;
    p.apply(&changes, &whoami(), now_ms()).map_err(err)
}

#[tauri::command]
pub fn project_rename(app: AppHandle, path: PathBuf, name: String, open: State<OpenProjects>) -> CmdResult<()> {
    let mut map = open.0.lock();
    let p = map.get_mut(&path).ok_or("el proyecto no está abierto")?;
    p.rename(&name).map_err(err)?;
    recents::touch(&app, &path, &name);
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    #[serde(flatten)]
    report: SyncReport,
    /// Solo si llegó algo de otros: el estado completo para refrescar la interfaz.
    snapshot: Option<Snapshot>,
    pending: bool,
}

#[tauri::command]
pub fn project_sync(path: PathBuf, open: State<OpenProjects>) -> CmdResult<SyncResult> {
    let mut map = open.0.lock();
    let p = map.get_mut(&path).ok_or("el proyecto no está abierto")?;
    let report = p.sync(&whoami()).map_err(err)?;
    let snapshot = if report.pulled > 0 { Some(p.snapshot().map_err(err)?) } else { None };
    Ok(SyncResult { report, snapshot, pending: p.has_pending() })
}

/// Cierra publicando lo pendiente. Si no hay conexión, lo pendiente se queda en la copia
/// de trabajo y se publica la próxima vez que se abra.
#[tauri::command]
pub fn project_close(path: PathBuf, open: State<OpenProjects>) -> CmdResult<()> {
    if let Some(mut p) = open.0.lock().remove(&path) {
        p.sync(&whoami()).map_err(err)?;
    }
    Ok(())
}

#[tauri::command]
pub fn recent_list(app: AppHandle) -> Vec<recents::RecentEntry> {
    recents::list(&app)
}

#[tauri::command]
pub fn recent_forget(app: AppHandle, path: PathBuf) {
    recents::forget(&app, &path);
}

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

const XLSX_MAX: usize = 64 * 1024 * 1024;

fn xlsx_path(path: &std::path::Path) -> CmdResult<()> {
    match path.extension().and_then(|e| e.to_str()).map(str::to_ascii_lowercase).as_deref() {
        Some("xlsx") => Ok(()),
        _ => Err("El archivo debe ser .xlsx".into()),
    }
}

/// Guarda un libro de Excel ya generado en el frontend (temporal + renombrado).
#[tauri::command]
pub fn export_xlsx(path: PathBuf, data: Vec<u8>) -> CmdResult<()> {
    xlsx_path(&path)?;
    if data.len() > XLSX_MAX {
        return Err("El libro es demasiado grande".into());
    }
    let tmp = path.with_extension("xlsx.tmp");
    std::fs::write(&tmp, &data).map_err(err)?;
    std::fs::rename(&tmp, &path).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        err(e)
    })
}

/// Lee un libro de Excel elegido por el usuario para importarlo (se devuelve en binario).
#[tauri::command]
pub fn import_xlsx(path: PathBuf) -> CmdResult<tauri::ipc::Response> {
    xlsx_path(&path)?;
    let len = std::fs::metadata(&path).map_err(err)?.len() as usize;
    if len > XLSX_MAX {
        return Err("El libro es demasiado grande".into());
    }
    std::fs::read(&path).map(tauri::ipc::Response::new).map_err(err)
}

/// Extensiones que nunca se abren desde un enlace del proyecto (el fichero es compartido:
/// un enlace no debe poder lanzar programas).
const BLOCKED: &[&str] = &[
    "exe", "msi", "bat", "cmd", "com", "scr", "ps1", "psm1", "vbs", "vbe", "js", "jse", "wsf", "wsh", "hta", "lnk", "reg",
    "cpl", "jar", "sh", "command", "app", "pkg", "dmg", "url", "appref-ms", "msc",
];

/// Abre un enlace de un documento con la aplicación del sistema: una web (http/https) o un
/// fichero. Las rutas relativas lo son a la carpeta del proyecto, que en cada equipo está en
/// un sitio distinto (la carpeta de OneDrive de cada usuario).
#[tauri::command]
pub fn open_link(project: PathBuf, target: String) -> CmdResult<()> {
    let t = target.trim();
    let lower = t.to_ascii_lowercase();
    let what: std::ffi::OsString = if lower.starts_with("https://") || lower.starts_with("http://") {
        t.into()
    } else {
        if lower.contains("://") {
            return Err("Solo se abren enlaces web (http/https) o ficheros".into());
        }
        let p = PathBuf::from(t.replace(['/', '\\'], std::path::MAIN_SEPARATOR_STR));
        let full = if p.is_absolute() { p } else { project.parent().map(|d| d.join(&p)).unwrap_or(p) };
        let ext = full.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
        if BLOCKED.contains(&ext.as_str()) {
            return Err(format!("Por seguridad no se abren ficheros .{ext} desde un enlace"));
        }
        if !full.exists() {
            return Err(format!("No se encuentra {}", full.display()));
        }
        full.into_os_string()
    };
    #[cfg(target_os = "macos")]
    let mut cmd = std::process::Command::new("open");
    #[cfg(target_os = "windows")]
    let mut cmd = std::process::Command::new("explorer");
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let mut cmd = std::process::Command::new("xdg-open");
    cmd.arg(what).spawn().map(|_| ()).map_err(err)
}

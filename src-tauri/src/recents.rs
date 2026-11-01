//! Proyectos recientes de la pantalla de inicio. Se guardan en
//! `recientes.json` en la carpeta de configuración de la app.

use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

const MAX: usize = 20;

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RecentEntry {
    pub path: PathBuf,
    pub name: String,
    /// Último acceso desde Manage (ms desde 1970).
    pub opened_at: u64,
    /// Última modificación del fichero; solo se rellena al listar.
    #[serde(default)]
    pub modified_at: Option<u64>,
}

fn store<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("recientes.json"))
}

fn load<R: Runtime>(app: &AppHandle<R>) -> Vec<RecentEntry> {
    store(app)
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

fn write<R: Runtime>(app: &AppHandle<R>, list: &[RecentEntry]) {
    let Some(p) = store(app) else { return };
    if let Some(dir) = p.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if let Ok(json) = serde_json::to_vec_pretty(list) {
        let _ = std::fs::write(p, json);
    }
}

fn millis(t: std::time::SystemTime) -> u64 {
    t.duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Pone el proyecto el primero de la lista.
pub fn touch<R: Runtime>(app: &AppHandle<R>, path: &Path, name: &str) {
    let mut list = load(app);
    list.retain(|e| e.path != path);
    list.insert(
        0,
        RecentEntry {
            path: path.to_path_buf(),
            name: name.to_string(),
            opened_at: millis(std::time::SystemTime::now()),
            modified_at: None,
        },
    );
    list.truncate(MAX);
    write(app, &list);
}

/// Recientes que siguen existiendo en disco, con su fecha de modificación.
pub fn list<R: Runtime>(app: &AppHandle<R>) -> Vec<RecentEntry> {
    load(app)
        .into_iter()
        .filter_map(|mut e| {
            let meta = std::fs::metadata(&e.path).ok()?;
            e.modified_at = meta.modified().ok().map(millis);
            Some(e)
        })
        .collect()
}

pub fn forget<R: Runtime>(app: &AppHandle<R>, path: &Path) {
    let mut list = load(app);
    list.retain(|e| e.path != path);
    write(app, &list);
}

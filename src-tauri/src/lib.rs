mod commands;
mod menu;
mod recents;

use std::collections::HashMap;
use std::path::PathBuf;

use manage_storage::sync::SharedProject;
use parking_lot::Mutex;

/// Proyectos abiertos, por ruta del fichero compartido. Rust es el dueño del disco;
/// el estado de la interfaz vive en el frontend.
#[derive(Default)]
pub struct OpenProjects(pub Mutex<HashMap<PathBuf, SharedProject>>);

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .manage(OpenProjects::default())
        .menu(|app| menu::build(app))
        .on_menu_event(|app, event| menu::forward(app, event.id().as_ref()))
        .invoke_handler(tauri::generate_handler![
            commands::project_create,
            commands::project_open,
            commands::project_apply,
            commands::project_rename,
            commands::project_sync,
            commands::project_close,
            commands::recent_list,
            commands::recent_forget,
            commands::whoami,
            commands::export_xlsx,
            commands::import_xlsx,
        ])
        .run(tauri::generate_context!())
        .expect("error al arrancar la app");
}

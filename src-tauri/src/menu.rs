//! Barra de menús nativa (la del Mac arriba de la pantalla y, en Windows, la de la
//! ventana), como en IMPLANTA Install. Cada acción propia se reenvía al frontend como
//! evento `menu` con su id; las de edición de texto son las del sistema.

use tauri::menu::{AboutMetadata, Menu, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Runtime};

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let item = |id: &str, text: &str, accel: Option<&str>| {
        let b = MenuItemBuilder::with_id(id, text);
        match accel {
            Some(a) => b.accelerator(a).build(app),
            None => b.build(app),
        }
    };

    #[cfg(target_os = "macos")]
    let app_menu = SubmenuBuilder::new(app, "IMPLANTA Manage")
        .item(&PredefinedMenuItem::about(app, Some("Acerca de IMPLANTA Manage"), Some(AboutMetadata::default()))?)
        .separator()
        .item(&item("app.options", "Ajustes…", Some("CmdOrCtrl+,"))?)
        .separator()
        .item(&PredefinedMenuItem::services(app, None)?)
        .separator()
        .item(&PredefinedMenuItem::hide(app, Some("Ocultar IMPLANTA Manage"))?)
        .item(&PredefinedMenuItem::hide_others(app, Some("Ocultar otros"))?)
        .item(&PredefinedMenuItem::show_all(app, Some("Mostrar todo"))?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, Some("Salir de IMPLANTA Manage"))?)
        .build()?;

    let file = SubmenuBuilder::new(app, "Archivo")
        .item(&item("file.new", "Nuevo proyecto…", Some("CmdOrCtrl+Shift+N"))?)
        .item(&item("file.open", "Abrir…", Some("CmdOrCtrl+O"))?)
        .separator()
        .item(&item("file.sync", "Sincronizar ahora", Some("CmdOrCtrl+S"))?)
        .separator()
        .item(&item("file.importXlsx", "Importar desde Excel…", None)?)
        .item(&item("file.exportXlsx", "Exportar a Excel…", Some("CmdOrCtrl+E"))?)
        .separator()
        .item(&item("file.close", "Cerrar proyecto", Some("CmdOrCtrl+W"))?);
    #[cfg(not(target_os = "macos"))]
    let file = file
        .separator()
        .item(&item("app.options", "Opciones…", Some("CmdOrCtrl+,"))?)
        .separator()
        .item(&PredefinedMenuItem::quit(app, Some("Salir"))?);
    let file = file.build()?;

    let edit = SubmenuBuilder::new(app, "Edición")
        .item(&PredefinedMenuItem::undo(app, Some("Deshacer"))?)
        .item(&PredefinedMenuItem::redo(app, Some("Rehacer"))?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, Some("Cortar"))?)
        .item(&PredefinedMenuItem::copy(app, Some("Copiar"))?)
        .item(&PredefinedMenuItem::paste(app, Some("Pegar"))?)
        .item(&PredefinedMenuItem::select_all(app, Some("Seleccionar todo"))?)
        .separator()
        .item(&item("edit.newTask", "Nueva tarea", Some("CmdOrCtrl+N"))?)
        .item(&item("edit.find", "Buscar…", Some("CmdOrCtrl+F"))?)
        .build()?;

    let view = SubmenuBuilder::new(app, "Ver")
        .item(&item("view.tasks", "Tareas", Some("CmdOrCtrl+1"))?)
        .item(&item("view.calendar", "Calendario", Some("CmdOrCtrl+2"))?)
        .item(&item("view.notes", "Anotaciones", Some("CmdOrCtrl+3"))?)
        .item(&item("view.reminders", "Recordatorios", Some("CmdOrCtrl+4"))?)
        .item(&item("view.access", "Accesos a sitios", Some("CmdOrCtrl+5"))?);
    #[cfg(target_os = "macos")]
    let view = view.separator().item(&PredefinedMenuItem::fullscreen(app, Some("Pantalla completa"))?);
    let view = view.build()?;

    let window = SubmenuBuilder::new(app, "Ventana")
        .item(&PredefinedMenuItem::minimize(app, Some("Minimizar"))?)
        .item(&PredefinedMenuItem::maximize(app, Some(if cfg!(target_os = "macos") { "Zoom" } else { "Maximizar" }))?)
        .separator()
        .item(&item("window.start", "Pantalla de inicio", Some("CmdOrCtrl+Shift+1"))?)
        .build()?;

    #[cfg(target_os = "macos")]
    return Menu::with_items(app, &[&app_menu, &file, &edit, &view, &window]);

    #[cfg(not(target_os = "macos"))]
    {
        let _ = AboutMetadata::default();
        let help = SubmenuBuilder::new(app, "Ayuda")
            .item(&PredefinedMenuItem::about(app, Some("Acerca de IMPLANTA Manage"), Some(AboutMetadata::default()))?)
            .build()?;
        Menu::with_items(app, &[&file, &edit, &view, &window, &help])
    }
}

pub fn forward<R: Runtime>(app: &AppHandle<R>, id: &str) {
    let _ = app.emit("menu", id);
}

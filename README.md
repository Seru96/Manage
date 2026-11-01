# IMPLANTA Manage

Seguimiento de tareas e incidencias por proyecto, para Windows 11 y macOS. Hermana de
IMPLANTA Install: mismo stack (Tauri 2 + Rust + React), misma interfaz.

Los datos no salen de la empresa: cada proyecto es un fichero `.manage` que se guarda en la
carpeta del canal de Teams (SharePoint) sincronizada con OneDrive. Cada persona trabaja en una
copia local y la app la sincroniza con ese fichero. Detalles en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Desarrollo

Requisitos: Node 20+, Rust estable y los [requisitos de Tauri](https://v2.tauri.app/start/prerequisites/).

```sh
npm install
npm run tauri dev        # app nativa
npm run dev              # solo la interfaz en el navegador (datos en localStorage)
npm test                 # pruebas del frontend
cargo test -p manage-storage   # pruebas del formato y la sincronización
npm run tauri build      # instalador (.dmg en macOS, .exe NSIS en Windows)
```

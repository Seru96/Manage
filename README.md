# IMPLANTA Manage

Seguimiento de tareas e incidencias por proyecto, para Windows 11 y macOS. Hermana de
IMPLANTA Install: mismo stack (Tauri 2 + Rust + React), misma interfaz.

Los datos no salen de la empresa: cada proyecto es un fichero `.manage` que se guarda en la
carpeta del canal de Teams (SharePoint) sincronizada con OneDrive. Cada persona trabaja en una
copia local y la app la sincroniza con ese fichero. Detalles en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md).

## Descargas / Releases

Cada vez que se fusiona algo en `main`, CI compila los instaladores y los publica en la release
[`dev`](https://github.com/Seru96/Manage/releases/tag/dev). La primera vez que compila una versión
nueva de `src-tauri/tauri.conf.json` crea además su release `vX.Y.Z` con las notas de
[CHANGELOG.md](CHANGELOG.md). El repositorio es privado: los enlaces funcionan con la sesión de GitHub iniciada.

| Versión | Fecha | Novedades | macOS | Windows 11 |
|---|---|---|---|---|
| **0.4.0** | 2026-11-03 | Arrastrar personal al calendario, jornadas de subcontratas como gasto de un pedido, filtros por empresa, persona, estado y criticidad, y arreglos en Subcontratas (sitio de cada jornada) y Equipo (casilla General). | [Descargar DMG V0.4.0](https://github.com/Seru96/Manage/releases/download/v0.4.0/IMPLANTA-Manage-0.4.0.dmg) | [Descargar EXE V0.4.0](https://github.com/Seru96/Manage/releases/download/v0.4.0/IMPLANTA-Manage-0.4.0-setup.exe) |
| **0.3.0** | 2026-11-01 | Gastos (pedidos, disponible, facturado / sin facturar), Documentación (planos con versiones y enlaces, facturas, certificaciones), Equipo con subcontratas, calendario de subcontratas y varias personas por tarea. | [Descargar DMG V0.3.0](https://github.com/Seru96/Manage/releases/download/v0.3.0/IMPLANTA-Manage-0.3.0.dmg) | [Descargar EXE V0.3.0](https://github.com/Seru96/Manage/releases/download/v0.3.0/IMPLANTA-Manage-0.3.0-setup.exe) |
| **0.2.0** | 2026-11-01 | Exportar e importar a Excel, temas claro/híbrido/oscuro, colores por estado, editar/mover/borrar desde cualquier vista, «General» abarca todo y recordatorios como elementos propios. | [Descargar DMG V0.2.0](https://github.com/Seru96/Manage/releases/download/v0.2.0/IMPLANTA-Manage-0.2.0.dmg) | [Descargar EXE V0.2.0](https://github.com/Seru96/Manage/releases/download/v0.2.0/IMPLANTA-Manage-0.2.0-setup.exe) |
| **0.1.0** | 2026-11-01 | Primera versión: proyectos en la carpeta de Teams, tareas por subdivisión, calendario, búsqueda, filtros y conflictos; anotaciones, recordatorios con aviso nativo y accesos a sitios. | [Descargar DMG V0.1.0](https://github.com/Seru96/Manage/releases/download/v0.1.0/IMPLANTA-Manage-0.1.0.dmg) | [Descargar EXE V0.1.0](https://github.com/Seru96/Manage/releases/download/v0.1.0/IMPLANTA-Manage-0.1.0-setup.exe) |

**macOS** (Apple Silicon): arrastra IMPLANTA Manage a Aplicaciones y, como aún no está notarizada,
ejecuta una vez `xattr -dr com.apple.quarantine "/Applications/IMPLANTA Manage.app"` (o ábrela desde
Ajustes del Sistema › Privacidad y seguridad › Abrir igualmente).

**Windows 10 y 11** (x64): el instalador no pide permisos de administrador y asocia los ficheros
`.manage`. Como aún no está firmado, SmartScreen avisa: pulsa «Más información» › «Ejecutar de todas formas».

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

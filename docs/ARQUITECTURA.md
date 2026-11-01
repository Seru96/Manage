# IMPLANTA Manage: arquitectura

Aplicación de escritorio para el seguimiento de tareas e incidencias por proyecto.
Mismo stack, misma estructura y mismo aspecto que IMPLANTA Install (RackMap), para que el
equipo la reconozca a la primera y para poder compartir código entre las dos.

## 1. Stack

| Capa | Tecnología | Por qué |
|---|---|---|
| Contenedor | **Tauri 2** | Usa el WebView del sistema (WebView2 en Windows 11, WKWebView en macOS): binario de pocos MB y ~40-80 MB de RAM, frente a los 200+ de Electron. Tauri 2 ya compila para iOS/iPadOS. |
| Backend | **Rust** | Dueño del disco: el fichero del proyecto, la sincronización y las notificaciones nativas. |
| Almacenamiento | **SQLite** (`rusqlite`, compilado dentro) | Un único fichero `.manage` por proyecto, sin servidor. |
| Frontend | **React 19 + Zustand + TypeScript + Vite** | Igual que IMPLANTA Install. Sin librerías de componentes ni de calendario: el calendario es propio (~200 líneas). |
| Pruebas | `cargo test` (almacenamiento y sincronización) y `vitest` (lógica del frontend) | |

## 2. Estructura del repositorio

```
Cargo.toml                    workspace de Rust (perfil release con LTO, como Install)
crates/manage-storage/        formato .manage y sincronización (sin dependencias de Tauri: se prueba solo)
  migrations/0001_init.sql
  src/lib.rs                  Store: abrir, aplicar cambios, fusionar, exportar
  src/sync.rs                 SharedProject: copia de trabajo ↔ copia compartida
src-tauri/                    la app nativa
  src/commands.rs             IPC (project_open, project_apply, project_sync…)
  src/menu.rs                 menús nativos (Archivo, Edición, Ver, Ventana) → evento `menu`
  src/recents.rs              recientes de la pantalla de inicio
  tauri.conf.json, capabilities/
src/
  core/        modelo, fechas, detección de conflictos (lógica pura, con pruebas)
  platform/    backend.ts: contrato IPC (y un backend en localStorage para el navegador)
  store/       estado (Zustand): proyecto abierto, vista y filtros, selectores
  app/         sesión (crear/abrir/cerrar/sincronizar) y menú
  ui/          pantalla de inicio, barra superior, panel lateral y vistas
```

## 3. Modelo de datos

Todas las entidades se guardan en una sola tabla como JSON:

```sql
entities(kind, id, json, updated_at, updated_by)   -- json NULL = borrado (lápida)
meta(key, value)                                    -- project_id, name, revision
```

Así añadir un campo o una columna personalizada no necesita migraciones, y la fusión entre
copias es genérica (ver §4). Tipos (`src/core/model.ts`):

| kind | Campos |
|---|---|
| `subdivision` | nombre, color, orden. Un sitio, una planta, una fase… |
| `person` | nombre, color. El equipo al que se asignan tareas |
| `task` | nombre, descripción, **criticidad** (baja/media/alta/crítica), estado, **asignado**, inicio (opcional), **fecha límite**, subdivisión |
| `note` | subdivisión, origen (cliente / PM / interna), autor, texto, fecha |
| `reminder` | título, fecha y hora, tipo (prueba / hito), subdivisión o tarea, hecho |
| `accessColumn` | columnas personalizadas de la tabla de accesos |
| `accessPerson` | nombre, apellidos, DNI, matrícula, valores de columnas propias y **sitios con acceso** (`siteIds`) |

Una tarea ocupa en el calendario del inicio a la fecha límite; si no tiene inicio, solo el día límite.

**Conflictos** (`src/core/conflicts.ts`): una persona con tareas no terminadas en **dos
subdivisiones distintas** cuyas fechas se solapan. Se avisa en la barra superior, en la tarea,
en el día del calendario y al editar.

## 4. Almacenamiento y sincronización con SharePoint/Teams

Requisito: nada en una base de datos en la nube; los datos en local y, si acaso, en la
biblioteca de SharePoint del canal de Teams del departamento.

**Decisión: el proyecto es un fichero `.manage` (SQLite) en la carpeta del canal de Teams,
sincronizada en cada equipo con OneDrive** («Sincronizar» o «Agregar acceso directo a Mis
archivos» en SharePoint). Nada sale del tenant de Microsoft 365 de la empresa y no hace falta
registrar una app en Azure ni pedir permisos de Graph a IT.

Nunca se trabaja directamente sobre el fichero compartido: OneDrive podría subirlo a medio
escribir o bloquearlo. En su lugar:

```
 Carpeta de Teams (OneDrive)                  Datos locales de la app
 ┌──────────────────────────┐   traer/fusionar  ┌──────────────────────────┐
 │ Obra Norte.manage        │ ───────────────▶ │ trabajo/<hash>.manage    │ ◀── cada cambio (al momento)
 │ (la versión publicada)   │ ◀─────────────── │ (copia de trabajo)       │
 └──────────────────────────┘   publicar        └──────────────────────────┘
        (temporal + renombrar)
```

1. **Cada cambio** se guarda al momento en la copia de trabajo local (rápido, funciona sin conexión).
2. **Sincronizar** (a los pocos segundos de un cambio, cada minuto, al volver a la ventana, con ⌘S y al cerrar):
   - **Traer**: si el compartido cambió (tamaño + fecha), se copia a un temporal y se fusiona **fila a fila**: gana la versión más reciente de cada tarea/nota/persona (`updated_at`, desempate por usuario). Los borrados viajan como lápidas.
   - **Publicar**: si hay cambios propios, la copia de trabajo se escribe entera en el compartido con `VACUUM INTO` a un temporal y un renombrado atómico. OneDrive sube un fichero siempre completo.
3. **Dos personas a la vez**: si dos equipos publican casi a la vez, OneDrive deja una de las versiones como `Obra Norte-PORTATIL-ANA.manage`. Manage detecta esas **copias de conflicto** y también las fusiona, así que no se pierde nada.
4. **Sin conexión**: lo pendiente queda en la copia de trabajo y se publica la próxima vez.

Lo que esto **no** es: edición en tiempo real. Dos personas editando a la vez ven los cambios
del otro en cuanto OneDrive sincroniza (normalmente segundos o pocos minutos). Para un equipo
de departamento con un proyecto cada uno o pocos a la vez es suficiente; si algún día no lo
fuera, el mismo modelo (filas con fecha y autor) sirve para sincronizar contra Microsoft Graph
sin cambiar el formato.

**Excel**: el formato de trabajo es SQLite porque Excel no aguanta bien escrituras
concurrentes ni fusiones por fila. Para compartir con quien no use la app, se exportará a
`.xlsx` (como la LCE de Install) en la fase 2.

## 5. Interfaz

Copiada de IMPLANTA Install: mismas variables de color (oscuro por defecto, claro según el
sistema), misma pantalla de inicio (barra lateral Inicio/Nuevo/Abrir, «Buenos días»,
plantillas y Recientes), misma barra superior con hueco para los semáforos de macOS y los
mismos menús nativos.

Flujo: **Inicio → elegir proyecto → espacio de trabajo** con:

- **Panel izquierdo**: vistas (⌘1…⌘5), subdivisiones y equipo. Clic en una subdivisión o persona filtra; doble clic renombra.
- **Barra superior**: proyecto y estado de sincronización, búsqueda global (⌘F), filtros por persona y subdivisión, ocultar hechas y el aviso de conflictos.
- **Tareas**: agrupadas por subdivisión, ordenables por fecha límite, criticidad o nombre; crear, editar, borrar y cambiar estado en línea.
- **Calendario**: mes de lunes a domingo, eventos de varios días en carriles (como Calendario de Apple). Arrastrar mueve, tirar de los bordes alarga o acorta (también entre semanas), doble clic en un día crea una tarea. Color por subdivisión o por persona.

## 6. Plan

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Esqueleto, formato `.manage`, sincronización, inicio, tareas, calendario, búsqueda, filtros y conflictos | este PR |
| 2 | Anotaciones por subdivisión; recordatorios con notificación nativa (`tauri-plugin-notification`, ya incluido); tabla de accesos con columnas propias y sitios | siguiente |
| 3 | Exportar/importar Excel, presencia («Ana tiene el proyecto abierto»), historial de cambios por tarea, firma y publicación de instaladores (como Install) | |
| 4 | iPad/iOS: misma app con Tauri 2 móvil; la sincronización pasa a Microsoft Graph, porque en iOS no hay carpeta de OneDrive sincronizada | |

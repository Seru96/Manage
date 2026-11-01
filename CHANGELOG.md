# Notas de versión

Todos los cambios de IMPLANTA Manage, la versión más nueva arriba. Las descargas de cada versión están en [Descargas / Releases](README.md#descargas--releases).

## 0.2.0 · 2026-11-01

### Novedades
- Excel: exportar el proyecto a un libro con una hoja por tipo (Proyecto, Subdivisiones, Equipo, Tareas, Anotaciones, Recordatorios y Accesos) e importarlo de vuelta. Al importar se actualiza lo que ya existe (por ID), se añade lo nuevo y no se borra nada. También se puede crear un proyecto nuevo desde un Excel (pantalla de inicio, «Desde Excel…»). Archivo › Exportar a Excel (⌘E) e Importar desde Excel, o el botón de Excel de la barra superior.
- Temas claro, híbrido y oscuro, como en IMPLANTA Install (Opciones, ⌘,).
- Tareas e incidencias se pueden editar, mover de subdivisión, cambiar de estado, duplicar y borrar desde cualquier vista: clic derecho en la tarea (lista o calendario), arrastrar una fila a otra subdivisión o la papelera de cada fila.
- Color de fondo según el estado: gris sin iniciar, azul en curso, rojo bloqueada y verde completada.
- La subdivisión «General» abarca todas las demás: al filtrarla se ve todo el proyecto, y lo que está en General aparece en cualquier subdivisión.
- Los recordatorios que no van con una tarea aparecen como elementos propios en la lista y en el calendario, con la etiqueta «Recordatorio»; se editan, mueven y borran igual que las tareas.

### Cambios
- Se quita la casilla de la izquierda de las tareas: el estado se elige a la derecha.
- Al cambiar la fecha de inicio, la fecha límite se mueve con ella (la tarea conserva su duración) y ya no puede quedar antes del inicio.
- Las tareas de la subdivisión General no cuentan para el aviso de persona en dos subdivisiones a la vez.

## 0.1.0 · 2026-11-01

### Novedades
- Primera versión: proyectos `.manage` guardados en la carpeta de Teams/SharePoint (sincronizada con OneDrive), con copia de trabajo local y sincronización automática.
- Pantalla de inicio como la de IMPLANTA Install, con proyectos recientes.
- Tareas agrupadas por subdivisión: nombre, descripción, criticidad, asignado, inicio, fecha límite y estado.
- Calendario mensual: arrastrar para mover, tirar de los bordes para alargar o acortar, doble clic en un día para crear una tarea.
- Búsqueda global, filtros por persona y subdivisión, y aviso cuando una persona está en dos subdivisiones en las mismas fechas.
- Anotaciones por subdivisión con su origen (cliente, Project Manager o interna), autor y fecha; se pueden convertir en tarea.
- Recordatorios de pruebas con cliente e hitos, con notificación nativa de Windows y macOS a su hora (y al abrir el proyecto, los que vencieron con la app cerrada).
- Accesos a sitios: tabla de personal con columnas propias (nombre, apellidos, DNI, matrícula y las que se añadan), una casilla por sitio y filtro por sitio.

# Notas de versión

Todos los cambios de IMPLANTA Manage, la versión más nueva arriba. Las descargas de cada versión están en [Descargas / Releases](README.md#descargas--releases).

## 0.4.0 · 2026-11-03

### Novedades
- **Arrastrar personal al calendario**. El panel izquierdo tiene ahora «Personal», con buscador y una división por empresa (el personal propio y cada subcontrata). Si arrastras a alguien al calendario de **Tareas**, se abre una tarea nueva con esa persona y ese día. Si lo arrastras al de **Subcontratas**, se apunta su jornada sin preguntar. Desde la cabecera de una empresa se arrastra a toda su gente a la vez.
- **Jornadas de subcontratas como gasto de un pedido**. Desde un pedido («Jornadas») o desde el resumen de Subcontratas («Cargar a un pedido») eliges la empresa, las fechas, el sitio y el personal, y pones el precio por jornada y persona. El importe se calcula solo (jornadas × precio). Si alguna jornada ya está cargada en otro gasto, se avisa.
- Los pedidos pueden ir asociados a una **subcontrata**.
- **Calendario sin fines de semana**: una tarea que dura varios días no se pinta el sábado ni el domingo (por ejemplo, de martes a martes se ve hasta el viernes y desde el lunes). Si empieza o acaba en fin de semana, ese fin de semana sí se ve.
- Un gasto nuevo sale con **1 €** de base. Al pulsar el importe se vacía para escribir el real; si se deja vacío, se queda en 1 €.
- **Filtros en todas las vistas**. Un botón de filtros en la barra superior permite filtrar por empresa (o personal propio), persona, estado y criticidad, además de la subdivisión. Los filtros puestos se ven como etiquetas, que se quitan con un clic. La empresa filtra también Equipo, Subcontratas y Gastos. En Documentación se puede filtrar por estado.

### Correcciones
- **Subcontratas**: el sitio de cada jornada ahora se guarda y se ve. Cada persona tiene su propio sitio en el diálogo, y con «Poner este sitio a los marcados» se cambia el de todos a la vez. Cada día enseña cada empresa con su color y, dentro, cada sitio con el color de su subdivisión. El resumen del mes desglosa las jornadas por sitio.
- **Equipo**: marcar la casilla de General marca todas las subdivisiones, y quitarla las quita todas. Si se quita un sitio, se quita también General.

### Excel
- Pedidos lleva la columna «Subcontrata». Gastos lleva «Jornadas» y «€ por jornada» (solo informativas).

## 0.3.0 · 2026-11-01

### Novedades
- **Gastos**: pedidos (nº, nombre, descripción, proveedor, importe, fecha y subdivisión) con sus gastos. Cada pedido muestra lo gastado, lo que queda **disponible** (en rojo si se pasa) y cuánto está **facturado** y **sin facturar**; arriba, los totales. Filtro de facturados / sin facturar.
- **Documentación**, en tres pestañas por subdivisión:
  - Planos y docs: versiones A0, A1… («Nueva versión» y filtro «Solo la última versión»), estado Sin iniciar / Realizado (verde) / Firmado (morado) y enlaces para abrir cada formato (Word, Excel, PDF, Visio) desde su carpeta.
  - Facturas y partes: con su PDF y un botón que lleva al gasto relacionado.
  - Certificaciones: con su PDF.
- **Equipo** sustituye a Accesos: una sola lista de personal propio y de subcontratas, con sus datos, los sitios a los que puede entrar y un **nombre corto** (primer nombre y primer apellido, editable) con el que se asignan las tareas. Las empresas subcontratadas se crean desde aquí.
- **Calendario › Subcontratas**: qué días ha ido cada persona de cada empresa (clic en un día para marcarlo) y el resumen del mes por empresa.
- **Varias personas por tarea**.
- El Excel incluye todo lo nuevo (Empresas, Pedidos, Gastos, Planos y docs, Facturas y partes, Certificaciones y Asistencia).

### Cambios
- Se quita la vista Anotaciones (los datos se quedan en el fichero).
- Al abrir un proyecto de la 0.2, la tabla de accesos y las personas pasan al nuevo Equipo.
- Atajos de vistas: ⌘1 Tareas, ⌘2 Calendario, ⌘3 Recordatorios, ⌘4 Gastos, ⌘5 Documentación, ⌘6 Equipo.

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

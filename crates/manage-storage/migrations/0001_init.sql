-- Metadatos del proyecto: id, nombre, revisión publicada…
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) WITHOUT ROWID;

-- Todas las entidades (tareas, subdivisiones, personas, notas, recordatorios, accesos)
-- como JSON. `json` NULL es una lápida: el borrado también se sincroniza.
-- `updated_at` + `updated_by` deciden quién gana al fusionar (último en escribir gana, por fila).
CREATE TABLE entities (
  kind       TEXT    NOT NULL,
  id         TEXT    NOT NULL,
  json       TEXT,
  updated_at INTEGER NOT NULL,
  updated_by TEXT    NOT NULL,
  PRIMARY KEY (kind, id)
) WITHOUT ROWID;

CREATE INDEX entities_updated ON entities (updated_at);

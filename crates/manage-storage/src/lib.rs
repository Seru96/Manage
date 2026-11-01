//! Formato `.manage`: un único fichero SQLite (sin `-wal` ni `-shm` al lado) para que
//! se pueda copiar, mandar o dejar en una carpeta de SharePoint/Teams tal cual.
//!
//! Todas las entidades viven en una sola tabla como JSON, con quién y cuándo las tocó
//! por última vez. Eso hace posible fusionar dos copias fila a fila (ver [`sync`]).

pub mod sync;

use std::path::Path;

use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::{Deserialize, Serialize};

const MIGRATIONS: &[&str] = &[include_str!("../migrations/0001_init.sql")];
/// Identifica el fichero como proyecto Manage ("MNGE").
const APPLICATION_ID: i32 = 0x4D4E_4745;

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("SQLite: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("el fichero no es un proyecto Manage")]
    NotAManageFile,
    #[error("el proyecto usa un formato más nuevo (v{0}); actualiza Manage")]
    TooNew(i32),
    #[error("{0}")]
    Io(#[from] std::io::Error),
}

pub type Result<T> = std::result::Result<T, StorageError>;

/// Cambio que llega del frontend. `json = None` es borrar.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Change {
    pub kind: String,
    pub id: String,
    pub json: Option<String>,
}

/// Fila tal como está en disco (incluidas las lápidas).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Row {
    pub kind: String,
    pub id: String,
    pub json: Option<String>,
    pub updated_at: i64,
    pub updated_by: String,
}

impl Row {
    /// ¿Gana esta fila a `other` al fusionar? Último en escribir; a igualdad, el usuario mayor
    /// (así las dos copias llegan siempre al mismo resultado).
    fn wins_over(&self, other: &Row) -> bool {
        (self.updated_at, &self.updated_by) > (other.updated_at, &other.updated_by)
    }
}

/// Lo que recibe el frontend al abrir: solo las entidades vivas.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub project_id: String,
    pub name: String,
    pub revision: i64,
    pub rows: Vec<Row>,
}

pub struct Store {
    conn: Connection,
}

impl Store {
    /// Crea un `.manage` vacío (sobrescribe si existe).
    pub fn create(path: &Path, project_id: &str, name: &str) -> Result<Self> {
        if path.exists() {
            std::fs::remove_file(path)?;
        }
        let store = Self::open_raw(path)?;
        store.set_meta("project_id", project_id)?;
        store.set_meta("name", name)?;
        store.set_meta("revision", "0")?;
        Ok(store)
    }

    pub fn open(path: &Path) -> Result<Self> {
        if !path.is_file() {
            return Err(std::io::Error::new(std::io::ErrorKind::NotFound, format!("no existe {}", path.display())).into());
        }
        Self::open_raw(path)
    }

    /// Solo lectura: ni migra ni escribe nada (para leer la copia compartida).
    pub fn open_read_only(path: &Path) -> Result<Self> {
        let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX)?;
        Self::check(&conn)?;
        Ok(Self { conn })
    }

    fn check(conn: &Connection) -> Result<i32> {
        let app_id: i32 = conn.query_row("PRAGMA application_id", [], |r| r.get(0))?;
        let version: i32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        let empty = || conn.query_row("SELECT count(*) FROM sqlite_master", [], |r| r.get::<_, i64>(0)).map(|n| n == 0);
        if app_id != APPLICATION_ID && !(app_id == 0 && version == 0 && empty()?) {
            return Err(StorageError::NotAManageFile);
        }
        if version > MIGRATIONS.len() as i32 {
            return Err(StorageError::TooNew(version));
        }
        Ok(version)
    }

    fn open_raw(path: &Path) -> Result<Self> {
        let mut conn = Connection::open(path)?;
        // Diario clásico (no WAL): el fichero queda completo y solo en disco tras cada escritura.
        conn.execute_batch("PRAGMA journal_mode = DELETE; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;")?;
        let version = Self::check(&conn)?;
        if (version as usize) < MIGRATIONS.len() {
            let tx = conn.transaction()?;
            for sql in &MIGRATIONS[version as usize..] {
                tx.execute_batch(sql)?;
            }
            tx.execute_batch(&format!("PRAGMA application_id = {APPLICATION_ID}; PRAGMA user_version = {};", MIGRATIONS.len()))?;
            tx.commit()?;
        }
        Ok(Self { conn })
    }

    pub fn meta(&self, key: &str) -> Result<Option<String>> {
        Ok(self.conn.query_row("SELECT value FROM meta WHERE key = ?1", [key], |r| r.get(0)).optional()?)
    }

    pub fn set_meta(&self, key: &str, value: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn revision(&self) -> Result<i64> {
        Ok(self.meta("revision")?.and_then(|v| v.parse().ok()).unwrap_or(0))
    }

    /// Aplica un lote de cambios del frontend en una transacción.
    pub fn apply(&mut self, changes: &[Change], user: &str, now_ms: i64) -> Result<usize> {
        let tx = self.conn.transaction()?;
        {
            let mut stmt = tx.prepare_cached(
                "INSERT INTO entities (kind, id, json, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(kind, id) DO UPDATE SET json = excluded.json,
                   updated_at = MAX(excluded.updated_at, entities.updated_at + 1), updated_by = excluded.updated_by",
            )?;
            for c in changes {
                stmt.execute(params![c.kind, c.id, c.json, now_ms, user])?;
            }
        }
        tx.commit()?;
        Ok(changes.len())
    }

    /// Todas las filas, lápidas incluidas.
    pub fn rows(&self) -> Result<Vec<Row>> {
        let mut stmt = self.conn.prepare("SELECT kind, id, json, updated_at, updated_by FROM entities")?;
        let rows = stmt
            .query_map([], |r| {
                Ok(Row { kind: r.get(0)?, id: r.get(1)?, json: r.get(2)?, updated_at: r.get(3)?, updated_by: r.get(4)? })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn snapshot(&self) -> Result<Snapshot> {
        Ok(Snapshot {
            project_id: self.meta("project_id")?.unwrap_or_default(),
            name: self.meta("name")?.unwrap_or_default(),
            revision: self.revision()?,
            rows: self.rows()?.into_iter().filter(|r| r.json.is_some()).collect(),
        })
    }

    /// Trae a esta copia lo que `other` tenga más reciente, fila a fila. Devuelve cuántas
    /// filas cambiaron aquí.
    pub fn merge_from(&mut self, other: &Store) -> Result<usize> {
        let theirs = other.rows()?;
        let mine: std::collections::HashMap<(String, String), Row> =
            self.rows()?.into_iter().map(|r| ((r.kind.clone(), r.id.clone()), r)).collect();
        let rev = other.revision()?.max(self.revision()?);
        let tx = self.conn.transaction()?;
        let mut changed = 0;
        {
            let mut stmt = tx.prepare_cached(
                "INSERT INTO entities (kind, id, json, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(kind, id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
            )?;
            for row in theirs {
                let take = match mine.get(&(row.kind.clone(), row.id.clone())) {
                    Some(m) => row.wins_over(m),
                    None => true,
                };
                if take {
                    stmt.execute(params![row.kind, row.id, row.json, row.updated_at, row.updated_by])?;
                    changed += 1;
                }
            }
        }
        // El nombre del proyecto y la revisión también viajan.
        if let Some(name) = other.meta("name")? {
            tx.execute("INSERT OR REPLACE INTO meta (key, value) VALUES ('name', ?1)", [name])?;
        }
        tx.execute("INSERT OR REPLACE INTO meta (key, value) VALUES ('revision', ?1)", [rev.to_string()])?;
        tx.commit()?;
        Ok(changed)
    }

    /// Escribe una copia completa y compacta en `dest`, de golpe: primero un temporal al lado
    /// y luego se renombra, así OneDrive nunca sube un fichero a medias.
    pub fn export_to(&self, dest: &Path) -> Result<()> {
        let mut tmp = dest.as_os_str().to_owned();
        tmp.push(format!(".tmp{}", std::process::id()));
        let tmp = std::path::PathBuf::from(tmp);
        let _ = std::fs::remove_file(&tmp);
        self.conn.execute("VACUUM INTO ?1", [tmp.to_string_lossy()])?;
        std::fs::rename(&tmp, dest).inspect_err(|_| {
            let _ = std::fs::remove_file(&tmp);
        })?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn change(kind: &str, id: &str, json: Option<&str>) -> Change {
        Change { kind: kind.into(), id: id.into(), json: json.map(str::to_string) }
    }

    #[test]
    fn crea_aplica_y_reabre() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("p.manage");
        let mut s = Store::create(&path, "p1", "Proyecto").unwrap();
        s.apply(&[change("task", "t1", Some("{\"name\":\"A\"}")), change("task", "t2", Some("{}"))], "ana", 10).unwrap();
        s.apply(&[change("task", "t2", None)], "ana", 20).unwrap();
        drop(s);
        let s = Store::open(&path).unwrap();
        let snap = s.snapshot().unwrap();
        assert_eq!(snap.name, "Proyecto");
        assert_eq!(snap.rows.len(), 1);
        assert_eq!(s.rows().unwrap().len(), 2, "el borrado queda como lápida");
        assert!(!dir.path().join("p.manage-wal").exists());
    }

    #[test]
    fn fusion_ultimo_gana_por_fila() {
        let dir = tempfile::tempdir().unwrap();
        let mut a = Store::create(&dir.path().join("a.manage"), "p", "P").unwrap();
        let mut b = Store::create(&dir.path().join("b.manage"), "p", "P").unwrap();
        a.apply(&[change("task", "t1", Some("\"a1\"")), change("task", "t2", Some("\"a2\""))], "ana", 100).unwrap();
        b.apply(&[change("task", "t1", Some("\"b1\"")), change("task", "t3", Some("\"b3\""))], "luis", 200).unwrap();
        b.apply(&[change("task", "t2", None)], "luis", 300).unwrap();

        assert_eq!(a.merge_from(&b).unwrap(), 3);
        assert_eq!(b.merge_from(&a).unwrap(), 0, "b ya tenía lo más reciente");
        let mut ra = a.rows().unwrap();
        let mut rb = b.rows().unwrap();
        ra.sort_by(|x, y| x.id.cmp(&y.id));
        rb.sort_by(|x, y| x.id.cmp(&y.id));
        assert_eq!(ra, rb);
        assert_eq!(ra[0].json.as_deref(), Some("\"b1\""));
        assert_eq!(ra[1].json, None, "el borrado de luis se propaga");
    }

    #[test]
    fn rechaza_otros_sqlite() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("x.db");
        let c = Connection::open(&path).unwrap();
        c.execute_batch("CREATE TABLE t(x); PRAGMA application_id = 7;").unwrap();
        drop(c);
        assert!(matches!(Store::open(&path), Err(StorageError::NotAManageFile)));
    }
}

//! Sincronización con la copia compartida del departamento.
//!
//! El `.manage` "oficial" está en una biblioteca de SharePoint/Teams que OneDrive
//! sincroniza con una carpeta local. No se trabaja nunca directamente sobre él (OneDrive
//! puede subirlo a medias o bloquearlo mientras SQLite escribe); se trabaja sobre una
//! **copia de trabajo** en la carpeta de datos de la app y se sincroniza así:
//!
//! 1. **Traer**: si el compartido cambió desde la última vez (tamaño + fecha), se copia a
//!    un temporal local y se fusiona fila a fila (último en escribir gana).
//! 2. **Publicar**: si hay cambios locales sin publicar, se escribe la copia de trabajo
//!    entera en el compartido de golpe (temporal + renombrar). OneDrive la sube.
//!
//! Si dos personas publican a la vez desde equipos distintos, OneDrive guarda una de las
//! dos como «Proyecto-EQUIPO.manage» junto al original. Esas copias de conflicto también
//! se fusionan en cada sincronización, así que no se pierde nada.
//!
//! Sin conexión se sigue trabajando: la copia de trabajo guarda los cambios pendientes
//! (`dirty`) y se publican en la siguiente sincronización.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::{Change, Result, Snapshot, StorageError, Store};

#[derive(Debug, Clone, Serialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
    /// Filas que llegaron de otros (0 = nada nuevo).
    pub pulled: usize,
    /// Se escribió la copia compartida.
    pub published: bool,
    /// Copias de conflicto de OneDrive que se fusionaron.
    pub conflict_copies: Vec<PathBuf>,
}

pub struct SharedProject {
    shared: PathBuf,
    work_path: PathBuf,
    work: Store,
}

const META_DIRTY: &str = "work.dirty";
const META_SEEN: &str = "work.shared_fingerprint";

impl SharedProject {
    /// Crea el proyecto y lo publica ya en `shared`.
    pub fn create(shared: &Path, work_dir: &Path, project_id: &str, name: &str, user: &str) -> Result<Self> {
        std::fs::create_dir_all(work_dir)?;
        let work_path = work_file(work_dir, shared);
        let work = Store::create(&work_path, project_id, name)?;
        work.set_meta(META_DIRTY, "1")?;
        let mut p = Self { shared: shared.to_path_buf(), work_path, work };
        p.sync(user)?;
        Ok(p)
    }

    /// Abre `shared`. Si ya había copia de trabajo de ese proyecto (con cambios sin publicar,
    /// por ejemplo de una sesión sin conexión) se conserva y se fusiona.
    pub fn open(shared: &Path, work_dir: &Path, user: &str) -> Result<Self> {
        std::fs::create_dir_all(work_dir)?;
        let work_path = work_file(work_dir, shared);
        let shared_id = Store::open_read_only(&local_copy(shared, work_dir)?)
            .and_then(|s| s.meta("project_id"))
            .map(|id| id.unwrap_or_default());
        let _ = std::fs::remove_file(incoming_path(work_dir));
        let shared_id = shared_id?;

        let reuse = Store::open(&work_path)
            .ok()
            .filter(|w| w.meta("project_id").ok().flatten().as_deref() == Some(shared_id.as_str()));
        let work = match reuse {
            Some(w) => w,
            None => {
                let _ = std::fs::remove_file(&work_path);
                std::fs::copy(shared, &work_path)?;
                let w = Store::open(&work_path)?;
                w.set_meta(META_DIRTY, "0")?;
                w.set_meta(META_SEEN, "")?;
                w
            }
        };
        let mut p = Self { shared: shared.to_path_buf(), work_path, work };
        p.sync(user)?;
        Ok(p)
    }

    pub fn shared_path(&self) -> &Path {
        &self.shared
    }

    pub fn snapshot(&self) -> Result<Snapshot> {
        self.work.snapshot()
    }

    pub fn has_pending(&self) -> bool {
        self.work.meta(META_DIRTY).ok().flatten().as_deref() == Some("1")
    }

    /// Guarda en la copia de trabajo (rápido, local). Se publica al sincronizar.
    pub fn apply(&mut self, changes: &[Change], user: &str, now_ms: i64) -> Result<usize> {
        let n = self.work.apply(changes, user, now_ms)?;
        self.work.set_meta(META_DIRTY, "1")?;
        Ok(n)
    }

    pub fn rename(&mut self, name: &str) -> Result<()> {
        self.work.set_meta("name", name)?;
        self.work.set_meta(META_DIRTY, "1")
    }

    pub fn sync(&mut self, _user: &str) -> Result<SyncReport> {
        let mut report = SyncReport::default();
        let work_dir = self.work_path.parent().unwrap_or(Path::new(".")).to_path_buf();
        let project_id = self.work.meta("project_id")?.unwrap_or_default();

        // 1. Traer lo de los demás (el original y las copias de conflicto de OneDrive).
        for _ in 0..3 {
            let current = fingerprint(&self.shared);
            if let Some(fp) = &current {
                if Some(fp.as_str()) != self.work.meta(META_SEEN)?.as_deref() {
                    report.pulled += self.pull(&self.shared.clone(), &work_dir, &project_id)?;
                    self.work.set_meta(META_SEEN, fp)?;
                }
            }
            let mut from_copies = 0;
            for copy in conflict_copies(&self.shared) {
                if let Ok(n) = self.pull(&copy, &work_dir, &project_id) {
                    from_copies += n;
                    if !report.conflict_copies.contains(&copy) {
                        report.conflict_copies.push(copy);
                    }
                }
            }
            report.pulled += from_copies;
            // Lo que llegó de una copia de conflicto hay que devolverlo al original.
            if from_copies > 0 {
                self.work.set_meta(META_DIRTY, "1")?;
            }

            // 2. Publicar si hay cambios propios (o el compartido ya no está).
            if !self.has_pending() && current.is_some() {
                return Ok(report);
            }
            // Si alguien lo ha cambiado mientras fusionábamos, otra vuelta antes de pisarlo.
            if fingerprint(&self.shared) != current {
                continue;
            }
            let rev = self.work.revision()? + 1;
            self.work.set_meta("revision", &rev.to_string())?;
            self.work.set_meta(META_DIRTY, "0")?;
            if let Err(e) = self.work.export_to(&self.shared) {
                self.work.set_meta(META_DIRTY, "1")?;
                return Err(e);
            }
            self.work.set_meta(META_SEEN, &fingerprint(&self.shared).unwrap_or_default())?;
            report.published = true;
            return Ok(report);
        }
        Ok(report)
    }

    fn pull(&mut self, from: &Path, work_dir: &Path, project_id: &str) -> Result<usize> {
        let tmp = local_copy(from, work_dir)?;
        let result = (|| {
            let other = Store::open_read_only(&tmp)?;
            if other.meta("project_id")?.unwrap_or_default() != project_id {
                return Err(StorageError::Io(std::io::Error::other(format!(
                    "{} es otro proyecto",
                    from.display()
                ))));
            }
            self.work.merge_from(&other)
        })();
        let _ = std::fs::remove_file(&tmp);
        result
    }
}

/// Copia `from` a un temporal local antes de leerlo: obliga a OneDrive a descargar el
/// fichero si solo estaba "a petición" y evita leer mientras se está reemplazando.
fn local_copy(from: &Path, work_dir: &Path) -> Result<PathBuf> {
    let tmp = incoming_path(work_dir);
    std::fs::copy(from, &tmp)?;
    Ok(tmp)
}

fn incoming_path(work_dir: &Path) -> PathBuf {
    work_dir.join(format!("entrante-{}.manage", std::process::id()))
}

/// Copia de trabajo de un compartido: un nombre estable por ruta.
pub fn work_file(work_dir: &Path, shared: &Path) -> PathBuf {
    let key = std::fs::canonicalize(shared).unwrap_or_else(|_| shared.to_path_buf());
    work_dir.join(format!("{:016x}.manage", fnv1a(key.to_string_lossy().as_bytes())))
}

fn fnv1a(bytes: &[u8]) -> u64 {
    bytes.iter().fold(0xcbf2_9ce4_8422_2325, |h, b| (h ^ u64::from(*b)).wrapping_mul(0x0100_0000_01b3))
}

fn fingerprint(path: &Path) -> Option<String> {
    let meta = std::fs::metadata(path).ok()?;
    let mtime = meta.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?.as_nanos();
    Some(format!("{}:{mtime}", meta.len()))
}

/// «Proyecto-PORTATIL-ANA.manage» junto a «Proyecto.manage»: lo que deja OneDrive cuando
/// dos equipos suben a la vez.
fn conflict_copies(shared: &Path) -> Vec<PathBuf> {
    let (Some(dir), Some(stem)) = (shared.parent(), shared.file_stem().and_then(|s| s.to_str())) else {
        return Vec::new();
    };
    let prefix = format!("{stem}-");
    let Ok(entries) = std::fs::read_dir(dir) else { return Vec::new() };
    entries
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| {
            p.extension().is_some_and(|e| e.eq_ignore_ascii_case("manage"))
                && p.file_stem().and_then(|s| s.to_str()).is_some_and(|s| s.starts_with(&prefix))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ch(id: &str, json: &str) -> Change {
        Change { kind: "task".into(), id: id.into(), json: Some(json.into()) }
    }
    fn ids(p: &SharedProject) -> Vec<String> {
        let mut v: Vec<String> = p.snapshot().unwrap().rows.into_iter().map(|r| r.id).collect();
        v.sort();
        v
    }

    #[test]
    fn dos_usuarios_un_fichero_compartido() {
        let sp = tempfile::tempdir().unwrap();
        let shared = sp.path().join("Obra Norte.manage");
        let (wa, wb) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());

        let mut ana = SharedProject::create(&shared, wa.path(), "p1", "Obra Norte", "ana").unwrap();
        ana.apply(&[ch("t1", "1")], "ana", 1_000).unwrap();
        assert!(ana.sync("ana").unwrap().published);

        let mut luis = SharedProject::open(&shared, wb.path(), "luis").unwrap();
        assert_eq!(ids(&luis), ["t1"]);
        luis.apply(&[ch("t2", "2")], "luis", 2_000).unwrap();
        // Ana trabaja a la vez, sin ver lo de Luis.
        ana.apply(&[ch("t3", "3")], "ana", 2_500).unwrap();
        luis.sync("luis").unwrap();
        let r = ana.sync("ana").unwrap();
        assert_eq!(r.pulled, 1);
        assert!(r.published);
        assert_eq!(ids(&ana), ["t1", "t2", "t3"]);
        assert_eq!(luis.sync("luis").unwrap().pulled, 1);
        assert_eq!(ids(&luis), ["t1", "t2", "t3"]);
        // Nada nuevo: ni trae ni publica.
        assert_eq!(luis.sync("luis").unwrap(), SyncReport::default());
    }

    #[test]
    fn sin_conexion_conserva_lo_pendiente() {
        let sp = tempfile::tempdir().unwrap();
        let shared = sp.path().join("P.manage");
        let w = tempfile::tempdir().unwrap();
        let mut p = SharedProject::create(&shared, w.path(), "p1", "P", "ana").unwrap();
        p.apply(&[ch("t1", "1")], "ana", 1_000).unwrap();
        drop(p); // se cierra sin sincronizar
        let p = SharedProject::open(&shared, w.path(), "ana").unwrap();
        assert_eq!(ids(&p), ["t1"]);
        assert!(!p.has_pending(), "al abrir se publicó lo pendiente");
    }

    #[test]
    fn fusiona_copias_de_conflicto_de_onedrive() {
        let sp = tempfile::tempdir().unwrap();
        let shared = sp.path().join("P.manage");
        let (wa, wb) = (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap());
        let mut a = SharedProject::create(&shared, wa.path(), "p1", "P", "ana").unwrap();
        let mut b = SharedProject::open(&shared, wb.path(), "luis").unwrap();
        b.apply(&[ch("t9", "9")], "luis", 5_000).unwrap();
        b.sync("luis").unwrap();
        // Simula a OneDrive: la versión de Luis queda aparte como copia de conflicto.
        std::fs::rename(&shared, sp.path().join("P-PORTATIL-LUIS.manage")).unwrap();
        a.work.export_to(&shared).unwrap();
        let r = a.sync("ana").unwrap();
        assert_eq!(r.conflict_copies.len(), 1);
        assert_eq!(ids(&a), ["t9"]);
        assert!(r.published);
    }
}

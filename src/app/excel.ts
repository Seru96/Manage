/** Exportar el proyecto abierto a Excel e importar un libro (en el abierto o en uno nuevo). */
import { describeImport, exportWorkbook, importWorkbook } from '../core/excel';
import { newId, PALETTE } from '../core/model';
import { readSheets } from '../core/xlsx/read';
import { buildXlsx } from '../core/xlsx/write';
import { backend } from '../platform/backend';
import { useProject, upsert } from '../store/project';
import { toast } from '../store/view';
import { createProject } from './session';

const fail = (e: unknown) => toast(`Excel: ${e instanceof Error ? e.message : String(e)}`);

export async function exportExcel() {
  const { name, entities } = useProject.getState();
  try {
    if (await backend.saveXlsx(name || 'Proyecto', buildXlsx(exportWorkbook(name, entities)))) toast('Proyecto exportado a Excel');
  } catch (e) { fail(e); }
}

async function readBook() {
  const file = await backend.pickXlsx();
  if (!file) return null;
  return { file, sheets: await readSheets(file.name, file.bytes) };
}

/** Importa en el proyecto abierto: actualiza por ID y añade lo nuevo; no borra nada. */
export async function importExcel() {
  try {
    const book = await readBook();
    if (!book) return;
    const r = importWorkbook(book.sheets, useProject.getState().entities);
    if (!r.upserts.length) { toast(`«${book.file.name}» no trae cambios para este proyecto`); return; }
    const warn = r.warnings.length ? `\n\nAvisos:\n${r.warnings.slice(0, 6).join('\n')}` : '';
    if (!(await backend.ask(`Importar «${book.file.name}» en este proyecto?\n\n${describeImport(r)}.${warn}\n\nLo que no aparece en el Excel no se toca.`))) return;
    for (const u of r.upserts) upsert(u.kind, u.item);
    toast('Excel importado');
  } catch (e) { fail(e); }
}

/** Crea un proyecto nuevo con el contenido de un Excel. */
export async function newProjectFromExcel() {
  try {
    const book = await readBook();
    if (!book) return;
    const draft = importWorkbook(book.sheets, useProject.getState().entities);
    if (!(await createProject({ suggestedName: draft.name ?? book.file.name.replace(/\.xlsx$/i, ''), empty: true }))) return;
    const r = importWorkbook(book.sheets, useProject.getState().entities);
    for (const u of r.upserts) upsert(u.kind, u.item);
    if (!Object.keys(useProject.getState().entities.subdivision).length) {
      upsert('subdivision', { id: newId(), name: 'General', color: PALETTE[0]!, order: 0, general: true });
    }
    toast(`Proyecto creado desde Excel: ${describeImport(r)}`);
  } catch (e) { fail(e); }
}


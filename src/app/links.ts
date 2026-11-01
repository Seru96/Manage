/** Enlaces de documentos: elegir un fichero, guardarlo relativo al proyecto y abrirlo. */
import { formatOf, newId, type DocLink, type LinkFormat } from '../core/model';
import { backend } from '../platform/backend';
import { useProject } from '../store/project';
import { toast } from '../store/view';

const sep = (p: string) => p.replace(/\\/g, '/');
const isWinPath = (p: string) => /^[a-z]:\//i.test(sep(p)) || sep(p).startsWith('//');

/**
 * Ruta de `file` relativa a la carpeta del proyecto, si están en la misma biblioteca (hasta
 * cuatro carpetas por encima). Así el enlace funciona en el equipo de cada persona aunque su
 * carpeta de OneDrive esté en otra ruta. Si no, se deja la ruta completa.
 */
export function relativeToProject(projectPath: string, file: string): string {
  const win = isWinPath(projectPath);
  const norm = (p: string) => (win ? sep(p).toLowerCase() : sep(p));
  const base = sep(projectPath).split('/').slice(0, -1);
  const target = sep(file).split('/');
  const nb = norm(projectPath).split('/').slice(0, -1), nt = norm(file).split('/');
  let i = 0;
  while (i < nb.length && i < nt.length && nb[i] === nt[i]) i++;
  const up = base.length - i;
  if (i <= 1 || up > 4) return file; // nada en común (otro disco) o demasiado lejos
  return [...Array<string>(up).fill('..'), ...target.slice(i)].join('/');
}

export async function chooseLinkFile(only?: LinkFormat): Promise<DocLink | null> {
  const ext = only === 'pdf' ? ['pdf'] : undefined;
  const file = await backend.pickFile(only === 'pdf' ? 'Elegir el PDF' : 'Elegir el documento', ext);
  if (!file) return null;
  const project = useProject.getState().path ?? '';
  return { id: newId(), format: only ?? formatOf(file), target: relativeToProject(project, file) };
}

export async function openLink(target: string) {
  const project = useProject.getState().path;
  if (!project || !target.trim()) return;
  try { await backend.openLink(project, target.trim()); } catch (e) { toast(String(e instanceof Error ? e.message : e)); }
}

import { describe, expect, it } from 'vitest';
import { describeImport, exportWorkbook, importWorkbook, parseDateCell } from './excel';
import { emptyEntities, type Entities } from './model';
import { readXlsx } from './xlsx/read';
import { buildXlsx } from './xlsx/write';

function sample(): Entities {
  const e = emptyEntities();
  e.subdivision.g = { id: 'g', name: 'General', color: '#0a84ff', order: 0, general: true };
  e.subdivision.n = { id: 'n', name: 'Nave 1', color: '#30d158', order: 1 };
  e.person.a = { id: 'a', name: 'Ana Pérez', color: '#ff9f0a' };
  e.task.t1 = { id: 't1', name: 'Cablear rack', description: 'Fila B', criticality: 'alta', status: 'en_curso',
    assigneeId: 'a', start: '2026-11-03', due: '2026-11-05', subdivisionId: 'n', createdAt: 1 };
  e.note.x = { id: 'x', subdivisionId: 'n', source: 'cliente', author: 'Ana', body: 'Pide fotos', createdAt: new Date('2026-11-02T10:30').getTime(), taskId: null };
  e.reminder.r = { id: 'r', title: 'Prueba FAT', at: '2026-11-06T09:30', kind: 'prueba', subdivisionId: 'n', taskId: 't1', done: false };
  e.accessColumn.nombre = { id: 'nombre', label: 'Nombre', order: 0 };
  e.accessColumn.dni = { id: 'dni', label: 'DNI', order: 1 };
  e.accessPerson.p = { id: 'p', values: { nombre: 'Luis', dni: '123X' }, siteIds: ['n'] };
  return e;
}

const roundTrip = async (e: Entities) => readXlsx(buildXlsx(exportWorkbook('Obra Norte', e)));

describe('Excel', () => {
  it('reimportar lo exportado no cambia nada', async () => {
    const e = sample();
    const r = importWorkbook(await roundTrip(e), e);
    expect(r.name).toBe('Obra Norte');
    expect(r.upserts).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(describeImport(r)).toBe('ningún cambio');
  });

  it('exportar e importar en un proyecto vacío conserva los datos', async () => {
    const e = sample();
    const r = importWorkbook(await roundTrip(e), { ...emptyEntities(), accessColumn: e.accessColumn });
    expect(r.warnings).toEqual([]);
    const got = Object.fromEntries(r.upserts.map((u) => [`${u.kind}:${u.item.id}`, u.item]));
    expect({ ...(got['task:t1'] as object), createdAt: 1 }).toEqual(e.task.t1);
    expect(got['reminder:r']).toEqual(e.reminder.r);
    expect(got['note:x']).toEqual(e.note.x);
    expect(got['subdivision:g']).toEqual(e.subdivision.g);
    expect(got['accessPerson:p']).toEqual(e.accessPerson.p);
  });

  it('en un proyecto vacío crea todo, también lo nombrado solo por nombre', async () => {
    const r = importWorkbook([
      { name: 'Tareas', rows: [
        ['ID', 'Subdivisión', 'Nombre', 'Descripción', 'Criticidad', 'Estado', 'Asignado', 'Inicio', 'Fecha límite'],
        ['', 'Planta 2', 'Revisar cuadro', '', 'crítica', 'bloqueada', 'Marta', '05/11/2026', '46000'],
        ['', '', '', '', '', '', '', '', ''],
      ] },
    ], emptyEntities());
    expect(r.created).toEqual({ subdivision: 1, person: 1, task: 1 });
    const task = r.upserts.find((u) => u.kind === 'task')!.item as Entities['task'][string];
    expect(task).toMatchObject({ name: 'Revisar cuadro', criticality: 'critica', status: 'bloqueada', start: '2025-12-09', due: '2025-12-09' });
    expect(describeImport(r)).toContain('tarea: 1 nueva');
  });

  it('lee fechas en varios formatos', () => {
    expect(parseDateCell('2026-11-03')).toBe('2026-11-03');
    expect(parseDateCell('3/11/2026 8:05')).toBe('2026-11-03T08:05');
    expect(parseDateCell('46000.5')).toBe('2025-12-09T12:00');
    expect(parseDateCell('mañana')).toBeNull();
  });
});

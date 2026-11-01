import { describe, expect, it } from 'vitest';
import { describeImport, exportWorkbook, importWorkbook, parseDateCell } from './excel';
import { emptyEntities, type Entities } from './model';
import { readXlsx } from './xlsx/read';
import { buildXlsx } from './xlsx/write';

function sample(): Entities {
  const e = emptyEntities();
  e.subdivision.g = { id: 'g', name: 'General', color: '#0a84ff', order: 0, general: true };
  e.subdivision.n = { id: 'n', name: 'Nave 1', color: '#30d158', order: 1 };
  e.company.c = { id: 'c', name: 'Electro SL', color: '#ff9f0a' };
  e.accessColumn.nombre = { id: 'nombre', label: 'Nombre', order: 0 };
  e.accessColumn.apellidos = { id: 'apellidos', label: 'Apellidos', order: 1 };
  e.accessColumn.dni = { id: 'dni', label: 'DNI', order: 2 };
  e.person.a = { id: 'a', name: 'Ana Pérez', color: '#ff9f0a', values: { nombre: 'Ana María', apellidos: 'Pérez Gil', dni: '1Z' }, siteIds: ['n'], companyId: null };
  e.person.l = { id: 'l', name: 'Luis (Electro)', color: '#bf5af2', values: { nombre: 'Luis', apellidos: 'Sanz', dni: '123X' }, siteIds: [], companyId: 'c' };
  e.task.t1 = { id: 't1', name: 'Cablear rack', description: 'Fila B', criticality: 'alta', status: 'en_curso',
    assigneeIds: ['a', 'l'], assigneeId: 'a', start: '2026-11-03', due: '2026-11-05', subdivisionId: 'n', createdAt: 1 };
  e.reminder.r = { id: 'r', title: 'Prueba FAT', at: '2026-11-06T09:30', kind: 'prueba', subdivisionId: 'n', taskId: 't1', done: false };
  e.order.o = { id: 'o', number: 'PO-14', name: 'Cableado', description: '', supplier: 'Cables SA', amount: 10000, date: '2026-11-01', subdivisionId: 'n', createdAt: 1 };
  e.expense.x = { id: 'x', orderId: 'o', name: 'Bobinas', description: '', amount: 1234.56, date: '2026-11-02', invoiced: true, invoiceNumber: 'F-1', createdAt: 1 };
  e.doc.p0 = { id: 'p0', seriesId: 's', section: 'plano', name: 'Planta baja', description: '', subdivisionId: 'n', version: 'A0', status: 'firmado', date: null,
    links: [{ id: 'k2', format: 'pdf', target: 'Planos/PB A0.pdf' }, { id: 'k1', format: 'visio', target: 'Planos/PB.vsdx' }], expenseId: null, createdAt: 1 };
  e.doc.p1 = { ...e.doc.p0, id: 'p1', version: 'A1', status: 'realizado', links: [] };
  e.doc.f = { id: 'f', seriesId: 'f', section: 'factura', name: 'Factura F-1', description: '', subdivisionId: 'n', version: 'A0', status: 'pendiente', date: '2026-11-03',
    links: [{ id: 'k3', format: 'pdf', target: 'Facturas/F-1.pdf' }], expenseId: 'x', createdAt: 1 };
  e.attendance['2026-11-04:l'] = { id: '2026-11-04:l', personId: 'l', date: '2026-11-04', subdivisionId: 'n' };
  return e;
}

const roundTrip = async (e: Entities) => readXlsx(buildXlsx(exportWorkbook('Obra Norte', e)));

describe('Excel', () => {
  it('reimportar lo exportado no cambia nada', async () => {
    const e = sample();
    const r = importWorkbook(await roundTrip(e), e);
    expect(r.name).toBe('Obra Norte');
    expect(r.warnings).toEqual([]);
    expect(r.upserts).toEqual([]);
    expect(describeImport(r)).toBe('ningún cambio');
  });

  it('exportar e importar en un proyecto vacío conserva los datos', async () => {
    const e = sample();
    const r = importWorkbook(await roundTrip(e), { ...emptyEntities(), accessColumn: e.accessColumn });
    expect(r.warnings).toEqual([]);
    const got = Object.fromEntries(r.upserts.map((u) => [`${u.kind}:${u.item.id}`, u.item]));
    const noTime = (x: unknown) => {
      const o: Record<string, unknown> = { ...(x as Record<string, unknown>), createdAt: 1 };
      if (Array.isArray(o.links)) o.links = (o.links as { id: string }[]).map((l) => ({ ...l, id: '' }));
      return o;
    };
    expect(noTime(got['task:t1'])).toEqual(e.task.t1);
    expect(got['reminder:r']).toEqual(e.reminder.r);
    expect(got['subdivision:g']).toEqual(e.subdivision.g);
    expect(got['person:a']).toEqual(e.person.a);
    expect(got['person:l']).toEqual(e.person.l);
    expect(got['company:c']).toEqual(e.company.c);
    expect(noTime(got['order:o'])).toEqual(e.order.o);
    expect(noTime(got['expense:x'])).toEqual(e.expense.x);
    expect(noTime(got['doc:p0'])).toEqual(noTime(e.doc.p0));
    expect(noTime(got['doc:f'])).toEqual(noTime(e.doc.f));
    expect(got['attendance:2026-11-04:l']).toEqual(e.attendance['2026-11-04:l']);
  });

  it('en un proyecto vacío crea todo, también lo nombrado solo por nombre', async () => {
    const r = importWorkbook([
      { name: 'Tareas', rows: [
        ['ID', 'Subdivisión', 'Nombre', 'Descripción', 'Criticidad', 'Estado', 'Asignados', 'Inicio', 'Fecha límite'],
        ['', 'Planta 2', 'Revisar cuadro', '', 'crítica', 'bloqueada', 'Marta Ruiz; Pablo', '05/11/2026', '46000'],
        ['', '', '', '', '', '', '', '', ''],
      ] },
      { name: 'Pedidos', rows: [['Nº pedido', 'Nombre', 'Importe'], ['PO-1', 'Material', '2.500,00 €']] },
      { name: 'Gastos', rows: [['Nº pedido', 'Nombre', 'Importe', 'Facturado'], ['PO-1', 'Tubo', '1000.5', 'sí'], ['PO-9', 'Huérfano', '1', '']] },
      { name: 'Asistencia', rows: [['Fecha', 'Persona', 'Empresa'], ['04/11/2026', 'Jon Ander', 'Montajes Norte']] },
    ], emptyEntities());
    expect(r.created).toMatchObject({ subdivision: 1, person: 3, task: 1, order: 1, expense: 1, company: 1, attendance: 1 });
    const task = r.upserts.find((u) => u.kind === 'task')!.item as Entities['task'][string];
    expect(task).toMatchObject({ name: 'Revisar cuadro', criticality: 'critica', status: 'bloqueada', start: '2025-12-09', due: '2025-12-09' });
    expect(task.assigneeIds).toHaveLength(2);
    expect((r.upserts.find((u) => u.kind === 'order')!.item as Entities['order'][string]).amount).toBe(2500);
    expect((r.upserts.find((u) => u.kind === 'expense')!.item as Entities['expense'][string])).toMatchObject({ amount: 1000.5, invoiced: true });
    const jon = r.upserts.find((u) => u.kind === 'person' && (u.item as Entities['person'][string]).name === 'Jon Ander')!.item as Entities['person'][string];
    expect(jon.companyId).toBeTruthy();
    expect(r.warnings).toEqual(['Gastos, fila 3: no se encuentra el pedido «PO-9», se ignora.']);
    expect(describeImport(r)).toContain('tarea: 1 nueva');
  });

  it('lee fechas en varios formatos', () => {
    expect(parseDateCell('2026-11-03')).toBe('2026-11-03');
    expect(parseDateCell('3/11/2026 8:05')).toBe('2026-11-03T08:05');
    expect(parseDateCell('46000.5')).toBe('2025-12-09T12:00');
    expect(parseDateCell('mañana')).toBeNull();
  });
});

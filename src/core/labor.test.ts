import { describe, expect, it } from 'vitest';
import { alreadyCharged, laborAmount, shiftsByPerson, shiftsIn, siteFor } from './labor';
import { toggleSiteIds, type Attendance, type Expense, type Person, type Subdivision } from './model';

const subs: Subdivision[] = [
  { id: 'g', name: 'General', color: '#000', order: 0, general: true },
  { id: 'p1', name: 'Planta 1', color: '#111', order: 1 },
  { id: 'p2', name: 'Planta 2', color: '#222', order: 2 },
];
const subsMap = Object.fromEntries(subs.map((s) => [s.id, s]));
const person = (id: string, companyId: string | null, siteIds: string[] = []): Person => ({ id, name: id, color: '#333', companyId, siteIds });
const people = Object.fromEntries([person('ana', 'c1'), person('luis', 'c1'), person('eva', 'c2'), person('yo', null)].map((p) => [p.id, p]));
const att = (date: string, personId: string, subdivisionId: string | null): Attendance => ({ id: `${date}:${personId}`, date, personId, subdivisionId });
const all = [
  att('2026-11-02', 'ana', 'p1'), att('2026-11-03', 'ana', 'p2'), att('2026-11-03', 'luis', 'p1'),
  att('2026-11-03', 'eva', 'p1'), att('2026-12-01', 'ana', 'p1'),
];

describe('jornadas de subcontratas', () => {
  it('cuenta las jornadas de una empresa entre dos fechas, y de un sitio si se pide', () => {
    const q = { companyId: 'c1', from: '2026-11-01', to: '2026-11-30', subdivisionId: null };
    expect(shiftsIn(q, all, people, subsMap)).toHaveLength(3);
    expect(shiftsIn({ ...q, subdivisionId: 'p1' }, all, people, subsMap)).toHaveLength(2);
    expect(shiftsIn({ ...q, subdivisionId: 'g' }, all, people, subsMap)).toHaveLength(3); // la general abarca todo
    expect(shiftsByPerson(shiftsIn(q, all, people, subsMap))).toEqual([['ana', 2], ['luis', 1]]);
    expect(laborAmount(185.5, 3)).toBe(556.5);
  });

  it('avisa de las jornadas que ya están en otro gasto', () => {
    const labor = { companyId: 'c1', from: '2026-11-01', to: '2026-11-02', personIds: ['ana'], subdivisionId: null, rate: 100, shifts: 1 };
    const exp: Expense = { id: 'e1', orderId: 'o', name: '', description: '', amount: 100, date: null, invoiced: false, invoiceNumber: '', createdAt: 0, labor };
    const nov = shiftsIn({ companyId: 'c1', from: '2026-11-01', to: '2026-11-30', subdivisionId: null }, all, people, subsMap);
    expect(alreadyCharged(nov, [exp], null, people, subsMap).map((a) => a.id)).toEqual(['2026-11-02:ana']);
    expect(alreadyCharged(nov, [exp], 'e1', people, subsMap)).toEqual([]); // el propio gasto no cuenta
  });

  it('elige el sitio al apuntar arrastrando', () => {
    expect(siteFor(person('x', 'c1', ['p1', 'p2']), 'p2', subs)).toBe('p2');
    expect(siteFor(person('x', 'c1', ['g', 'p1']), null, subs)).toBe('p1');
    expect(siteFor(person('x', 'c1', ['p1', 'p2']), null, subs)).toBe('g');
    expect(siteFor(person('x', 'c1', ['p1', 'p2']), 'g', subs)).toBe('g');
  });
});

describe('sitios de acceso en Equipo', () => {
  it('la general marca y quita todos', () => {
    expect(toggleSiteIds([], 'g', true, subs)).toEqual(['g', 'p1', 'p2']);
    expect(toggleSiteIds(['g', 'p1', 'p2'], 'g', false, subs)).toEqual([]);
  });
  it('quitar un sitio quita la general; marcar el último la marca', () => {
    expect(toggleSiteIds(['g', 'p1', 'p2'], 'p1', false, subs)).toEqual(['p2']);
    expect(toggleSiteIds(['p2'], 'p1', true, subs).sort()).toEqual(['g', 'p1', 'p2']);
    expect(toggleSiteIds([], 'p1', true, subs)).toEqual(['p1']);
  });
});

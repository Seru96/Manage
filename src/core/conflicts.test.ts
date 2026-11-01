import { describe, expect, it } from 'vitest';
import { findConflicts } from './conflicts';
import type { Task } from './model';

const t = (id: string, sub: string | null, who: string | null, start: string | null, due: string | null, status: Task['status'] = 'pendiente'): Task =>
  ({ id, subdivisionId: sub, assigneeId: who, start, due, status, name: id, description: '', criticality: 'media', createdAt: 0 });

describe('findConflicts', () => {
  it('detecta a la misma persona en dos subdivisiones el mismo día', () => {
    const cs = findConflicts([
      t('a', 'norte', 'ana', '2026-11-02', '2026-11-05'),
      t('b', 'sur', 'ana', '2026-11-04', '2026-11-04'),
    ]);
    expect(cs).toHaveLength(1);
    expect(cs[0]).toMatchObject({ personId: 'ana', from: '2026-11-04', to: '2026-11-04' });
  });

  it('no avisa en la misma subdivisión, sin solape, con otra persona o con tareas hechas', () => {
    expect(findConflicts([
      t('a', 'norte', 'ana', '2026-11-02', '2026-11-05'),
      t('b', 'norte', 'ana', '2026-11-03', '2026-11-03'),
      t('c', 'sur', 'ana', '2026-11-06', '2026-11-07'),
      t('d', 'sur', 'luis', '2026-11-02', '2026-11-05'),
      t('e', 'sur', 'ana', '2026-11-01', '2026-11-03', 'hecha'),
      t('f', 'sur', 'ana', null, null),
    ])).toEqual([]);
  });

  it('la subdivisión general no choca con las demás', () => {
    expect(findConflicts([
      t('a', 'general', 'ana', '2026-11-02', '2026-11-05'),
      t('b', 'sur', 'ana', '2026-11-04', '2026-11-04'),
    ], new Set(['general']))).toEqual([]);
  });

  it('una tarea sin inicio ocupa solo su fecha límite', () => {
    const cs = findConflicts([
      t('a', 'norte', 'ana', null, '2026-11-10'),
      t('b', 'sur', 'ana', '2026-11-08', '2026-11-12'),
    ]);
    expect(cs.map((c) => [c.from, c.to])).toEqual([['2026-11-10', '2026-11-10']]);
  });

  it('encuentra solapes aunque una tarea larga empiece antes', () => {
    const cs = findConflicts([
      t('largo', 'norte', 'ana', '2026-11-01', '2026-11-30'),
      t('x', 'norte', 'ana', '2026-11-05', '2026-11-05'),
      t('y', 'sur', 'ana', '2026-11-20', '2026-11-21'),
    ]);
    expect(cs.map((c) => [c.a.id, c.b.id])).toEqual([['largo', 'y']]);
  });
});

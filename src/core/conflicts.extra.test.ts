import { describe, expect, it } from 'vitest';
import { findConflicts } from './conflicts';
import type { Task } from './model';

const t = (id: string, sub: string, who: string[], start: string, due: string): Task =>
  ({ id, subdivisionId: sub, assigneeIds: who, assigneeId: who[0] ?? null, start, due, status: 'pendiente', name: id, description: '', criticality: 'media', createdAt: 0 });

describe('conflictos con varias personas por tarea', () => {
  it('avisa por cada persona que se repite', () => {
    const cs = findConflicts([t('a', 's1', ['ana', 'luis'], '2026-11-02', '2026-11-04'), t('b', 's2', ['luis'], '2026-11-03', '2026-11-03')]);
    expect(cs.map((c) => c.personId)).toEqual(['luis']);
  });
});

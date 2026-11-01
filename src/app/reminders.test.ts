import { describe, expect, it } from 'vitest';
import type { Reminder } from '../core/model';
import { dueReminders } from './reminders';

const r = (id: string, at: string, done = false): Reminder => ({ id, title: id, at, kind: 'hito', subdivisionId: null, taskId: null, done });

describe('dueReminders', () => {
  it('devuelve los vencidos, sin hechos ni ya avisados, en orden', () => {
    const list = [r('b', '2026-11-03T10:00'), r('a', '2026-11-02T09:00'), r('c', '2026-11-05T09:00'), r('d', '2026-11-01T09:00', true), r('e', '2026-11-01T08:00')];
    const seen = new Set(['e@2026-11-01T08:00']);
    expect(dueReminders(list, '2026-11-03T10:00', seen).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('si se cambia la hora, vuelve a avisar', () => {
    const seen = new Set(['a@2026-11-02T09:00']);
    expect(dueReminders([r('a', '2026-11-02T11:00')], '2026-11-02T12:00', seen)).toHaveLength(1);
  });
});

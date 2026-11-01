import { describe, expect, it } from 'vitest';
import { withDue, withStart } from './taskDates';

describe('fechas de la tarea', () => {
  it('mover el inicio mueve la fecha límite conservando la duración', () => {
    expect(withStart({ start: '2026-11-01', due: '2026-11-03' }, '2026-11-05')).toEqual({ start: '2026-11-05', due: '2026-11-07' });
    // Sin inicio previo: abre el rango hasta la fecha límite, o la empuja si queda antes (inicio 5, fin 3).
    expect(withStart({ start: null, due: '2026-11-03' }, '2026-11-05')).toEqual({ start: '2026-11-05', due: '2026-11-05' });
    expect(withStart({ start: null, due: '2026-11-09' }, '2026-11-05')).toEqual({ start: '2026-11-05', due: '2026-11-09' });
    expect(withStart({ start: null, due: null }, '2026-11-05')).toEqual({ start: '2026-11-05', due: '2026-11-05' });
    expect(withStart({ start: '2026-11-01', due: '2026-11-03' }, '2026-10-30')).toEqual({ start: '2026-10-30', due: '2026-11-01' });
  });

  it('una fecha límite anterior al inicio arrastra el inicio', () => {
    expect(withDue({ start: '2026-11-05', due: '2026-11-07' }, '2026-11-03')).toEqual({ start: '2026-11-03', due: '2026-11-03' });
    expect(withDue({ start: '2026-11-01', due: '2026-11-03' }, '2026-11-09')).toEqual({ start: '2026-11-01', due: '2026-11-09' });
  });
});

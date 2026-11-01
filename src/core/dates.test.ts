import { describe, expect, it } from 'vitest';
import { addDays, diffDays, monthWeeks } from './dates';

describe('fechas', () => {
  it('suma días cruzando meses y el cambio de hora', () => {
    expect(addDays('2026-10-24', 3)).toBe('2026-10-27');
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(diffDays('2026-10-24', '2026-10-27')).toBe(3);
  });

  it('el mes empieza en lunes y cubre semanas completas', () => {
    const w = monthWeeks(2026, 10); // noviembre 2026: empieza en domingo
    expect(w[0]![0]).toBe('2026-10-26');
    expect(w[0]![6]).toBe('2026-11-01');
    expect(w.at(-1)![6]! >= '2026-11-30').toBe(true);
    expect(w.every((x) => x.length === 7)).toBe(true);
  });
});

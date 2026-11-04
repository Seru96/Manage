import { describe, expect, it } from 'vitest';
import { visibleRuns } from './calendar';

// Semana del lunes 2 al domingo 8 de noviembre de 2026.
const MON = '2026-11-02';
describe('calendario sin fines de semana', () => {
  it('de martes a martes: hasta el viernes y desde el lunes', () => {
    expect(visibleRuns('2026-11-03', '2026-11-10', MON)).toEqual([{ from: 1, to: 4 }]);
    expect(visibleRuns('2026-11-03', '2026-11-10', '2026-11-09')).toEqual([{ from: 0, to: 1 }]);
  });
  it('si empieza o acaba en fin de semana, ese fin de semana se ve', () => {
    expect(visibleRuns('2026-11-06', '2026-11-08', MON)).toEqual([{ from: 4, to: 6 }]);
    expect(visibleRuns('2026-11-07', '2026-11-10', MON)).toEqual([{ from: 5, to: 6 }]);
    expect(visibleRuns('2026-11-07', '2026-11-07', MON)).toEqual([{ from: 5, to: 5 }]);
  });
  it('una tarea de varias semanas no pinta los fines de semana de en medio', () => {
    expect(visibleRuns('2026-10-28', '2026-11-20', MON)).toEqual([{ from: 0, to: 4 }]);
  });
});

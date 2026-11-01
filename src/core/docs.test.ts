import { describe, expect, it } from 'vitest';
import { latestVersions } from './docs';
import { nextVersion, type Doc } from './model';

const doc = (id: string, seriesId: string, version: string): Doc => ({
  id, seriesId, version, section: 'plano', name: id, description: '', subdivisionId: null, status: 'pendiente', date: null, links: [], expenseId: null, createdAt: 0,
});

describe('versiones de documentos', () => {
  it('siguiente versión', () => {
    expect(nextVersion('A0')).toBe('A1');
    expect(nextVersion('A9')).toBe('A10');
    expect(nextVersion('B')).toBe('B1');
    expect(nextVersion('')).toBe('A0');
  });
  it('se queda con la última de cada serie', () => {
    const got = latestVersions([doc('a0', 'a', 'A0'), doc('a10', 'a', 'A10'), doc('a2', 'a', 'A2'), doc('b0', 'b', 'B0')]).map((d) => d.id).sort();
    expect(got).toEqual(['a10', 'b0']);
  });
});

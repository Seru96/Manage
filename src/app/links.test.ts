import { describe, expect, it } from 'vitest';
import { relativeToProject } from './links';

describe('enlaces relativos al proyecto', () => {
  it('Windows: misma biblioteca de OneDrive', () => {
    const proj = 'C:\\Users\\ana\\OneDrive - Empresa\\Obra Norte\\Obra Norte.manage';
    expect(relativeToProject(proj, 'C:\\Users\\ana\\OneDrive - Empresa\\Obra Norte\\Planos\\P01 A1.pdf')).toBe('Planos/P01 A1.pdf');
    expect(relativeToProject(proj, 'c:\\users\\ana\\onedrive - empresa\\Compartido\\x.vsdx')).toBe('../Compartido/x.vsdx');
    expect(relativeToProject(proj, 'D:\\otro\\x.pdf')).toBe('D:\\otro\\x.pdf');
  });
  it('macOS', () => {
    const proj = '/Users/ana/Library/CloudStorage/OneDrive-Empresa/Obra/Obra.manage';
    expect(relativeToProject(proj, '/Users/ana/Library/CloudStorage/OneDrive-Empresa/Obra/Docs/a.docx')).toBe('Docs/a.docx');
  });
});

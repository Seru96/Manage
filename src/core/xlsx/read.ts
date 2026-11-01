/**
 * Lectura mínima de hojas de cálculo para importar: .xlsx (Office Open XML: ZIP con XML) y
 * .csv. Devuelve las celdas como texto, fila a fila, de cada hoja. Sin dependencias: el ZIP
 * se descomprime con DecompressionStream («deflate-raw»), que tienen WebKit, WebView2 y Node.
 */
export interface SheetData { name: string; rows: string[][] }

const dec = new TextDecoder();

/** Ficheros de un ZIP (por el directorio central), descomprimidos. */
async function unzip(bytes: Uint8Array, want: (name: string) => boolean): Promise<Map<string, Uint8Array>> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Fin del directorio central: firma 0x06054b50, buscando desde el final.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('No es un archivo .xlsx (ZIP) válido');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array>();
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), extra = dv.getUint16(p + 30, true), comment = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extra + comment;
    if (!want(name)) continue;
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    const raw = bytes.subarray(start, start + size);
    if (method === 0) out.set(name, raw);
    else if (method === 8) out.set(name, await inflate(raw));
    else throw new Error(`Compresión no admitida en ${name}`);
  }
  return out;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const unescapeXml = (s: string) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&amp;/g, '&');

/** Texto de un <si> o <is>: la suma de sus <t> (con formato o sin él). */
const runText = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1]!)).join('');

/** «AB12» → columna 27 (desde 0). */
function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export async function readXlsx(bytes: Uint8Array): Promise<SheetData[]> {
  const files = await unzip(bytes, (n) => n === 'xl/workbook.xml' || n === 'xl/sharedStrings.xml' || n === 'xl/_rels/workbook.xml.rels' || /^xl\/worksheets\/[^/]+\.xml$/.test(n));
  const text = (n: string) => { const b = files.get(n); return b ? dec.decode(b) : ''; };
  const shared = [...text('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => runText(m[1]!));
  // Hojas en el orden del libro, con su nombre.
  const rels = new Map([...text('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b([^>]*)\/?>/g)].map((m) => {
    const id = /\bId="([^"]+)"/.exec(m[1]!)?.[1] ?? '', target = /\bTarget="([^"]+)"/.exec(m[1]!)?.[1] ?? '';
    return [id, `xl/${target.replace(/^\/?xl\//, '')}`] as const;
  }));
  const sheets = [...text('xl/workbook.xml').matchAll(/<sheet\b([^>]*)\/?>/g)].map((m) => ({
    name: unescapeXml(/\bname="([^"]*)"/.exec(m[1]!)?.[1] ?? 'Hoja'),
    path: rels.get(/\br:id="([^"]+)"/.exec(m[1]!)?.[1] ?? '') ?? '',
  }));
  const list = sheets.length ? sheets : [...files.keys()].filter((n) => n.startsWith('xl/worksheets/')).sort().map((path, i) => ({ name: `Hoja ${i + 1}`, path }));
  return list.map(({ name, path }) => ({ name, rows: sheetRows(text(path), shared) }));
}

function sheetRows(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
    const r = Number(/\br="(\d+)"/.exec(rm[1] ?? rm[3] ?? '')?.[1] ?? rows.length + 1) - 1;
    const row: string[] = [];
    for (const cm of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1]!, body = cm[2] ?? '';
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const t = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let s = '';
      if (t === 's') s = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') s = runText(body);
      else if (v != null) s = unescapeXml(v);
      row[ref ? colIndex(ref) : row.length] = s.trim();
    }
    rows[r] = Array.from(row, (x) => x ?? '');
  }
  return Array.from(rows, (x) => x ?? []);
}

/** CSV con «;» o «,» (el que más aparezca en la primera línea), con comillas. */
export function readCsv(text: string): SheetData[] {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const sep = (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { row.push(cell.trim()); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim()); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  return [{ name: 'CSV', rows }];
}

/** Lee un archivo de hoja de cálculo según su extensión. */
export async function readSheets(name: string, bytes: Uint8Array): Promise<SheetData[]> {
  if (/\.csv$/i.test(name) || /\.txt$/i.test(name)) return readCsv(dec.decode(bytes).replace(/^﻿/, ''));
  return readXlsx(bytes);
}

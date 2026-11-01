import { compareVersions, type Doc } from './model';

/** La última versión de cada documento (por serie). */
export function latestVersions(docs: Doc[]): Doc[] {
  const best = new Map<string, Doc>();
  for (const d of docs) {
    const cur = best.get(d.seriesId);
    if (!cur || compareVersions(d.version, cur.version) > 0 || (d.version === cur.version && d.createdAt > cur.createdAt)) best.set(d.seriesId, d);
  }
  return [...best.values()];
}

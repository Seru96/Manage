import { useEffect, useMemo, useState } from 'react';
import { chooseLinkFile, openLink } from '../app/links';
import { latestVersions } from '../core/docs';
import { fmtShort } from '../core/dates';
import { fmtEur } from '../core/money';
import {
  compareVersions, DOC_SECTION, DOC_STATUS, formatOf, isGeneral, LINK_FORMAT, newId, nextVersion,
  type Doc, type DocLink, type DocSection, type DocStatus, type LinkFormat,
} from '../core/model';
import { backend } from '../platform/backend';
import { patch, remove, upsert, useProject } from '../store/project';
import { inSubdivision, useSubdivisions } from '../store/selectors';
import { goTo, useView } from '../store/view';
import { Icon } from './icons';
import { SubChips } from './SubChips';

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const SECTIONS: DocSection[] = ['plano', 'factura', 'certificacion'];

/**
 * Documentación del proyecto en tres pestañas: planos y documentos (con versiones A0, A1…
 * y estado), facturas o partes de trabajo (con su gasto) y certificaciones. Las tres se
 * agrupan por subdivisión y respetan los filtros.
 */
export function DocsView() {
  const docs = useProject((s) => s.entities.doc);
  const subsMap = useProject((s) => s.entities.subdivision);
  const subs = useSubdivisions();
  const { subdivisionId, q } = useView((s) => s.filters);
  const highlight = useView((s) => s.highlight);
  const [section, setSection] = useState<DocSection>('plano');
  const [latest, setLatest] = useState(true);
  const [status, setStatus] = useState<DocStatus | ''>('');
  const [editing, setEditing] = useState<{ doc: Doc; isNew: boolean } | null>(null);

  // Al llegar desde un gasto: abrir la pestaña de su documento y bajar hasta él.
  useEffect(() => {
    if (highlight?.kind !== 'doc') return;
    const d = docs[highlight.id];
    if (!d) return;
    setSection(d.section);
    setLatest(false);
    setTimeout(() => document.querySelector(`[data-doc="${d.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
  }, [highlight, docs]);

  const all = useMemo(() => Object.values(docs), [docs]);
  const shown = useMemo(() => {
    const qq = norm(q.trim());
    let list = all.filter((d) => d.section === section);
    if (section === 'plano' && latest) list = latestVersions(list);
    return list.filter((d) => inSubdivision(d.subdivisionId, subdivisionId, subsMap) && (!status || d.status === status) && (!qq || norm([d.name, d.description, d.version].join(' ')).includes(qq)));
  }, [all, section, latest, q, subdivisionId, subsMap, status]);

  const groups = useMemo(() => {
    const by = new Map<string | null, Doc[]>();
    for (const d of shown) { const k = d.subdivisionId && subsMap[d.subdivisionId] ? d.subdivisionId : null; by.set(k, [...(by.get(k) ?? []), d]); }
    const sorter = (a: Doc, b: Doc) => a.name.localeCompare(b.name, 'es', { numeric: true }) || compareVersions(b.version, a.version) || (b.date ?? '').localeCompare(a.date ?? '');
    const list = subs.filter((s) => inSubdivision(s.id, subdivisionId, subsMap))
      .map((s) => ({ id: s.id as string | null, name: s.name, color: s.color, general: isGeneral(s), docs: (by.get(s.id) ?? []).sort(sorter) }));
    if (by.get(null)?.length) list.push({ id: null, name: 'Sin subdivisión', color: 'var(--muted)', general: false, docs: by.get(null)!.sort(sorter) });
    return list;
  }, [shown, subs, subsMap, subdivisionId]);

  const count = (s: DocSection) => (s === 'plano' ? latestVersions(all.filter((d) => d.section === s)).length : all.filter((d) => d.section === s).length);
  const create = (sub?: string | null) => { const id = newId(); setEditing({ isNew: true, doc: {
    id, seriesId: section === 'plano' ? newId() : id, section, name: '', description: '', subdivisionId: sub !== undefined ? sub : subdivisionId ?? subs[0]?.id ?? null,
    version: 'A0', status: 'pendiente', date: section === 'plano' ? null : new Date().toISOString().slice(0, 10), links: [], expenseId: null, createdAt: Date.now(),
  } }); };
  const newVersion = (d: Doc) => {
    const same = all.filter((x) => x.seriesId === d.seriesId).map((x) => x.version).sort(compareVersions);
    setEditing({ isNew: true, doc: { ...d, id: newId(), version: nextVersion(same.at(-1) ?? d.version), status: 'pendiente', links: [], createdAt: Date.now() } });
  };
  const del = async (d: Doc) => { if (await backend.ask(`¿Borrar «${d.name}${d.section === 'plano' ? ` ${d.version}` : ''}»? El fichero no se toca.`)) remove('doc', d.id); };

  return (
    <div className="view docs-view">
      <div className="view-head">
        <h1>Documentación</h1>
        <div className="view-tools">
          <select className="tb-select" value={status} aria-label="Filtrar por estado" onChange={(e) => setStatus(e.target.value as DocStatus | '')}>
            <option value="">Todos los estados</option>
            {Object.entries(DOC_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {section === 'plano' && (
            <label className="check muted" title="Ver solo la versión más reciente de cada documento">
              <input type="checkbox" checked={latest} onChange={(e) => setLatest(e.target.checked)} /> Solo la última versión
            </label>
          )}
          <button className="btn primary" onClick={() => create()}><Icon name="plus" size={14} /> {section === 'plano' ? 'Documento' : section === 'factura' ? 'Factura o parte' : 'Certificación'}</button>
        </div>
      </div>
      <div className="tabs-row" role="tablist">
        {SECTIONS.map((s) => (
          <button key={s} role="tab" aria-selected={section === s} data-section={s} className={`tab${section === s ? ' on' : ''}`} onClick={() => setSection(s)}>
            {DOC_SECTION[s]}<span className="muted">{count(s) || ''}</span>
          </button>
        ))}
      </div>
      <SubChips />

      <div className="task-table">
        <div className={`doc-row head ${section}`} aria-hidden>
          <span>Nombre</span>
          {section === 'plano' && <span>Versión</span>}
          <span>Fecha</span>
          {section === 'factura' && <span>Gasto</span>}
          <span>{section === 'plano' ? 'Abrir' : 'PDF'}</span>
          {section === 'plano' && <span>Estado</span>}
          <span />
        </div>
        {groups.map((g) => (
          <section key={g.id ?? 'none'} className="task-group">
            <div className="group-head static">
              <span className="swatch" style={{ background: g.color }} /><strong>{g.name}</strong>
              <span className="muted">{g.docs.length}</span>
              <span className="group-add" role="button" title="Nuevo en esta subdivisión" onClick={() => create(g.id)}><Icon name="plus" size={14} /></span>
            </div>
            {g.docs.map((d) => <DocRow key={d.id} d={d} flash={highlight?.id === d.id} onEdit={() => setEditing({ doc: { ...d, links: [...d.links] }, isNew: false })}
              onNewVersion={() => newVersion(d)} onDelete={() => void del(d)} />)}
            {!g.docs.length && <p className="group-empty muted">Nada todavía.</p>}
          </section>
        ))}
      </div>

      {editing && <DocDialog init={editing.doc} isNew={editing.isNew} onClose={() => setEditing(null)} onDelete={async () => { await del(editing.doc); setEditing(null); }} />}
    </div>
  );
}

function DocRow({ d, flash, onEdit, onNewVersion, onDelete }: { d: Doc; flash: boolean; onEdit: () => void; onNewVersion: () => void; onDelete: () => void }) {
  const expenses = useProject((s) => s.entities.expense);
  const series = useProject((s) => Object.values(s.entities.doc).filter((x) => x.seriesId === d.seriesId).length);
  const exp = d.expenseId ? expenses[d.expenseId] : undefined;
  const pdf = d.links.find((l) => l.format === 'pdf') ?? d.links[0];
  return (
    <div className={`doc-row ${d.section}${d.section === 'plano' ? ` st-bg doc-${d.status}` : ''}${flash ? ' flash' : ''}`} data-doc={d.id} onClick={onEdit}>
      <span className="task-name"><strong>{d.name || 'Sin nombre'}</strong>{d.description && <span className="muted desc">{d.description}</span>}</span>
      {d.section === 'plano' && <span><span className="version" title={series > 1 ? `${series} versiones` : undefined}>{d.version}</span></span>}
      <span className="muted">{d.date ? fmtShort(d.date) : '—'}</span>
      {d.section === 'factura' && (
        <span onClick={(e) => e.stopPropagation()}>
          {exp ? <button className="btn small" title="Ir al gasto en Gastos" onClick={() => goTo('expenses', 'expense', exp.id)}>
            <Icon name="money" size={13} /> {exp.name || 'Gasto'} · {fmtEur(exp.amount)}</button> : <span className="muted">Sin gasto</span>}
        </span>
      )}
      <span className="links" onClick={(e) => e.stopPropagation()}>
        {d.section === 'plano'
          ? d.links.map((l) => <LinkButton key={l.id} link={l} />)
          : pdf ? <LinkButton link={{ ...pdf, format: 'pdf' }} label="Abrir PDF" /> : null}
        {!d.links.length && <span className="muted">—</span>}
      </span>
      {d.section === 'plano' && (
        <span onClick={(e) => e.stopPropagation()}>
          <select className={`status st-bg doc-${d.status}`} value={d.status} aria-label="Estado" onChange={(e) => patch('doc', d.id, { status: e.target.value as DocStatus })}>
            {Object.entries(DOC_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </span>
      )}
      <span className="row-actions" onClick={(e) => e.stopPropagation()}>
        {d.section === 'plano' && <button className="row-action" title="Nueva versión" onClick={onNewVersion}><Icon name="copy" size={15} /></button>}
        <button className="row-action danger" title="Borrar" onClick={onDelete}><Icon name="trash" size={15} /></button>
      </span>
    </div>
  );
}

export function LinkButton({ link, label }: { link: DocLink; label?: string }) {
  return (
    <button className={`fmt fmt-${link.format}`} title={`Abrir ${link.target}`} onClick={() => void openLink(link.target)}>
      {label ?? LINK_FORMAT[link.format]}
    </button>
  );
}

function DocDialog({ init, isNew, onClose, onDelete }: { init: Doc; isNew: boolean; onClose: () => void; onDelete: () => void }) {
  const [d, setD] = useState(init);
  const subs = useSubdivisions();
  const orders = useProject((s) => s.entities.order);
  const expenses = useProject((s) => s.entities.expense);
  const set = (c: Partial<Doc>) => setD({ ...d, ...c });
  const save = () => { upsert('doc', { ...d, name: d.name.trim(), links: d.links.filter((l) => l.target.trim()) }); onClose(); };
  const setLink = (id: string, c: Partial<DocLink>) => set({ links: d.links.map((l) => (l.id === id ? { ...l, ...c } : l)) });
  const pdfOnly = d.section !== 'plano';
  const pdf = d.links[0];
  const choose = async (replace?: string) => {
    const l = await chooseLinkFile(pdfOnly ? 'pdf' : undefined);
    if (!l) return;
    set({ links: replace ? d.links.map((x) => (x.id === replace ? { ...l, id: replace } : x)) : pdfOnly ? [l] : [...d.links, l] });
  };
  const title = isNew ? (d.section === 'plano' && d.version !== 'A0' && d.name ? `Nueva versión de «${d.name}»` : `Nuevo: ${DOC_SECTION[d.section].toLowerCase()}`) : 'Editar';

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="dialog task-dialog" onSubmit={(e) => { e.preventDefault(); save(); }} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <h3>{title}</h3>
        <div className="field-row">
          <label className="field" style={{ flex: 3 }}>Nombre<input autoFocus value={d.name} onChange={(e) => set({ name: e.target.value })}
            placeholder={d.section === 'plano' ? 'Plano de planta baja' : d.section === 'factura' ? 'Factura 2026/118 o parte del 3/11' : 'Certificación nº 2'} /></label>
          {d.section === 'plano' && <label className="field">Versión<input value={d.version} onChange={(e) => set({ version: e.target.value.toUpperCase() })} /></label>}
        </div>
        <label className="field">Descripción<textarea rows={3} value={d.description} onChange={(e) => set({ description: e.target.value })} /></label>
        <div className="field-row">
          <label className="field">Subdivisión
            <select value={d.subdivisionId ?? ''} onChange={(e) => set({ subdivisionId: e.target.value || null })}>
              <option value="">Sin subdivisión</option>
              {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="field"><span>Fecha{d.section === 'plano' && <span className="muted"> (opcional)</span>}</span>
            <input type="date" value={d.date ?? ''} onChange={(e) => set({ date: e.target.value || null })} /></label>
          {d.section === 'plano' && (
            <label className="field">Estado
              <select value={d.status} onChange={(e) => set({ status: e.target.value as DocStatus })}>
                {Object.entries(DOC_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
          )}
        </div>
        {d.section === 'factura' && (
          <label className="field">Gasto relacionado
            <select value={d.expenseId ?? ''} onChange={(e) => set({ expenseId: e.target.value || null })}>
              <option value="">Ninguno</option>
              {Object.values(orders).map((o) => (
                <optgroup key={o.id} label={[o.number, o.name].filter(Boolean).join(' · ')}>
                  {Object.values(expenses).filter((x) => x.orderId === o.id).map((x) => <option key={x.id} value={x.id}>{x.name || 'Gasto'} · {fmtEur(x.amount)}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
        )}

        <div className="field">{pdfOnly ? 'PDF' : 'Enlaces'} <span className="muted">(ruta del fichero en la carpeta del proyecto o enlace web)</span>
          {pdfOnly ? (
            <div className="link-edit">
              <span className="fmt fmt-pdf">PDF</span>
              <input value={pdf?.target ?? ''} placeholder="Facturas/2026-118.pdf" onChange={(e) => set({ links: e.target.value ? [{ id: pdf?.id ?? newId(), format: 'pdf', target: e.target.value }] : [] })} />
              {backend.kind === 'tauri' && <button type="button" className="btn" onClick={() => void choose(pdf?.id)}>Elegir…</button>}
            </div>
          ) : (
            <>
              {d.links.map((l) => (
                <div key={l.id} className="link-edit">
                  <select className={`fmt fmt-${l.format}`} value={l.format} aria-label="Formato" onChange={(e) => setLink(l.id, { format: e.target.value as LinkFormat })}>
                    {Object.entries(LINK_FORMAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <input value={l.target} placeholder="Planos/P01.vsdx" onChange={(e) => setLink(l.id, { target: e.target.value, ...(l.target ? {} : { format: formatOf(e.target.value) }) })} />
                  {backend.kind === 'tauri' && <button type="button" className="btn" onClick={() => void choose(l.id)}>Elegir…</button>}
                  <button type="button" className="row-action danger" aria-label="Quitar enlace" onClick={() => set({ links: d.links.filter((x) => x.id !== l.id) })}><Icon name="close" size={13} /></button>
                </div>
              ))}
              <div className="link-add">
                {backend.kind === 'tauri' && <button type="button" className="btn" onClick={() => void choose()}><Icon name="link" size={13} /> Elegir fichero…</button>}
                <button type="button" className="btn" onClick={() => set({ links: [...d.links, { id: newId(), format: 'pdf', target: '' }] })}><Icon name="plus" size={13} /> Escribir ruta o enlace</button>
              </div>
            </>
          )}
        </div>

        <div className="dialog-buttons">
          {!isNew && <button type="button" className="danger-text" onClick={onDelete}>Borrar</button>}
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary" disabled={!d.name.trim()}>{isNew ? 'Crear' : 'Guardar'}</button>
        </div>
      </form>
    </div>
  );
}

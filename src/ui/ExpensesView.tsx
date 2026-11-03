import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtShort } from '../core/dates';
import { alreadyCharged, laborAmount, shiftsByPerson, shiftsIn } from '../core/labor';
import { fmtEur, orderTotals, parseMoney, sumTotals, type OrderTotals } from '../core/money';
import { isGeneral, newId, type DateStr, type Expense, type Order } from '../core/model';
import { backend } from '../platform/backend';
import { patch, remove, upsert, useProject } from '../store/project';
import { inSubdivision, personLabel, useCompanies, useSubdivisions } from '../store/selectors';
import { goTo, useView } from '../store/view';
import { Icon } from './icons';
import { SubChips } from './SubChips';

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
type Editing = { kind: 'order'; item: Order; isNew: boolean } | { kind: 'expense'; item: Expense; isNew: boolean } | null;
type InvoiceFilter = 'all' | 'invoiced' | 'pending';

/**
 * Gastos: los pedidos y, dentro de cada uno, sus gastos. Cada pedido muestra lo gastado, lo
 * que queda disponible y cuánto está facturado y sin facturar.
 */
export function ExpensesView() {
  const orders = useProject((s) => s.entities.order);
  const expenses = useProject((s) => s.entities.expense);
  const docs = useProject((s) => s.entities.doc);
  const subsMap = useProject((s) => s.entities.subdivision);
  const { subdivisionId, q, companyId } = useView((s) => s.filters);
  const companiesMap = useProject((s) => s.entities.company);
  const highlight = useView((s) => s.highlight);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<Editing>(null);
  const [inv, setInv] = useState<InvoiceFilter>('all');

  const byOrder = useMemo(() => {
    const m = new Map<string, Expense[]>();
    for (const e of Object.values(expenses)) m.set(e.orderId, [...(m.get(e.orderId) ?? []), e]);
    for (const list of m.values()) list.sort((a, b) => (a.date ?? '9').localeCompare(b.date ?? '9') || a.createdAt - b.createdAt);
    return m;
  }, [expenses]);
  const invoicesOf = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of Object.values(docs)) if (d.expenseId) m.set(d.expenseId, (m.get(d.expenseId) ?? 0) + 1);
    return m;
  }, [docs]);

  const list = useMemo(() => {
    const qq = norm(q.trim());
    return Object.values(orders)
      .filter((o) => inSubdivision(o.subdivisionId, subdivisionId, subsMap)
        && (!companyId || (companyId === 'own' ? !o.companyId : o.companyId === companyId)))
      .map((o) => {
        const all = byOrder.get(o.id) ?? [];
        const hit = (s: string) => !qq || norm(s).includes(qq);
        const orderHit = hit([o.number, o.name, o.supplier, o.description, companiesMap[o.companyId ?? '']?.name ?? ''].join(' '));
        const shown = all.filter((e) => (inv === 'all' || (inv === 'invoiced') === e.invoiced) && (orderHit || hit([e.name, e.description, e.invoiceNumber].join(' '))));
        return { o, all, shown, totals: orderTotals(o, all), visible: orderHit || shown.length > 0 };
      })
      .filter((x) => x.visible && (inv === 'all' || x.shown.length > 0))
      .sort((a, b) => a.o.number.localeCompare(b.o.number, 'es', { numeric: true }) || a.o.createdAt - b.o.createdAt);
  }, [companiesMap, orders, byOrder, q, subdivisionId, subsMap, inv, companyId]);
  const total = sumTotals(list.map((x) => x.totals));

  // Al llegar desde una factura: abrir su pedido y bajar hasta el gasto.
  useEffect(() => {
    if (highlight?.kind !== 'expense') return;
    const e = expenses[highlight.id];
    if (e) setClosed((c) => ({ ...c, [e.orderId]: false }));
    setTimeout(() => document.querySelector(`[data-expense="${highlight.id}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
  }, [highlight, expenses]);

  const newOrder = () => setEditing({ kind: 'order', isNew: true, item: {
    id: newId(), number: '', name: '', description: '', supplier: companiesMap[companyId ?? '']?.name ?? '', amount: 0, date: null, subdivisionId,
    companyId: companyId && companyId !== 'own' ? companyId : null, createdAt: Date.now(),
  } });
  const newExpense = (orderId: string, labor = false) => {
    const o = orders[orderId];
    const d = new Date();
    const cid = o?.companyId ?? Object.keys(companiesMap)[0];
    setEditing({ kind: 'expense', isNew: true, item: {
      id: newId(), orderId, name: '', description: '', amount: labor ? 0 : 1, date: null, invoiced: false, invoiceNumber: '', createdAt: Date.now(),
      labor: labor && cid ? {
        companyId: cid, subdivisionId: o?.subdivisionId && !isGeneral(subsMap[o.subdivisionId]) ? o.subdivisionId : null, personIds: [], rate: 0, shifts: 0,
        from: toDateStr(new Date(d.getFullYear(), d.getMonth(), 1)), to: toDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
      } : null,
    } });
  };
  const delOrder = async (o: Order) => {
    const n = byOrder.get(o.id)?.length ?? 0;
    if (!(await backend.ask(`¿Borrar el pedido ${o.number || o.name}${n ? ` y sus ${n} gastos` : ''}?`))) return;
    for (const e of byOrder.get(o.id) ?? []) delExpenseNow(e.id);
    remove('order', o.id);
  };
  const delExpenseNow = (id: string) => {
    for (const d of Object.values(useProject.getState().entities.doc)) if (d.expenseId === id) patch('doc', d.id, { expenseId: null });
    remove('expense', id);
  };

  return (
    <div className="view expenses-view">
      <div className="view-head">
        <h1>Gastos</h1>
        <span className="muted">{list.length} {list.length === 1 ? 'pedido' : 'pedidos'}</span>
        <div className="view-tools">
          <div className="segmented" role="radiogroup" aria-label="Facturación">
            <button className={inv === 'all' ? 'on' : ''} onClick={() => setInv('all')}>Todos</button>
            <button className={inv === 'invoiced' ? 'on' : ''} onClick={() => setInv('invoiced')}>Facturados</button>
            <button className={inv === 'pending' ? 'on' : ''} onClick={() => setInv('pending')}>Sin facturar</button>
          </div>
          <button className="btn primary" onClick={newOrder}><Icon name="plus" size={14} /> Pedido</button>
        </div>
      </div>
      <SubChips />

      <div className="money-summary" aria-label="Totales">
        <Stat label="Pedidos" value={total.amount} />
        <Stat label="Gastado" value={total.spent} />
        <Stat label="Disponible" value={total.available} tone={total.available < 0 ? 'bad' : 'good'} />
        <Stat label="Facturado" value={total.invoiced} tone="ok" />
        <Stat label="Sin facturar" value={total.notInvoiced} tone={total.notInvoiced ? 'warn' : undefined} />
      </div>

      <div className="orders">
        {list.map(({ o, shown, totals }) => {
          const sub = subsMap[o.subdivisionId ?? ''];
          const company = companiesMap[o.companyId ?? ''];
          const isClosed = closed[o.id];
          return (
            <section key={o.id} className={`order${highlight?.id === o.id ? ' flash' : ''}`} data-order={o.id}>
              <div className="order-head" onClick={() => setClosed((c) => ({ ...c, [o.id]: !c[o.id] }))}>
                <span className={`chev${isClosed ? '' : ' open'}`}>›</span>
                <div className="order-title">
                  <div><span className="order-number">{o.number || 'Sin nº'}</span><strong>{o.name || 'Pedido sin nombre'}</strong></div>
                  <div className="muted order-meta">
                    {sub && <span><span className="swatch" style={{ background: sub.color }} />{sub.name}</span>}
                    {company && <span className="company-tag"><span className="swatch" style={{ background: company.color }} />{company.name}</span>}
                    {o.supplier && o.supplier !== companiesMap[o.companyId ?? '']?.name && <span>{o.supplier}</span>}
                    {o.date && <span>{fmtShort(o.date)}</span>}
                    {o.description && <span className="desc">{o.description}</span>}
                  </div>
                </div>
                <Bar t={totals} />
                <div className="order-nums">
                  <Num label="Pedido" v={totals.amount} />
                  <Num label="Disponible" v={totals.available} tone={totals.available < 0 ? 'bad' : 'good'} big />
                  <Num label="Facturado" v={totals.invoiced} tone="ok" />
                  <Num label="Sin facturar" v={totals.notInvoiced} tone={totals.notInvoiced ? 'warn' : undefined} />
                </div>
                <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="btn" onClick={() => newExpense(o.id)} title="Añadir un gasto a este pedido"><Icon name="plus" size={13} /> Gasto</button>
                  {Object.keys(companiesMap).length > 0 && <button className="btn" data-action="labor" onClick={() => newExpense(o.id, true)}
                    title="Cargar jornadas de una subcontrata: elige el personal, las fechas y el precio por jornada"><Icon name="users" size={13} /> Jornadas</button>}
                  <button className="row-action" title="Editar pedido" onClick={() => setEditing({ kind: 'order', item: { ...o }, isNew: false })}><Icon name="newDoc" size={15} /></button>
                  <button className="row-action danger" title="Borrar pedido" onClick={() => void delOrder(o)}><Icon name="trash" size={15} /></button>
                </div>
              </div>
              {!isClosed && (
                <div className="expenses">
                  {shown.map((e) => (
                    <div key={e.id} className={`expense-row${highlight?.id === e.id ? ' flash' : ''}`} data-expense={e.id}
                      onClick={() => setEditing({ kind: 'expense', item: { ...e }, isNew: false })}>
                      <span className="task-name"><strong>{e.name || 'Gasto'}</strong>
                        {e.labor && <span className="labor-tag" title={`${e.labor.personIds.length} personas · ${fmtShort(e.labor.from)} a ${fmtShort(e.labor.to)}`}>{e.labor.shifts} {e.labor.shifts === 1 ? 'jornada' : 'jornadas'} × {fmtEur(e.labor.rate)}</span>}
                        {e.description && <span className="muted desc">{e.description}</span>}</span>
                      <span className="muted">{e.date ? fmtShort(e.date) : ''}</span>
                      <span className="amount">{fmtEur(e.amount)}</span>
                      <span onClick={(ev) => ev.stopPropagation()}>
                        <button className={`inv-pill${e.invoiced ? ' on' : ''}`} title="Cambiar facturado / sin facturar"
                          onClick={() => patch('expense', e.id, { invoiced: !e.invoiced })}>{e.invoiced ? 'Facturado' : 'Sin facturar'}</button>
                      </span>
                      <span className="muted">{e.invoiceNumber ? `Fra. ${e.invoiceNumber}` : ''}</span>
                      <span onClick={(ev) => ev.stopPropagation()}>
                        {invoicesOf.get(e.id) ? (
                          <button className="link" title="Ver las facturas o partes de este gasto"
                            onClick={() => { const d = Object.values(docs).find((x) => x.expenseId === e.id); if (d) goTo('docs', 'doc', d.id); }}>
                            <Icon name="docs" size={13} /> {invoicesOf.get(e.id)} {invoicesOf.get(e.id) === 1 ? 'documento' : 'documentos'}
                          </button>
                        ) : null}
                      </span>
                      <span className="row-actions" onClick={(ev) => ev.stopPropagation()}>
                        <button className="row-action danger" title="Borrar gasto" onClick={async () => {
                          if (await backend.ask(`¿Borrar el gasto «${e.name || fmtEur(e.amount)}»?`)) delExpenseNow(e.id);
                        }}><Icon name="trash" size={15} /></button>
                      </span>
                    </div>
                  ))}
                  {!shown.length && <p className="group-empty muted">Sin gastos. Añade los gastos de este pedido para ver cuánto queda disponible.</p>}
                </div>
              )}
            </section>
          );
        })}
        {!list.length && <p className="group-empty muted">{Object.keys(orders).length ? 'Ningún pedido coincide con el filtro.' : 'Crea un pedido con su importe y ve añadiéndole gastos.'}</p>}
      </div>

      {editing?.kind === 'order' && <OrderDialog init={editing.item} isNew={editing.isNew} onClose={() => setEditing(null)} />}
      {editing?.kind === 'expense' && <ExpenseDialog init={editing.item} isNew={editing.isNew} onClose={() => setEditing(null)}
        onDelete={async () => { if (await backend.ask('¿Borrar este gasto?')) { delExpenseNow(editing.item.id); setEditing(null); } }} />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'bad' | 'ok' | 'warn' }) {
  return <div className={`stat${tone ? ` ${tone}` : ''}`}><span className="muted">{label}</span><strong>{fmtEur(value)}</strong></div>;
}
function Num({ label, v, tone, big }: { label: string; v: number; tone?: 'good' | 'bad' | 'ok' | 'warn'; big?: boolean }) {
  return <div className={`num${tone ? ` ${tone}` : ''}${big ? ' big' : ''}`}><span className="muted">{label}</span><span>{fmtEur(v)}</span></div>;
}
/** Barra del pedido: facturado (verde), gastado sin facturar (naranja) y lo que queda. */
function Bar({ t }: { t: OrderTotals }) {
  const base = Math.max(t.amount, t.spent, 1);
  const pct = (n: number) => `${Math.min(100, (n / base) * 100)}%`;
  return (
    <div className={`order-bar${t.available < 0 ? ' over' : ''}`} title={`${Math.round((t.spent / Math.max(t.amount, 1)) * 100)} % gastado`}>
      <span className="inv" style={{ width: pct(t.invoiced) }} /><span className="pend" style={{ width: pct(t.notInvoiced) }} />
    </div>
  );
}

/**
 * Importe. Con `base`, sale con ese valor de serie (p. ej. 1 € en un gasto nuevo): al pulsar
 * se vacía para escribir el de verdad y, si se deja vacío, vuelve a la base.
 */
function MoneyInput({ value, onChange, base }: { value: number; onChange: (n: number) => void; base?: number }) {
  const fmt = (n: number) => (n ? String(n).replace('.', ',') : '');
  const [text, setText] = useState(fmt(value));
  const [isBase, setIsBase] = useState(base !== undefined && value === base);
  const bad = text.trim() !== '' && parseMoney(text) === null;
  return <input inputMode="decimal" className={`${bad ? 'bad' : ''}${isBase ? ' base' : ''}`} value={text} placeholder="0,00 €"
    title={isBase ? 'Importe de base: pulsa para escribir el importe' : undefined}
    onFocus={() => { if (isBase) setText(''); }}
    onBlur={() => { if (base !== undefined && !text.trim()) { setText(fmt(base)); onChange(base); setIsBase(true); } }}
    onChange={(e) => { setIsBase(false); setText(e.target.value); const n = parseMoney(e.target.value); if (n !== null || !e.target.value.trim()) onChange(n ?? 0); }} />;
}

function OrderDialog({ init, isNew, onClose }: { init: Order; isNew: boolean; onClose: () => void }) {
  const [o, setO] = useState(init);
  const subs = useSubdivisions();
  const companies = useCompanies();
  const set = (c: Partial<Order>) => setO({ ...o, ...c });
  const save = () => { upsert('order', { ...o, number: o.number.trim(), name: o.name.trim() }); onClose(); };
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="dialog task-dialog" onSubmit={(e) => { e.preventDefault(); save(); }} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <h3>{isNew ? 'Nuevo pedido' : 'Editar pedido'}</h3>
        <div className="field-row">
          <label className="field">Nº de pedido<input autoFocus value={o.number} onChange={(e) => set({ number: e.target.value })} placeholder="PO-2026-014" /></label>
          <label className="field">Importe<MoneyInput value={o.amount} onChange={(amount) => set({ amount })} /></label>
        </div>
        <label className="field">Nombre<input value={o.name} onChange={(e) => set({ name: e.target.value })} placeholder="Cableado estructurado" /></label>
        <label className="field">Descripción<textarea rows={3} value={o.description} onChange={(e) => set({ description: e.target.value })} /></label>
        <div className="field-row">
          <label className="field">Proveedor<input value={o.supplier} onChange={(e) => set({ supplier: e.target.value })} /></label>
          <label className="field"><span>Fecha <span className="muted">(opcional)</span></span><input type="date" value={o.date ?? ''} onChange={(e) => set({ date: e.target.value || null })} /></label>
        </div>
        <div className="field-row">
          <label className="field">Subdivisión
            <select value={o.subdivisionId ?? ''} onChange={(e) => set({ subdivisionId: e.target.value || null })}>
              <option value="">Sin subdivisión</option>
              {subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <label className="field">Subcontrata <span className="muted">(opcional)</span>
            <select value={o.companyId ?? ''} aria-label="Subcontrata" onChange={(e) => {
              const id = e.target.value || null;
              const prev = companies.find((c) => c.id === o.companyId)?.name ?? '';
              const name = companies.find((c) => c.id === id)?.name ?? '';
              set({ companyId: id, ...(!o.supplier.trim() || o.supplier === prev ? { supplier: name } : {}) });
            }}>
              <option value="">Ninguna</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        </div>
        <div className="dialog-buttons">
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary" disabled={!o.number.trim() && !o.name.trim()}>{isNew ? 'Crear' : 'Guardar'}</button>
        </div>
      </form>
    </div>
  );
}

function ExpenseDialog({ init, isNew, onClose, onDelete }: { init: Expense; isNew: boolean; onClose: () => void; onDelete?: () => void }) {
  const [x, setX] = useState(init);
  const orders = useProject((s) => s.entities.order);
  const companies = useCompanies();
  const set = (c: Partial<Expense>) => setX((cur) => ({ ...cur, ...c }));
  const save = () => { upsert('expense', { ...x, name: x.name.trim() }); onClose(); };
  const order = orders[x.orderId];
  const orderList = Object.values(orders).sort((a, b) => a.number.localeCompare(b.number, 'es', { numeric: true }));
  const left = order ? orderTotals(order, Object.values(useProject.getState().entities.expense).filter((e) => e.orderId === order.id && e.id !== x.id)).available - x.amount : 0;
  const toLabor = () => {
    const companyId = order?.companyId ?? companies[0]?.id;
    if (!companyId) return;
    const d = new Date();
    const from = toDateStr(new Date(d.getFullYear(), d.getMonth(), 1)), to = toDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    set({ labor: { companyId, from, to, personIds: [], subdivisionId: null, rate: 0, shifts: 0 } });
  };
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className={`dialog task-dialog${x.labor ? ' labor-dialog' : ''}`} onSubmit={(e) => { e.preventDefault(); save(); }} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}>
        <h3>{isNew ? (x.labor ? 'Jornadas a un pedido' : 'Nuevo gasto') : 'Editar gasto'}</h3>
        <div className="segmented" role="radiogroup" aria-label="Tipo de gasto">
          <button type="button" className={!x.labor ? 'on' : ''} data-expense-kind="amount" onClick={() => { if (x.labor) set({ labor: null, ...(isNew ? { amount: 1 } : {}) }); }}>Importe</button>
          <button type="button" className={x.labor ? 'on' : ''} data-expense-kind="labor" disabled={!companies.length}
            title={companies.length ? 'Las jornadas de una subcontrata, a un precio por jornada y persona' : 'Añade antes una empresa en Equipo'} onClick={() => { if (!x.labor) toLabor(); }}>Jornadas de subcontrata</button>
        </div>
        <label className="field">Pedido
          {orderList.length ? (
            <select value={x.orderId} onChange={(e) => set({ orderId: e.target.value })} aria-label="Pedido">
              {!order && <option value="">Elige un pedido</option>}
              {orderList.map((o) => <option key={o.id} value={o.id}>{[o.number, o.name].filter(Boolean).join(' · ')}</option>)}
            </select>
          ) : <span className="muted">No hay pedidos todavía: crea uno en Gastos y vuelve a cargarle las jornadas.</span>}
        </label>
        {x.labor ? <LaborFields x={x} set={set} /> : (
          <div className="field-row">
            <label className="field">Nombre<input autoFocus value={x.name} onChange={(e) => set({ name: e.target.value })} placeholder="Bobinas UTP cat. 6A" /></label>
            <label className="field">Importe<MoneyInput value={x.amount} base={isNew ? 1 : undefined} onChange={(amount) => set({ amount })} /></label>
          </div>
        )}
        {x.labor && <label className="field">Nombre<input value={x.name} onChange={(e) => set({ name: e.target.value })} /></label>}
        <label className="field">Descripción<textarea rows={2} value={x.description} onChange={(e) => set({ description: e.target.value })} /></label>
        <div className="field-row">
          <label className="field"><span>Fecha <span className="muted">(opcional)</span></span><input type="date" value={x.date ?? ''} onChange={(e) => set({ date: e.target.value || null })} /></label>
          <label className="field">Nº de factura<input value={x.invoiceNumber} onChange={(e) => set({ invoiceNumber: e.target.value })} /></label>
        </div>
        <label className="check"><input type="checkbox" checked={x.invoiced} onChange={(e) => set({ invoiced: e.target.checked })} /> Facturado</label>
        {order && <p className={`muted${left < 0 ? ' late' : ''}`}>Disponible en el pedido después de este gasto: <strong>{fmtEur(left)}</strong></p>}
        <div className="dialog-buttons">
          {!isNew && onDelete && <button type="button" className="danger-text" onClick={onDelete}>Borrar</button>}
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary" disabled={!order || (x.labor ? !x.labor.shifts : !x.name.trim() && !x.amount)}>{isNew ? 'Añadir' : 'Guardar'}</button>
        </div>
      </form>
    </div>
  );
}

const toDateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Jornadas de una subcontrata: empresa, fechas y sitio; la gente con sus jornadas (las que
 * apuntaron en Calendario › Subcontratas), y el precio por jornada. El importe se calcula.
 */
function LaborFields({ x, set }: { x: Expense; set: (c: Partial<Expense>) => void }) {
  const l = x.labor!;
  const attendance = useProject((s) => s.entities.attendance);
  const peopleMap = useProject((s) => s.entities.person);
  const subsMap = useProject((s) => s.entities.subdivision);
  const companiesMap = useProject((s) => s.entities.company);
  const expenses = useProject((s) => s.entities.expense);
  const companies = useCompanies();
  const subs = useSubdivisions();
  const list = useMemo(() => shiftsIn(l, Object.values(attendance), peopleMap, subsMap), [l, attendance, peopleMap, subsMap]);
  const counts = useMemo(() => new Map(shiftsByPerson(list)), [list]);
  // Toda la gente de la empresa: primero los que tienen jornadas en esas fechas.
  const team = Object.values(peopleMap).filter((p) => p.companyId === l.companyId)
    .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || personLabel(a).localeCompare(personLabel(b), 'es'));
  const chosen = list.filter((a) => l.personIds.includes(a.personId));
  const twice = alreadyCharged(chosen, Object.values(expenses), x.id, peopleMap, subsMap);
  const shifts = chosen.length;
  const fresh = useRef(!l.personIds.length && !x.name);
  const lastAuto = useRef(x.name);

  // Mantener el importe y el nombre al día con lo elegido.
  useEffect(() => {
    const company = companiesMap[l.companyId]?.name ?? '';
    const auto = `Jornadas ${company} ${fmtShort(l.from)}–${fmtShort(l.to)}`;
    const changes: Partial<Expense> = {};
    if (l.shifts !== shifts) changes.labor = { ...l, shifts };
    if (x.amount !== laborAmount(l.rate, shifts)) changes.amount = laborAmount(l.rate, shifts);
    // El nombre sigue a la empresa y las fechas mientras no se haya cambiado a mano.
    if ((!x.name || x.name === lastAuto.current) && x.name !== auto) { changes.name = auto; lastAuto.current = auto; }
    if (Object.keys(changes).length) set(changes);
  });
  // Al cambiar de empresa o de fechas (o al abrir uno nuevo), se eligen todos los que tienen jornadas.
  const setL = (c: Partial<typeof l>, pickAll = false) => {
    const next = { ...l, ...c };
    if (pickAll) next.personIds = shiftsByPerson(shiftsIn(next, Object.values(attendance), peopleMap, subsMap)).map(([id]) => id);
    set({ labor: next });
  };
  useEffect(() => { if (fresh.current && !l.personIds.length && counts.size) setL({}, true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const toggle = (id: string, on: boolean) => setL({ personIds: on ? [...new Set([...l.personIds, id])] : l.personIds.filter((p) => p !== id) });

  return (
    <div className="labor">
      <div className="field-row">
        <label className="field">Empresa
          <select value={l.companyId} aria-label="Empresa" onChange={(e) => setL({ companyId: e.target.value }, true)}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="field">Sitio
          <select value={l.subdivisionId ?? ''} aria-label="Sitio" onChange={(e) => setL({ subdivisionId: e.target.value || null }, true)}>
            <option value="">Todos los sitios</option>
            {subs.filter((s) => !isGeneral(s)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      </div>
      <div className="field-row">
        <label className="field">Desde<input type="date" value={l.from} aria-label="Desde" onChange={(e) => e.target.value && setL({ from: e.target.value }, true)} /></label>
        <label className="field">Hasta<input type="date" value={l.to} aria-label="Hasta" onChange={(e) => e.target.value && setL({ to: e.target.value }, true)} /></label>
        <label className="field">€ por jornada y persona<MoneyInput value={l.rate} onChange={(rate) => setL({ rate })} /></label>
      </div>
      <div className="labor-people" aria-label="Personal">
        {team.map((p) => {
          const n = counts.get(p.id) ?? 0;
          return (
            <label key={p.id} className={`labor-person${n ? '' : ' none'}`} data-labor-person={p.id}>
              <input type="checkbox" checked={l.personIds.includes(p.id)} disabled={!n} onChange={(e) => toggle(p.id, e.target.checked)} />
              <span className="swatch round" style={{ background: p.color }} />
              <span className="name">{personLabel(p)}</span>
              <span className="muted">{n} {n === 1 ? 'jornada' : 'jornadas'}</span>
              <span className="amount">{n && l.personIds.includes(p.id) ? fmtEur(laborAmount(l.rate, n)) : ''}</span>
            </label>
          );
        })}
        {!team.length && <p className="muted">Esta empresa no tiene personal. Añádelo en Equipo.</p>}
        {team.length > 0 && !counts.size && <p className="muted">Nadie de esta empresa tiene jornadas apuntadas en esas fechas (Calendario › Subcontratas).</p>}
      </div>
      <div className="labor-total" data-labor-total>
        <span>{shifts} {shifts === 1 ? 'jornada' : 'jornadas'} × {fmtEur(l.rate)}</span>
        <strong>{fmtEur(laborAmount(l.rate, shifts))}</strong>
      </div>
      {twice.length > 0 && <p className="late small">Ojo: {twice.length} de estas jornadas ya {twice.length === 1 ? 'está cargada' : 'están cargadas'} en otro gasto.</p>}
    </div>
  );
}

/** Llevar las jornadas de una subcontrata a un pedido (desde Calendario › Subcontratas). */
export function LaborExpenseDialog({ companyId, from, to, subdivisionId, onClose }: { companyId: string; from: DateStr; to: DateStr; subdivisionId: string | null; onClose: () => void }) {
  const orders = Object.values(useProject.getState().entities.order);
  const company = useProject.getState().entities.company[companyId];
  const norm2 = (v: string) => norm(v.trim());
  const order = orders.find((o) => o.companyId === companyId) ?? orders.find((o) => company && norm2(o.supplier) === norm2(company.name)) ?? orders[0];
  const [init] = useState<Expense>(() => ({
    id: newId(), orderId: order?.id ?? '', name: '', description: '', amount: 0, date: to, invoiced: false, invoiceNumber: '', createdAt: Date.now(),
    labor: { companyId, from, to, personIds: [], subdivisionId, rate: 0, shifts: 0 },
  }));
  return <ExpenseDialog init={init} isNew onClose={onClose} />;
}

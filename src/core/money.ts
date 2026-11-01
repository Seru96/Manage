import type { Expense, Order } from './model';

const EUR = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
export const fmtEur = (n: number) => EUR.format(n);

/** Importe escrito a mano: «1.234,56», «1234,5», «1234.56», «1 234 €». Vacío o inválido → null. */
export function parseMoney(s: string): number | null {
  let v = s.replace(/[€\s]/g, '').trim();
  if (!v) return null;
  const lastComma = v.lastIndexOf(','), lastDot = v.lastIndexOf('.');
  if (lastComma > lastDot) v = v.replace(/\./g, '').replace(',', '.'); // 1.234,56
  else if (lastDot > lastComma && lastComma >= 0) v = v.replace(/,/g, ''); // 1,234.56
  else if (lastDot >= 0 && /^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, ''); // 1.234 (miles)
  const n = Number(v);
  return Number.isFinite(n) ? round2(n) : null;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export interface OrderTotals {
  amount: number;
  spent: number;
  /** Lo que queda del pedido (negativo si se ha pasado). */
  available: number;
  invoiced: number;
  notInvoiced: number;
  count: number;
}

export function orderTotals(order: Pick<Order, 'amount'>, expenses: Expense[]): OrderTotals {
  let spent = 0, invoiced = 0;
  for (const e of expenses) { spent += e.amount; if (e.invoiced) invoiced += e.amount; }
  return { amount: order.amount, spent: round2(spent), available: round2(order.amount - spent), invoiced: round2(invoiced), notInvoiced: round2(spent - invoiced), count: expenses.length };
}

export function sumTotals(list: OrderTotals[]): OrderTotals {
  const t = { amount: 0, spent: 0, available: 0, invoiced: 0, notInvoiced: 0, count: 0 };
  for (const x of list) for (const k of Object.keys(t) as (keyof OrderTotals)[]) t[k] += x[k];
  for (const k of Object.keys(t) as (keyof OrderTotals)[]) if (k !== 'count') t[k] = round2(t[k]);
  return t;
}

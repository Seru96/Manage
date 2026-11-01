import { describe, expect, it } from 'vitest';
import type { Expense } from './model';
import { orderTotals, parseMoney } from './money';

const exp = (amount: number, invoiced: boolean): Expense =>
  ({ id: String(amount), orderId: 'o', name: '', description: '', amount, date: null, invoiced, invoiceNumber: '', createdAt: 0 });

describe('dinero', () => {
  it('lee importes escritos de varias formas', () => {
    expect(parseMoney('1.234,56')).toBe(1234.56);
    expect(parseMoney('1234,5 €')).toBe(1234.5);
    expect(parseMoney('1234.56')).toBe(1234.56);
    expect(parseMoney('1,234.56')).toBe(1234.56);
    expect(parseMoney('12.000')).toBe(12000);
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
  });

  it('calcula lo disponible, lo facturado y lo pendiente de facturar', () => {
    expect(orderTotals({ amount: 1000 }, [exp(300, true), exp(250.1, false)])).toEqual(
      { amount: 1000, spent: 550.1, available: 449.9, invoiced: 300, notInvoiced: 250.1, count: 2 });
    expect(orderTotals({ amount: 100 }, [exp(150, false)]).available).toBe(-50);
  });
});

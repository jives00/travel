/** FX rate is captured at entry time and frozen — never re-converted later at a
 * different rate. `rate` is quote-per-base (1 base = `rate` quote). */
export function convert(amount: number, rate: number): number {
  return Math.round(amount * rate * 100) / 100;
}

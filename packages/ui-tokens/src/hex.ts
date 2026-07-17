/** "#2a78d6" -> "42 120 214" (space-separated RGB triple, for CSS custom properties
 * consumed as `rgb(var(--x-rgb) / <alpha-value>)` so Tailwind opacity modifiers work). */
export function hexToRgbTriple(hex: string): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

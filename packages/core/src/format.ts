/** One place for currency/distance/time formatting so a €40 dinner and a 300m walk
 * look the same on web and mobile — travel-feature-spec.md "Cross-cutting UX rules". */

export function formatCurrency(amount: number, currency: string, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
}

export function formatDistance(meters: number, unit: "km" | "mi"): string {
  if (unit === "mi") {
    const miles = meters / 1609.34;
    return miles < 0.1 ? `${Math.round(meters * 3.28084)} ft` : `${miles.toFixed(1)} mi`;
  }
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

export function formatTime(hhmm: string, locale = "en-US"): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(Date.UTC(2000, 0, 1, h, m));
  return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(d);
}

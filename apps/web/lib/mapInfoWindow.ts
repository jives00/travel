// Shared by both map-rendering components (the standalone /map page and the
// trip page's sidebar map) — builds the InfoWindow content shown on marker
// click, styled to match what Google Maps itself shows for a place: name,
// address, and a "View on Google Maps" deep link.

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function googleMapsUrl(opts: {
  name: string;
  address?: string | null;
  lat: number;
  lng: number;
  googlePlaceId?: string | null;
}): string {
  // URLSearchParams encodes values itself — don't encodeURIComponent() first,
  // or the comma in "lat,lng" gets double-encoded (%2C -> %252C), which is
  // what made Google Maps report it couldn't find the (garbled) query.
  //
  // Prefer searching by name+address text over raw "lat,lng" whenever we
  // have it (e.g. hotels, which have no googlePlaceId) — a coordinate query
  // just drops a generic pin at that point instead of resolving to the
  // actual business, even when it's the exact spot the business sits at.
  const query = opts.googlePlaceId
    ? opts.name
    : opts.address
      ? `${opts.name}, ${opts.address}`
      : `${opts.lat},${opts.lng}`;
  const params = new URLSearchParams({ api: "1", query });
  if (opts.googlePlaceId) params.set("query_place_id", opts.googlePlaceId);
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

export function infoWindowHtml(opts: {
  name: string;
  address?: string | null;
  lat: number;
  lng: number;
  googlePlaceId?: string | null;
}): string {
  const name = escapeHtml(opts.name);
  const address = opts.address ? `<div style="color:#5f6368;font-size:13px;">${escapeHtml(opts.address)}</div>` : "";
  const link = googleMapsUrl(opts);
  return `
    <div style="font-family:Roboto,Arial,sans-serif;max-width:220px;padding:2px;">
      <div style="font-weight:600;font-size:14px;color:#202124;margin-bottom:2px;">${name}</div>
      ${address}
      <a href="${link}" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:6px;color:#1a73e8;font-size:13px;text-decoration:none;">View on Google Maps</a>
    </div>
  `;
}

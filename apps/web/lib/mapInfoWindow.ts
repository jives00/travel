// Shared by both map-rendering components (the standalone /map page and the
// trip page's sidebar map) — builds the InfoWindow content shown on marker
// click, styled to match what Google Maps itself shows for a place: name,
// address, and a "View on Google Maps" deep link.
//
// The URL builder itself lives in @travel/core, since mobile links out to Maps
// from its detail sheets too.

import { googleMapsUrl } from "@travel/core";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
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

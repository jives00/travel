"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Place, PlaceTag } from "@travel/types";
import { PLACE_TAGS, suggestPrimaryTagFromGoogleTypes } from "@travel/core";
import type { AutocompleteSuggestion, PlaceDetails } from "@travel/api-client";
import { travelApi } from "@/lib/api";

interface PlacePreview {
  details: PlaceDetails;
  name: string;
  primaryTag: PlaceTag | "";
  // Defaults to Google's photo but overridable — lets a pasted URL win over
  // whatever (if anything) Google returned.
  heroPhotoUrl: string;
}

// Same shape as PlacePreview's editable fields, minus everything only Google
// can supply (rating, hours, website) — plus lat/lng/address as plain inputs
// since there's no Places lookup to source them from.
interface ManualPlaceForm {
  name: string;
  primaryTag: PlaceTag | "";
  address: string;
  lat: string;
  lng: string;
  heroPhotoUrl: string;
}

const EMPTY_MANUAL_FORM: ManualPlaceForm = { name: "", primaryTag: "", address: "", lat: "", lng: "", heroPhotoUrl: "" };

export interface AutocompleteSearchHandle {
  save: () => void;
  cancel: () => void;
}

export interface AutocompleteSearchState {
  hasPreview: boolean;
  canSave: boolean;
  saving: boolean;
}

export const AutocompleteSearch = forwardRef<
  AutocompleteSearchHandle,
  {
    tripId?: number;
    onCreated: (place: Place) => void;
    // When set, the caller drives Save/Cancel itself (e.g. from a modal's
    // bottom action bar) via the ref and onStateChange, instead of this
    // component rendering its own inline footer.
    hideActions?: boolean;
    onStateChange?: (state: AutocompleteSearchState | null) => void;
    autoFocus?: boolean;
  }
>(function AutocompleteSearch({ tripId, onCreated, hideActions, onStateChange, autoFocus }, ref) {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [duplicateNotice, setDuplicateNotice] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [picking, setPicking] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [preview, setPreview] = useState<PlacePreview | null>(null);
  const [manual, setManual] = useState<ManualPlaceForm | null>(null);
  const [saving, setSaving] = useState(false);
  // One session token per typing session — reset after a selection is made, so
  // a whole session bills as one Autocomplete session, not one per keystroke.
  const sessionToken = useRef(crypto.randomUUID());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (input.trim().length < 3) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await travelApi.places.autocomplete(input, sessionToken.current);
        setSuggestions(results);
        setHighlighted(-1);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [input]);

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && highlighted >= 0) {
      e.preventDefault();
      pick(suggestions[highlighted]);
    }
  }

  async function pick(suggestion: AutocompleteSuggestion) {
    setDuplicateNotice(null);
    setPicking(true);
    try {
      const details = await travelApi.places.autocompleteDetails(suggestion.placeId, sessionToken.current);
      setSuggestions([]);
      const suggestedPrimary = suggestPrimaryTagFromGoogleTypes(details.googleTypes) as PlaceTag | undefined;
      setPreview({
        details,
        name: details.name,
        primaryTag: suggestedPrimary ?? "",
        heroPhotoUrl: details.heroPhotoUrl ?? "",
      });
    } finally {
      setPicking(false);
    }
  }

  function setPrimaryTag(tag: PlaceTag | "") {
    if (!preview) return;
    setPreview({ ...preview, primaryTag: tag });
  }

  function cancelPreview() {
    setPreview(null);
    setInput("");
    sessionToken.current = crypto.randomUUID(); // abandoning this session — fresh token for the next search
  }

  async function savePreview() {
    if (!preview || !preview.primaryTag) return;
    setSaving(true);
    try {
      const { details } = preview;
      const result = await travelApi.places.create({
        googlePlaceId: details.placeId,
        name: preview.name.trim() || details.name,
        primaryTag: preview.primaryTag,
        address: details.address ?? undefined,
        lat: details.lat,
        lng: details.lng,
        hours: details.hours ?? undefined,
        heroPhotoUrl: preview.heroPhotoUrl.trim() || undefined,
        description: details.description ?? undefined,
        rating: details.rating ?? undefined,
        userRatingsTotal: details.userRatingsTotal ?? undefined,
        website: details.website ?? undefined,
        googleTypes: details.googleTypes ?? undefined,
        tripId,
      });
      let place: Place;
      if ("duplicate" in result) {
        setDuplicateNotice(`"${result.existing.name}" is already in your library.`);
        place = result.existing;
      } else {
        place = result;
      }
      setPreview(null);
      setInput("");
      sessionToken.current = crypto.randomUUID(); // fresh session for the next search
      onCreated(place);
    } finally {
      setSaving(false);
    }
  }

  function startManual() {
    setDuplicateNotice(null);
    setManual(EMPTY_MANUAL_FORM);
  }

  function cancelManual() {
    setManual(null);
  }

  function setManualPrimaryTag(tag: PlaceTag | "") {
    if (!manual) return;
    setManual({ ...manual, primaryTag: tag });
  }

  const manualLat = manual ? Number(manual.lat) : NaN;
  const manualLng = manual ? Number(manual.lng) : NaN;
  const canSaveManual = !!manual && manual.name.trim().length > 0 && !!manual.primaryTag && manual.lat.trim() !== "" && manual.lng.trim() !== "" && !Number.isNaN(manualLat) && !Number.isNaN(manualLng);

  async function saveManual() {
    if (!manual || !canSaveManual) return;
    setSaving(true);
    try {
      const result = await travelApi.places.create({
        name: manual.name.trim(),
        primaryTag: manual.primaryTag as PlaceTag,
        address: manual.address.trim() || undefined,
        lat: manualLat,
        lng: manualLng,
        heroPhotoUrl: manual.heroPhotoUrl.trim() || undefined,
        tripId,
      });
      let place: Place;
      if ("duplicate" in result) {
        setDuplicateNotice(`"${result.existing.name}" is already in your library.`);
        place = result.existing;
      } else {
        place = result;
      }
      setManual(null);
      onCreated(place);
    } finally {
      setSaving(false);
    }
  }

  useImperativeHandle(ref, () => ({
    save: () => {
      if (manual) saveManual();
      else savePreview();
    },
    cancel: () => {
      if (manual) cancelManual();
      else cancelPreview();
    },
  }));

  useEffect(() => {
    if (preview) onStateChange?.({ hasPreview: true, canSave: !!preview.primaryTag, saving });
    else if (manual) onStateChange?.({ hasPreview: true, canSave: canSaveManual, saving });
    else onStateChange?.(null);
  }, [preview, manual, canSaveManual, saving]);

  if (manual) {
    return (
      <div className="space-y-3 rounded border border-category-transit bg-surface p-4">
        <input
          className="w-full rounded border border-gridline bg-transparent p-2 font-medium text-text-primary"
          placeholder="Name"
          value={manual.name}
          onChange={(e) => setManual({ ...manual, name: e.target.value })}
        />
        <input
          className="w-full rounded border border-gridline bg-transparent p-2 text-sm text-text-secondary"
          placeholder="Address (optional)"
          value={manual.address}
          onChange={(e) => setManual({ ...manual, address: e.target.value })}
        />
        {manual.heroPhotoUrl && (
          <img src={manual.heroPhotoUrl} alt={manual.name} className="h-32 w-full rounded object-cover" />
        )}
        <input
          className="w-full rounded border border-gridline bg-transparent p-2 text-sm text-text-secondary"
          placeholder="Photo URL (optional)"
          value={manual.heroPhotoUrl}
          onChange={(e) => setManual({ ...manual, heroPhotoUrl: e.target.value })}
        />

        <div>
          <label className="block text-xs font-medium text-text-muted">Primary</label>
          <select
            className="mt-1 w-full rounded border border-gridline bg-transparent p-2 text-text-primary"
            value={manual.primaryTag}
            onChange={(e) => setManualPrimaryTag(e.target.value as PlaceTag | "")}
          >
            <option value="" disabled>
              Choose a primary tag…
            </option>
            {PLACE_TAGS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <input
            className="w-1/2 rounded border border-gridline bg-transparent p-2 text-text-primary"
            placeholder="Latitude"
            value={manual.lat}
            onChange={(e) => setManual({ ...manual, lat: e.target.value })}
          />
          <input
            className="w-1/2 rounded border border-gridline bg-transparent p-2 text-text-primary"
            placeholder="Longitude"
            value={manual.lng}
            onChange={(e) => setManual({ ...manual, lng: e.target.value })}
          />
        </div>

        {duplicateNotice && <p className="text-sm text-status-warning">{duplicateNotice}</p>}

        {!hideActions && (
          <div className="flex gap-2 border-t border-gridline pt-3">
            <button
              onClick={saveManual}
              disabled={saving || !canSaveManual}
              className="rounded bg-category-transit px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save place"}
            </button>
            <button onClick={cancelManual} className="text-sm text-text-secondary">
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  }

  if (preview) {
    return (
      <div className="space-y-3 rounded border border-category-transit bg-surface p-4">
        {preview.heroPhotoUrl && (
          <img src={preview.heroPhotoUrl} alt={preview.name} className="h-32 w-full rounded object-cover" />
        )}
        <input
          className="w-full rounded border border-gridline bg-transparent p-2 text-sm text-text-secondary"
          placeholder="Photo URL (optional)"
          value={preview.heroPhotoUrl}
          onChange={(e) => setPreview({ ...preview, heroPhotoUrl: e.target.value })}
        />
        <input
          className="w-full rounded border border-gridline bg-transparent p-2 font-medium text-text-primary"
          value={preview.name}
          onChange={(e) => setPreview({ ...preview, name: e.target.value })}
        />
        {preview.details.address && <p className="text-sm text-text-secondary">{preview.details.address}</p>}

        <div>
          <label className="block text-xs font-medium text-text-muted">Primary</label>
          <select
            className="mt-1 w-full rounded border border-gridline bg-transparent p-2 text-text-primary"
            value={preview.primaryTag}
            onChange={(e) => setPrimaryTag(e.target.value as PlaceTag | "")}
          >
            <option value="" disabled>
              Choose a primary tag…
            </option>
            {PLACE_TAGS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        {preview.details.description && <p className="text-sm text-text-secondary">{preview.details.description}</p>}

        <div className="flex items-center gap-3 text-sm text-text-muted">
          {preview.details.rating != null && (
            <span>
              ★ {preview.details.rating.toFixed(1)}
              {preview.details.userRatingsTotal != null && ` (${preview.details.userRatingsTotal.toLocaleString()})`}
            </span>
          )}
          {preview.details.website && (
            <a href={preview.details.website} target="_blank" rel="noreferrer" className="text-category-transit hover:underline">
              Website ↗
            </a>
          )}
        </div>

        {!hideActions && (
          <div className="flex gap-2 border-t border-gridline pt-3">
            <button
              onClick={savePreview}
              disabled={saving || !preview.primaryTag}
              className="rounded bg-category-transit px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save place"}
            </button>
            <button onClick={cancelPreview} className="text-sm text-text-secondary">
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        className="w-full rounded border border-gridline bg-transparent p-2 text-text-primary disabled:opacity-50"
        placeholder="Search Google Places…"
        value={input}
        disabled={picking}
        autoFocus={autoFocus}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onInputKeyDown}
      />
      {searching && <p className="mt-1 text-xs text-text-muted">Searching…</p>}
      {picking && <p className="mt-1 text-xs text-text-muted">Loading details…</p>}
      {duplicateNotice && <p className="mt-1 text-sm text-status-warning">{duplicateNotice}</p>}
      {suggestions.length > 0 && !picking && (
        <ul className="absolute z-10 mt-1 w-full rounded border border-gridline bg-surface shadow-lg">
          {suggestions.map((s, i) => (
            <li key={s.placeId}>
              <button
                onClick={() => pick(s)}
                onMouseEnter={() => setHighlighted(i)}
                className={`w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-category-transit/10 ${
                  i === highlighted ? "bg-category-transit/10" : ""
                }`}
              >
                {s.text}
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={startManual} className="mt-1 text-xs text-text-muted hover:text-text-primary">
        Can't find it? Add it manually
      </button>
    </div>
  );
});

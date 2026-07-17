"use client";

import { useEffect, useRef, useState } from "react";
import type { Booking, BookingType, CreateBookingBody } from "@travel/types";
import type { AutocompleteSuggestion } from "@travel/api-client";
import { travelApi } from "@/lib/api";

export const BOOKING_TYPES: { value: BookingType; label: string }[] = [
  { value: "flight", label: "Flight" },
  { value: "hotel", label: "Hotel" },
  { value: "train", label: "Train" },
  { value: "car", label: "Car" },
  { value: "restaurant", label: "Restaurant" },
  { value: "event", label: "Event" },
  { value: "activity", label: "Tour / Activity" },
];

export interface BookingFormState {
  type: BookingType;
  title: string;
  confirmationCode: string;
  flightNumber: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  price: string;
  currency: string;
  legId: string;
  placeId: string;
  address: string;
  lat: string;
  lng: string;
  notes: string;
}

export const EMPTY_FORM: BookingFormState = {
  type: "flight",
  title: "",
  confirmationCode: "",
  flightNumber: "",
  startDate: "",
  startTime: "",
  endDate: "",
  endTime: "",
  price: "",
  currency: "",
  legId: "",
  placeId: "",
  address: "",
  lat: "",
  lng: "",
  notes: "",
};

function combineDateTime(date: string, time: string): string | undefined {
  if (!date) return undefined;
  return `${date}T${time || "00:00"}:00`;
}

export function formToBody(form: BookingFormState): CreateBookingBody {
  return {
    type: form.type,
    title: form.title.trim(),
    confirmationCode: form.confirmationCode.trim() || undefined,
    flightNumber: form.type === "flight" ? form.flightNumber.trim() || undefined : undefined,
    startAt: combineDateTime(form.startDate, form.startTime),
    endAt: combineDateTime(form.endDate, form.endTime),
    price: form.price ? Number(form.price) : undefined,
    currency: form.currency.trim() || undefined,
    legId: form.legId ? Number(form.legId) : undefined,
    // Hotels get a direct address/lat/lng (via autocomplete) instead of a
    // library-place link — the two are mutually exclusive per booking.
    placeId: form.type === "hotel" ? undefined : form.placeId ? Number(form.placeId) : undefined,
    address: form.type === "hotel" ? form.address.trim() || undefined : undefined,
    lat: form.type === "hotel" && form.lat ? Number(form.lat) : undefined,
    lng: form.type === "hotel" && form.lng ? Number(form.lng) : undefined,
    notes: form.notes.trim() || undefined,
  };
}

export function bookingToForm(booking: Booking): BookingFormState {
  const startTime = booking.startAt?.slice(11, 16) ?? "";
  const endTime = booking.endAt?.slice(11, 16) ?? "";
  return {
    type: booking.type,
    title: booking.title,
    confirmationCode: booking.confirmationCode ?? "",
    flightNumber: booking.flightNumber ?? "",
    startDate: booking.startAt?.slice(0, 10) ?? "",
    startTime: startTime === "00:00" ? "" : startTime,
    endDate: booking.endAt?.slice(0, 10) ?? "",
    endTime: endTime === "00:00" ? "" : endTime,
    price: booking.price != null ? String(booking.price) : "",
    currency: booking.currency ?? "",
    legId: booking.legId != null ? String(booking.legId) : "",
    placeId: booking.placeId != null ? String(booking.placeId) : "",
    address: booking.address ?? "",
    lat: booking.lat != null ? String(booking.lat) : "",
    lng: booking.lng != null ? String(booking.lng) : "",
    notes: booking.notes ?? "",
  };
}

// Same Google Places autocomplete flow as the places autocomplete, but fills
// the booking's own address/lat/lng directly instead of creating or linking a
// library Place — for a hotel, forcing a Place record just to store its
// address is unwanted overhead.
function HotelAddressSearch({ form, onChange }: { form: BookingFormState; onChange: (form: BookingFormState) => void }) {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [picking, setPicking] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
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
    setPicking(true);
    try {
      const details = await travelApi.places.autocompleteDetails(suggestion.placeId, sessionToken.current);
      onChange({
        ...form,
        title: form.title.trim() || details.name,
        address: details.address ?? "",
        lat: String(details.lat),
        lng: String(details.lng),
      });
      setInput("");
      setSuggestions([]);
      sessionToken.current = crypto.randomUUID();
    } finally {
      setPicking(false);
    }
  }

  return (
    <div className="relative">
      <input
        className="w-full rounded border border-gridline bg-transparent p-2 text-text-primary disabled:opacity-50"
        placeholder="Search hotel address…"
        value={input}
        disabled={picking}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onInputKeyDown}
      />
      {searching && <p className="mt-1 text-xs text-text-muted">Searching…</p>}
      {picking && <p className="mt-1 text-xs text-text-muted">Loading…</p>}
      {suggestions.length > 0 && !picking && (
        <ul className="absolute z-10 mt-1 w-full rounded border border-gridline bg-surface shadow-lg">
          {suggestions.map((s, i) => (
            <li key={s.placeId}>
              <button
                type="button"
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
      {form.address && <p className="mt-1 text-xs text-text-muted">{form.address}</p>}
    </div>
  );
}

export function BookingFields({
  form,
  onChange,
  legOptions,
  placeOptions,
}: {
  form: BookingFormState;
  onChange: (form: BookingFormState) => void;
  legOptions: { id: number; city: string }[];
  placeOptions: { id: number; name: string }[];
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <select
          className="rounded border border-gridline bg-transparent p-2 text-text-primary"
          value={form.type}
          onChange={(e) => onChange({ ...form, type: e.target.value as BookingType })}
        >
          {BOOKING_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          className="flex-1 rounded border border-gridline bg-transparent p-2 text-text-primary"
          placeholder="Title (e.g. UA 118 to Madrid, Hotel Alfonso)"
          value={form.title}
          onChange={(e) => onChange({ ...form, title: e.target.value })}
        />
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 rounded border border-gridline bg-transparent p-2 text-text-primary"
          placeholder="Confirmation code"
          value={form.confirmationCode}
          onChange={(e) => onChange({ ...form, confirmationCode: e.target.value })}
        />
        {form.type === "flight" && (
          <input
            className="flex-1 rounded border border-gridline bg-transparent p-2 text-text-primary"
            placeholder="Flight number"
            value={form.flightNumber}
            onChange={(e) => onChange({ ...form, flightNumber: e.target.value })}
          />
        )}
      </div>

      <div className="flex gap-2">
        <label className="flex-1 text-xs text-text-muted">
          Start date
          <input
            type="date"
            className="w-full rounded border border-gridline bg-transparent p-1 text-text-primary"
            value={form.startDate}
            onChange={(e) => onChange({ ...form, startDate: e.target.value })}
          />
        </label>
        <label className="flex-1 text-xs text-text-muted">
          Start time (optional)
          <input
            type="time"
            className="w-full rounded border border-gridline bg-transparent p-1 text-text-primary"
            value={form.startTime}
            onChange={(e) => onChange({ ...form, startTime: e.target.value })}
          />
        </label>
      </div>
      <div className="flex gap-2">
        <label className="flex-1 text-xs text-text-muted">
          End date
          <input
            type="date"
            className="w-full rounded border border-gridline bg-transparent p-1 text-text-primary"
            value={form.endDate}
            onChange={(e) => onChange({ ...form, endDate: e.target.value })}
          />
        </label>
        <label className="flex-1 text-xs text-text-muted">
          End time (optional)
          <input
            type="time"
            className="w-full rounded border border-gridline bg-transparent p-1 text-text-primary"
            value={form.endTime}
            onChange={(e) => onChange({ ...form, endTime: e.target.value })}
          />
        </label>
      </div>

      <div className="flex gap-2">
        <input
          className="w-1/2 rounded border border-gridline bg-transparent p-2 text-text-primary"
          placeholder="Price"
          value={form.price}
          onChange={(e) => onChange({ ...form, price: e.target.value })}
        />
        <input
          className="w-1/2 rounded border border-gridline bg-transparent p-2 text-text-primary"
          placeholder="Currency (e.g. USD)"
          value={form.currency}
          onChange={(e) => onChange({ ...form, currency: e.target.value.toUpperCase() })}
          maxLength={3}
        />
      </div>

      <div className="flex gap-2">
        <select
          className="flex-1 rounded border border-gridline bg-transparent p-2 text-text-primary"
          value={form.legId}
          onChange={(e) => onChange({ ...form, legId: e.target.value })}
        >
          <option value="">No city</option>
          {legOptions.map((l) => (
            <option key={l.id} value={l.id}>
              {l.city}
            </option>
          ))}
        </select>
        {form.type !== "hotel" && (
          <select
            className="flex-1 rounded border border-gridline bg-transparent p-2 text-text-primary"
            value={form.placeId}
            onChange={(e) => onChange({ ...form, placeId: e.target.value })}
          >
            <option value="">No linked place</option>
            {placeOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {form.type === "hotel" && <HotelAddressSearch form={form} onChange={onChange} />}

      <textarea
        className="w-full rounded border border-gridline bg-transparent p-2 text-text-primary"
        placeholder="Notes"
        value={form.notes}
        onChange={(e) => onChange({ ...form, notes: e.target.value })}
      />
    </div>
  );
}

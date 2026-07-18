import { useState } from "react";
import { View, Text } from "react-native";
import type { BookingType, CreateBookingBody, Leg } from "@travel/types";
import { BOOKING_TYPES, enumLabel } from "@travel/core";
import { useCreateBooking } from "../lib/offlineMutations/bookings";
import { TextField, Button, SegmentedControl } from "./ui";

const TYPE_SEGMENTS = BOOKING_TYPES.map((t) => ({ value: t.key as BookingType, label: t.label }));

function combine(date: string, time: string): string | undefined {
  if (!date.trim()) return undefined;
  return `${date.trim()}T${time.trim() || "00:00"}:00`;
}

/** Create a booking. Port of web's booking-fields.tsx essentials (type, title,
 * dates/times, confirmation, price, notes, leg). Hotel-address autocomplete is
 * deferred; a booking can still carry a typed address later via edit. */
export function BookingForm({
  tripId,
  legs,
  defaultLegId,
  onSaved,
}: {
  tripId: number;
  legs: Leg[];
  defaultLegId?: number | null;
  onSaved: () => void;
}) {
  const createBooking = useCreateBooking(tripId);
  const [type, setType] = useState<BookingType>("flight");
  const [title, setTitle] = useState("");
  const [confirmationCode, setConfirmation] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("");
  const [legId, setLegId] = useState<number | null>(defaultLegId ?? null);

  function save() {
    if (!title.trim()) return;
    const body: CreateBookingBody = {
      type,
      title: title.trim(),
      confirmationCode: confirmationCode.trim() || undefined,
      startAt: combine(startDate, startTime),
      endAt: combine(endDate, endTime),
      price: price.trim() ? Number(price) : undefined,
      currency: currency.trim().length === 3 ? currency.trim().toUpperCase() : undefined,
      legId: legId ?? undefined,
    };
    createBooking.create(body);
    onSaved();
  }

  return (
    <View>
      <Text className="mb-1 text-sm text-text-secondary dark:text-text-secondary-dark">Type</Text>
      <SegmentedControl className="mb-3" segments={TYPE_SEGMENTS} value={type} onChange={setType} />

      <TextField className="mb-3" label="Title" value={title} onChangeText={setTitle} placeholder="e.g. BA 487 to Barcelona" />
      <TextField className="mb-3" label="Confirmation code" value={confirmationCode} onChangeText={setConfirmation} autoCapitalize="characters" />

      <View className="mb-3 flex-row gap-2">
        <TextField className="flex-1" label="Start date" value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" />
        <TextField className="flex-1" label="Start time" value={startTime} onChangeText={setStartTime} placeholder="HH:mm" />
      </View>
      <View className="mb-3 flex-row gap-2">
        <TextField className="flex-1" label="End date" value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" />
        <TextField className="flex-1" label="End time" value={endTime} onChangeText={setEndTime} placeholder="HH:mm" />
      </View>

      <View className="mb-3 flex-row gap-2">
        <TextField className="flex-1" label="Price" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
        <TextField className="flex-1" label="Currency" value={currency} onChangeText={setCurrency} autoCapitalize="characters" maxLength={3} placeholder="EUR" />
      </View>

      {legs.length > 0 && (
        <>
          <Text className="mb-1 text-sm text-text-secondary dark:text-text-secondary-dark">City (optional)</Text>
          <SegmentedControl
            className="mb-4"
            segments={[{ value: "none", label: "None" }, ...legs.map((l) => ({ value: String(l.id), label: l.city }))]}
            value={legId == null ? "none" : String(legId)}
            onChange={(v) => setLegId(v === "none" ? null : Number(v))}
          />
        </>
      )}

      <Button title="Save booking" onPress={save} loading={createBooking.isPending} disabled={!title.trim()} />
    </View>
  );
}

import { useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import {
  dateToHm,
  dateToYmd,
  formatTime,
  formatYmdLabel,
  hmToDate,
  isValidHm,
  wallClockToDate,
} from "@travel/core";
import { Button } from "./Button";
import { Sheet } from "./Sheet";

/** Native date and time pickers, replacing the hand-typed "YYYY-MM-DD" /
 * "HH:mm" TextFields these forms used to carry. Web gets these free from
 * `<input type="date">`; the phone is the only place a date was typed on a
 * keyboard, and typed input is also the only way a malformed date ever reached
 * the API.
 *
 * Both keep the app's stored string as their value — `""` means unset — and
 * convert through `@travel/core`'s wallClock helpers, which read and write a
 * Date's *local* calendar fields. Never let an ISO instant near these: stored
 * datetimes are wall clock at the event's location, so a UTC round-trip shifts
 * every event by the device's offset.
 *
 * **Empty is a real value, not 00:00.** Midnight means "no time set" to the
 * booking form and to `googleCalendarUrl` (which turns it into an all-day
 * span), so a time picker that defaulted to 00:00 would silently declare every
 * timed event all-day. Hence the Clear affordance on both, and hence
 * TimeField's picker opening at a sensible hour rather than at midnight.
 *
 * Android opens the platform dialog imperatively (`DateTimePickerAndroid`),
 * which is what the library recommends and what renders correctly above a
 * Sheet — Sheet is a `Modal`, and a *declarative* picker inside one is the
 * fragile arrangement. iOS has no imperative API, so it gets the spinner inside
 * our own Sheet with an explicit Done. */

function FieldShell({
  label,
  text,
  placeholder,
  onPress,
  onClear,
  className,
}: {
  label?: string;
  text: string | null;
  placeholder: string;
  onPress: () => void;
  onClear?: () => void;
  className?: string;
}) {
  return (
    <View className={className}>
      {label ? (
        <Text className="mb-1 text-sm text-text-secondary dark:text-text-secondary-dark">{label}</Text>
      ) : null}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label ?? placeholder}: ${text ?? "not set"}`}
        className="flex-row items-center justify-between rounded border border-gridline bg-surface p-2.5 dark:border-gridline-dark dark:bg-surface-dark"
      >
        <Text
          numberOfLines={1}
          className={
            text ? "flex-1 text-text-primary dark:text-text-primary-dark" : "flex-1 text-text-muted"
          }
        >
          {text ?? placeholder}
        </Text>
        {text && onClear ? (
          // hitSlop because the glyph itself is a smaller tap target than the
          // 44pt minimum, and it sits right beside the field's own press area.
          <Pressable onPress={onClear} hitSlop={12} accessibilityLabel={`Clear ${label ?? placeholder}`}>
            <Text className="pl-2 text-text-muted">✕</Text>
          </Pressable>
        ) : (
          <Text className="pl-2 text-text-muted">▾</Text>
        )}
      </Pressable>
    </View>
  );
}

export function DateField({
  label,
  value,
  onChange,
  placeholder = "Pick a date",
  className,
}: {
  label?: string;
  /** "YYYY-MM-DD", or "" for unset. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [iosOpen, setIosOpen] = useState(false);
  // A malformed stored value falls back to today rather than opening the picker
  // on Invalid Date.
  const current = wallClockToDate(value) ?? new Date();

  function open() {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: current,
        mode: "date",
        onChange: (event, picked) => {
          if (event.type === "set" && picked) onChange(dateToYmd(picked));
        },
      });
    } else {
      setIosOpen(true);
    }
  }

  return (
    <>
      <FieldShell
        className={className}
        label={label}
        text={value ? formatYmdLabel(value) : null}
        placeholder={placeholder}
        onPress={open}
        onClear={() => onChange("")}
      />
      {Platform.OS === "ios" && iosOpen ? (
        <Sheet
          visible
          onClose={() => setIosOpen(false)}
          footer={<Button title="Done" onPress={() => setIosOpen(false)} />}
        >
          <DateTimePicker
            value={current}
            mode="date"
            display="spinner"
            onChange={(_, picked) => picked && onChange(dateToYmd(picked))}
          />
        </Sheet>
      ) : null}
    </>
  );
}

/** Opened-at default when no time is set. Not midnight — see the note above on
 * why 00:00 is a meaningful value here rather than a neutral starting point. */
const DEFAULT_HOUR = 9;

export function TimeField({
  label,
  value,
  onChange,
  placeholder = "No time",
  className,
}: {
  label?: string;
  /** "HH:mm" (24h), or "" for unset. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [iosOpen, setIosOpen] = useState(false);
  const fallback = new Date();
  fallback.setHours(DEFAULT_HOUR, 0, 0, 0);
  const current = hmToDate(value, fallback);

  function open() {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: current,
        mode: "time",
        is24Hour: false,
        onChange: (event, picked) => {
          if (event.type === "set" && picked) onChange(dateToHm(picked));
        },
      });
    } else {
      setIosOpen(true);
    }
  }

  return (
    <>
      <FieldShell
        className={className}
        label={label}
        text={isValidHm(value) ? formatTime(value) : null}
        placeholder={placeholder}
        onPress={open}
        onClear={() => onChange("")}
      />
      {Platform.OS === "ios" && iosOpen ? (
        <Sheet
          visible
          onClose={() => setIosOpen(false)}
          footer={<Button title="Done" onPress={() => setIosOpen(false)} />}
        >
          <DateTimePicker
            value={current}
            mode="time"
            display="spinner"
            onChange={(_, picked) => picked && onChange(dateToHm(picked))}
          />
        </Sheet>
      ) : null}
    </>
  );
}

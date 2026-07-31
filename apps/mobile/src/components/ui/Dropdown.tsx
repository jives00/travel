import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Sheet } from "./Sheet";

export interface DropdownOption<T> {
  value: T;
  label: string;
}

/** Tap-to-open picker: a labelled field showing the current selection, backed
 * by a sheet of options. The counterpart to SegmentedControl — use this when
 * the option list is long or open-ended (cities, linked places) and a row of
 * pills would wrap into an unreadable block, and SegmentedControl when there
 * are a few fixed choices worth showing at a glance.
 *
 * Safe to render inside another Sheet (the booking/place detail forms do
 * exactly that) — Sheet is a Modal, and Modals stack. */
export function Dropdown<T extends string | number | null>({
  label,
  value,
  options,
  onChange,
  placeholder = "—",
  className,
}: {
  label: string;
  value: T;
  options: DropdownOption<T>[];
  onChange: (value: T) => void;
  /** Shown when `value` matches no option. */
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View className={className}>
      <Text className="mb-1 text-xs font-medium text-text-muted">{label}</Text>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel={`${label}: ${selected?.label ?? placeholder}`}
        className="flex-row items-center justify-between rounded border border-gridline bg-surface p-2.5 dark:border-gridline-dark dark:bg-surface-dark"
      >
        <Text className="flex-1 text-text-primary dark:text-text-primary-dark" numberOfLines={1}>
          {selected?.label ?? placeholder}
        </Text>
        <Text className="pl-2 text-text-muted">▾</Text>
      </Pressable>

      <Sheet visible={open} onClose={() => setOpen(false)}>
        <Text className="mb-3 text-lg font-semibold text-text-primary dark:text-text-primary-dark">{label}</Text>
        {options.map((o) => (
          <Pressable
            key={String(o.value)}
            onPress={() => {
              onChange(o.value);
              setOpen(false);
            }}
            className="border-b border-gridline py-2.5 dark:border-gridline-dark"
          >
            <Text
              className={
                o.value === value
                  ? "font-semibold text-category-transit"
                  : "text-text-primary dark:text-text-primary-dark"
              }
            >
              {o.label}
            </Text>
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}

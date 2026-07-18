import { Pressable, Text, View } from "react-native";

export interface Segment<T extends string> {
  value: T;
  label: string;
}

/** The pill-toggle row web uses all over (settings units/theme/mode, booking
 * type, map buckets). One selected value; tapping a segment calls onChange. */
export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  className,
}: {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <View className={`flex-row flex-wrap gap-2 ${className ?? ""}`}>
      {segments.map((seg) => {
        const active = seg.value === value;
        return (
          <Pressable
            key={seg.value}
            onPress={() => onChange(seg.value)}
            className={`rounded-full px-3 py-1.5 ${
              active ? "bg-category-transit" : "bg-surface dark:bg-surface-dark"
            }`}
          >
            <Text
              className={`text-sm ${
                active ? "text-white" : "text-text-secondary dark:text-text-secondary-dark"
              }`}
            >
              {seg.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

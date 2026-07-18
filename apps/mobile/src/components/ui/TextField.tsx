import { Text, TextInput, View, type TextInputProps } from "react-native";

/** Labeled text input matching web's `rounded border border-gridline` field.
 * Placeholder color is a literal (NativeWind can't drive placeholderTextColor
 * from a class), picked to read against both themes' surfaces. */
export function TextField({
  label,
  className,
  ...rest
}: TextInputProps & { label?: string }) {
  return (
    <View className={className}>
      {label ? (
        <Text className="mb-1 text-sm text-text-secondary dark:text-text-secondary-dark">{label}</Text>
      ) : null}
      <TextInput
        placeholderTextColor="#898781"
        className="rounded border border-gridline bg-surface p-2.5 text-text-primary dark:border-gridline-dark dark:bg-surface-dark dark:text-text-primary-dark"
        {...rest}
      />
    </View>
  );
}

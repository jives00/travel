import { View, type ViewProps } from "react-native";

/** Bordered surface panel — the RN equivalent of web's
 * `rounded border border-gridline bg-surface p-*` idiom. */
export function Card({ children, className, ...rest }: ViewProps) {
  return (
    <View
      className={`rounded border border-gridline bg-surface p-3 dark:border-gridline-dark dark:bg-surface-dark ${
        className ?? ""
      }`}
      {...rest}
    >
      {children}
    </View>
  );
}

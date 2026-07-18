import { Pressable, Text, ActivityIndicator, View, type PressableProps } from "react-native";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const BG: Record<Variant, string> = {
  primary: "bg-category-transit",
  secondary: "bg-surface dark:bg-surface-dark border border-gridline dark:border-gridline-dark",
  ghost: "",
  danger: "bg-status-critical",
};

const FG: Record<Variant, string> = {
  primary: "text-white",
  secondary: "text-text-primary dark:text-text-primary-dark",
  ghost: "text-text-secondary dark:text-text-secondary-dark",
  danger: "text-white",
};

/** The one button component. Variants cover the web palette: primary =
 * category-transit (the accent), secondary = bordered surface, ghost = text-only,
 * danger = destructive. Handles the pending/disabled states every screen needs. */
export function Button({
  title,
  variant = "primary",
  loading = false,
  disabled = false,
  className,
  ...rest
}: PressableProps & { title: string; variant?: Variant; loading?: boolean }) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      disabled={isDisabled}
      className={`flex-row items-center justify-center rounded px-4 py-2.5 ${BG[variant]} ${
        isDisabled ? "opacity-50" : ""
      } ${className ?? ""}`}
      {...rest}
    >
      {loading && (
        <View className="mr-2">
          <ActivityIndicator size="small" color={variant === "primary" || variant === "danger" ? "#fff" : "#888"} />
        </View>
      )}
      <Text className={`text-center text-sm font-medium ${FG[variant]}`}>{title}</Text>
    </Pressable>
  );
}

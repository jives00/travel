import { View, Text, Pressable } from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { useUpdateStore } from "../store/update";
import { Screen, Card, Button } from "../components/ui";
import type { MoreScreenProps } from "../navigation/types";

/** The More hub — entry point to Settings and account actions.
 * (Bookings/Budget/Journal/Documents/Stats join here as later phases add them.) */
export function MoreScreen({ navigation }: MoreScreenProps<"MoreHub">) {
  const { logout } = useAuth();
  const { availableTag, downloading, progress, checkForUpdate, startUpdate } = useUpdateStore();

  const rows: { label: string; onPress: () => void }[] = [
    { label: "Settings", onPress: () => navigation.navigate("Settings") },
  ];

  return (
    <Screen scroll>
      <Card className="mb-4 p-0">
        {rows.map((row, i) => (
          <Pressable
            key={row.label}
            onPress={row.onPress}
            className={`flex-row items-center justify-between p-4 ${
              i > 0 ? "border-t border-gridline dark:border-gridline-dark" : ""
            }`}
          >
            <Text className="text-text-primary dark:text-text-primary-dark">{row.label}</Text>
            <Text className="text-text-muted">›</Text>
          </Pressable>
        ))}
      </Card>

      <Card className="mb-4">
        <Text className="mb-2 text-xs font-semibold uppercase text-text-muted">App updates</Text>
        {availableTag ? (
          <>
            <Text className="mb-2 text-sm text-text-primary dark:text-text-primary-dark">
              Version {availableTag} is available.
            </Text>
            <Button
              title={downloading ? `Downloading ${Math.round(progress * 100)}%` : "Download & install"}
              loading={downloading}
              onPress={() => startUpdate()}
            />
          </>
        ) : (
          <Button variant="secondary" title="Check for update" onPress={() => checkForUpdate()} />
        )}
      </Card>

      <View>
        <Button variant="secondary" title="Log out" onPress={() => logout()} />
      </View>
    </Screen>
  );
}

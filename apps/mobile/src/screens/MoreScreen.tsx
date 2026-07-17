import { View, Text, Pressable } from "react-native";
import { useAuth } from "../contexts/AuthContext";

// Bookings/Budget/Journal/Documents/Stats join this menu in their own slices.
export function MoreScreen() {
  const { logout } = useAuth();
  return (
    <View className="flex-1 bg-page p-4">
      <Text className="mb-4 text-lg font-semibold text-text-primary">Settings</Text>
      <Pressable onPress={() => logout()} className="rounded bg-surface p-3">
        <Text className="text-text-primary">Log out</Text>
      </Pressable>
    </View>
  );
}

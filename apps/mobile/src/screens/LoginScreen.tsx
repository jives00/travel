import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useAuth } from "../contexts/AuthContext";

export function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await login(username, password);
    } catch {
      setError("Invalid username or password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View className="flex-1 items-center justify-center bg-page p-6">
      <Text className="mb-4 text-lg font-semibold text-text-primary">Sign in to Travel</Text>
      <TextInput
        className="mb-2 w-full rounded border border-gridline p-2 text-text-primary"
        placeholder="Username"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
      />
      <TextInput
        className="mb-2 w-full rounded border border-gridline p-2 text-text-primary"
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      {error && <Text className="mb-2 text-status-critical">{error}</Text>}
      <Pressable onPress={onSubmit} disabled={submitting} className="w-full rounded bg-category-transit p-3">
        <Text className="text-center font-medium text-white">{submitting ? "Signing in…" : "Sign in"}</Text>
      </Pressable>
    </View>
  );
}

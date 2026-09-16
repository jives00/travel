import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { describeLoginError, type LoginFailure } from "@travel/api-client";
import { useAuth } from "../contexts/AuthContext";

export function LoginScreen() {
  const { login, retry } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [failure, setFailure] = useState<LoginFailure | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setSubmitting(true);
    setFailure(null);
    try {
      await login(username, password);
    } catch (err) {
      // This used to be a bare `catch { setError("Invalid username or password") }`,
      // which accused the password even when the request never reached the server
      // — an unreachable NAS, an unconnected Tailscale, or /login's 10-per-15-min
      // rate limiter all showed identical copy, so there was nothing on screen to
      // tell "wait a minute" apart from "you typo'd".
      setFailure(describeLoginError(err));
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
      <View className="mb-2 w-full flex-row items-center rounded border border-gridline">
        <TextInput
          className="flex-1 p-2 text-text-primary"
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={!showPassword}
        />
        <Pressable
          onPress={() => setShowPassword((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={showPassword ? "Hide password" : "Show password"}
          // Generous hit area: the icon itself is smaller than the 44pt minimum.
          hitSlop={12}
          className="px-3 py-2"
        >
          <EyeIcon off={showPassword} />
        </Pressable>
      </View>
      {failure && (
        <Text
          className={`mb-2 w-full ${
            failure.kind === "credentials" ? "text-status-critical" : "text-text-secondary"
          }`}
        >
          {failure.message}
        </Text>
      )}
      <Pressable onPress={onSubmit} disabled={submitting} className="w-full rounded bg-category-transit p-3">
        <Text className="text-center font-medium text-white">
          {submitting ? "Signing in…" : failure?.retryable ? "Try again" : "Sign in"}
        </Text>
      </Pressable>
      {/* Re-runs bootstrap(), which is all a force-close ever did. On the trusted
          network that silently signs in via the passwordless /session flow — no
          password involved — so reaching this screen because the NAS was briefly
          unreachable no longer needs killing the app to recover from. */}
      <Pressable onPress={retry} disabled={submitting} className="mt-3 p-2">
        <Text className="text-center text-text-secondary underline">Retry connection</Text>
      </Pressable>
    </View>
  );
}

/** Matches web's inline login eye (same path data). react-native-svg is already a
 * dependency; the app has no icon font. */
function EyeIcon({ off }: { off: boolean }) {
  const stroke = "#898781";
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M1.5 12S5.2 5.5 12 5.5 22.5 12 22.5 12 18.8 18.5 12 18.5 1.5 12 1.5 12Z"
        stroke={stroke}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={12} cy={12} r={3.2} stroke={stroke} strokeWidth={1.8} />
      {off && <Line x1={3.5} y1={20.5} x2={20.5} y2={3.5} stroke={stroke} strokeWidth={1.8} strokeLinecap="round" />}
    </Svg>
  );
}

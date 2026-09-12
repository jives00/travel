import { Component, type ReactNode } from "react";
import { ScrollView, Text, View } from "react-native";
import { Button } from "./ui";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Root boundary so a render/lifecycle throw shows something readable instead of
 * a blank screen.
 *
 * This matters more on a release APK than in dev: there is no redbox, so an
 * uncaught throw above the navigator simply unmounts the tree and Android is
 * left painting an empty window — the same symptom as a hang, with no way to
 * tell them apart and nothing in logcat pointing at the cause.
 *
 * "Try again" clears the error and remounts the subtree. That's enough for a
 * transient render failure (a bad cached shape, a one-off undefined); a genuinely
 * broken build will just throw again, which is itself useful information.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // Goes to logcat (`adb logcat -s ReactNativeJS`) — the only persistent record
    // on a release build.
    console.error("[ErrorBoundary]", error?.message, info?.componentStack ?? "");
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View className="flex-1 bg-page px-6 pt-16 dark:bg-page-dark">
        <Text className="text-lg font-semibold text-text-primary dark:text-text-primary-dark">
          Something broke
        </Text>
        <Text className="mt-2 text-sm text-text-secondary dark:text-text-secondary-dark">
          {error.message || "Unknown error"}
        </Text>
        <ScrollView className="mt-4 max-h-64 rounded bg-surface p-3 dark:bg-surface-dark">
          <Text className="text-xs text-text-secondary dark:text-text-secondary-dark">
            {error.stack ?? "No stack available"}
          </Text>
        </ScrollView>
        <Button title="Try again" className="mt-6" onPress={() => this.setState({ error: null })} />
      </View>
    );
  }
}

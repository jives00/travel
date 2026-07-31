import { useEffect, useState } from "react";
import { Keyboard, Modal, Platform, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Bottom-sheet modal — the RN stand-in for web's centered `Modal`. Used for
 * edit-trip, change-photo, add-booking, place/booking detail fields, etc. —
 * every sheet in the app goes through this one component. Tap the scrim to
 * dismiss.
 *
 * Height is capped below the status bar (insets.top + a small gap) so tall
 * content (long forms, place details) scrolls inside the sheet instead of
 * overflowing above the screen. Content scrolls here, not in individual sheet
 * bodies — nesting another ScrollView inside breaks it.
 *
 * Keyboard handling is manual (Keyboard.addListener + explicit height), not
 * KeyboardAvoidingView — RN's Modal renders as a separate native window on
 * Android that doesn't participate in the host Activity's resize/pan handling,
 * so KeyboardAvoidingView silently does nothing inside it. Tracking the
 * keyboard height ourselves and shrinking/shifting the sheet works regardless
 * of that. */
export function Sheet({
  visible,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Pinned below the scroll area — action rows (Save/Delete) belong here so
   * they stay reachable no matter how far the form scrolls. */
  footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const maxHeight = windowHeight - insets.top - 24 - keyboardHeight;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
        {/* Stop propagation so taps inside the sheet don't dismiss it. */}
        <Pressable
          style={{ maxHeight, marginBottom: keyboardHeight }}
          className="overflow-hidden rounded-t-2xl bg-page dark:bg-page-dark"
          onPress={(e) => e.stopPropagation()}
        >
          <View className="mb-3 mt-3 h-1 w-10 self-center rounded-full bg-gridline dark:bg-gridline-dark" />
          {/* flexShrink so the scroll area yields space to the footer instead of
              pushing it past the sheet's maxHeight and off screen. */}
          <ScrollView style={{ flexShrink: 1 }} className="px-4 pb-4" keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer ? (
            <View className="border-t border-gridline px-4 pb-4 pt-3 dark:border-gridline-dark">{footer}</View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

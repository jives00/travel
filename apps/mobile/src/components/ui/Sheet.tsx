import { Modal, Pressable, View } from "react-native";

/** Bottom-sheet modal — the RN stand-in for web's centered `Modal`. Used for
 * edit-trip, change-photo, add-booking, etc. Tap the scrim to dismiss. */
export function Sheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-black/50" onPress={onClose}>
        {/* Stop propagation so taps inside the sheet don't dismiss it. */}
        <Pressable
          className="rounded-t-2xl bg-page p-4 dark:bg-page-dark"
          onPress={(e) => e.stopPropagation()}
        >
          <View className="mb-3 h-1 w-10 self-center rounded-full bg-gridline dark:bg-gridline-dark" />
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

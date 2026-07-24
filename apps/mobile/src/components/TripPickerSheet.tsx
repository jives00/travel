import { Text, Pressable } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { travelApi } from "../lib/api";
import { Sheet } from "./ui";

/** Reused wherever a list's trip link is set or changed: the Lists tab's
 * create-list header and each ListCard's trip badge. Mobile has no <select>
 * equivalent, so this is a Sheet full of rows — same pattern already used for
 * the Cities list in TripDetailView. */
export function TripPickerSheet({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (tripId: number | null) => void;
}) {
  const { data: trips } = useQuery(travelApi.queries.tripsQuery());

  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text className="mb-3 text-lg font-semibold text-text-primary dark:text-text-primary-dark">Link to trip</Text>
      <Pressable
        className="border-b border-gridline py-3 dark:border-gridline-dark"
        onPress={() => {
          onSelect(null);
          onClose();
        }}
      >
        <Text className="text-text-primary dark:text-text-primary-dark">No trip (global)</Text>
      </Pressable>
      {(trips ?? []).map((trip) => (
        <Pressable
          key={trip.id}
          className="border-b border-gridline py-3 dark:border-gridline-dark"
          onPress={() => {
            onSelect(trip.id);
            onClose();
          }}
        >
          <Text className="text-text-primary dark:text-text-primary-dark">{trip.name}</Text>
        </Pressable>
      ))}
    </Sheet>
  );
}

import type { NativeStackScreenProps } from "@react-navigation/native-stack";

/** Trips tab stack: the grid → a trip's detail → its budget. */
export type TripsStackParamList = {
  TripsList: undefined;
  TripDetail: { tripId: number };
  TripBudget: { tripId: number };
};

/** Home tab stack: the primary-trip detail → its budget. Budget is registered
 * here too so it's reachable from the Home tab, which renders a trip detail. */
export type HomeStackParamList = {
  Home: undefined;
  TripBudget: { tripId: number };
};

/** More tab stack: the hub → settings. */
export type MoreStackParamList = {
  MoreHub: undefined;
  Settings: undefined;
};

export type TripsScreenProps<T extends keyof TripsStackParamList> = NativeStackScreenProps<TripsStackParamList, T>;
export type MoreScreenProps<T extends keyof MoreStackParamList> = NativeStackScreenProps<MoreStackParamList, T>;

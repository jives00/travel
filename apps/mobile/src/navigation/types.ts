import type { NativeStackScreenProps } from "@react-navigation/native-stack";

/** Trips tab stack: the grid → a trip's detail. */
export type TripsStackParamList = {
  TripsList: undefined;
  TripDetail: { tripId: number };
};

/** More tab stack: the hub → settings / places library. */
export type MoreStackParamList = {
  MoreHub: undefined;
  Settings: undefined;
  Places: undefined;
  PlaceDetail: { placeId: number };
};

export type TripsScreenProps<T extends keyof TripsStackParamList> = NativeStackScreenProps<TripsStackParamList, T>;
export type MoreScreenProps<T extends keyof MoreStackParamList> = NativeStackScreenProps<MoreStackParamList, T>;

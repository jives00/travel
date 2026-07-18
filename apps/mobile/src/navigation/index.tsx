import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useAuth } from "../contexts/AuthContext";
import { LoginScreen } from "../screens/LoginScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { TripsScreen } from "../screens/TripsScreen";
import { TripDetailScreen } from "../screens/TripDetailScreen";
import { MapScreen } from "../screens/MapScreen";
import { ListsScreen } from "../screens/ListsScreen";
import { MoreScreen } from "../screens/MoreScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { PlacesScreen } from "../screens/PlacesScreen";
import { PlaceDetailScreen } from "../screens/PlaceDetailScreen";
import type { MoreStackParamList, TripsStackParamList } from "./types";

const RootStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();
const TripsStack = createNativeStackNavigator<TripsStackParamList>();
const MapStack = createNativeStackNavigator();
const ListsStack = createNativeStackNavigator();
const MoreStack = createNativeStackNavigator<MoreStackParamList>();

// Navigation mirrors the web app: Home · Trips · Map · Lists · More. Itinerary,
// weather, and bookings live inside a trip (Home / Trips → detail), exactly as
// on web. More is the hub for Settings + the Places library (later: Bookings,
// Budget, Journal, Documents, Stats).
function HomeStackNav() {
  return (
    <HomeStack.Navigator>
      <HomeStack.Screen name="Home" component={HomeScreen} />
    </HomeStack.Navigator>
  );
}

function TripsStackNav() {
  return (
    <TripsStack.Navigator>
      <TripsStack.Screen name="TripsList" component={TripsScreen} options={{ title: "Trips" }} />
      <TripsStack.Screen name="TripDetail" component={TripDetailScreen} options={{ title: "" }} />
    </TripsStack.Navigator>
  );
}

function MapStackNav() {
  return (
    <MapStack.Navigator>
      <MapStack.Screen name="Map" component={MapScreen} />
    </MapStack.Navigator>
  );
}

function ListsStackNav() {
  return (
    <ListsStack.Navigator>
      <ListsStack.Screen name="Lists" component={ListsScreen} />
    </ListsStack.Navigator>
  );
}

function MoreStackNav() {
  return (
    <MoreStack.Navigator>
      <MoreStack.Screen name="MoreHub" component={MoreScreen} options={{ title: "More" }} />
      <MoreStack.Screen name="Settings" component={SettingsScreen} />
      <MoreStack.Screen name="Places" component={PlacesScreen} options={{ title: "Places" }} />
      <MoreStack.Screen name="PlaceDetail" component={PlaceDetailScreen} options={{ title: "" }} />
    </MoreStack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="HomeTab" component={HomeStackNav} options={{ title: "Home" }} />
      <Tab.Screen name="TripsTab" component={TripsStackNav} options={{ title: "Trips" }} />
      <Tab.Screen name="MapTab" component={MapStackNav} options={{ title: "Map" }} />
      <Tab.Screen name="ListsTab" component={ListsStackNav} options={{ title: "Lists" }} />
      <Tab.Screen name="MoreTab" component={MoreStackNav} options={{ title: "More" }} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {isAuthenticated ? (
          <RootStack.Screen name="Main" component={MainTabs} />
        ) : (
          <RootStack.Screen name="Login" component={LoginScreen} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import Ionicons from "@expo/vector-icons/Ionicons";
import { STATUS_BAR_BG } from "../components/ui";
import { useAuth } from "../contexts/AuthContext";
import { LoginScreen } from "../screens/LoginScreen";
import { HomeScreen } from "../screens/HomeScreen";
import { TripsScreen } from "../screens/TripsScreen";
import { TripDetailScreen } from "../screens/TripDetailScreen";
import { TripBudgetScreen } from "../screens/TripBudgetScreen";
import { MapScreen } from "../screens/MapScreen";
import { ListsScreen } from "../screens/ListsScreen";
import { MoreScreen } from "../screens/MoreScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import type { HomeStackParamList, MoreStackParamList, TripsStackParamList } from "./types";

const RootStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const TripsStack = createNativeStackNavigator<TripsStackParamList>();
const MapStack = createNativeStackNavigator();
const ListsStack = createNativeStackNavigator();
const MoreStack = createNativeStackNavigator<MoreStackParamList>();

// Navigation mirrors the web app: Home · Trips · Map · Lists · More. Itinerary,
// weather, and bookings live inside a trip (Home / Trips → detail), exactly as
// on web. More is the hub for Settings (later: Bookings, Budget, Journal,
// Documents, Stats).
// Nested stacks don't inherit MainTabs' headerShown:false, so each sets its own
// header behavior. Home/Map/Lists are single-screen (no back nav, no header
// needed); Trips/More push detail screens and need a header for the back
// button, styled to match the app chrome instead of the native default white.
const chromeHeaderOptions = {
  headerStyle: { backgroundColor: STATUS_BAR_BG },
  headerTintColor: "#fff",
};

function HomeStackNav() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="Home" component={HomeScreen} />
      {/* Home tab hides headers, but the pushed Budget screen needs a header for
          its back button — turn it on just for this screen. */}
      <HomeStack.Screen
        name="TripBudget"
        component={TripBudgetScreen}
        options={{ headerShown: true, ...chromeHeaderOptions, title: "Budget" }}
      />
    </HomeStack.Navigator>
  );
}

function TripsStackNav() {
  return (
    <TripsStack.Navigator screenOptions={chromeHeaderOptions}>
      <TripsStack.Screen name="TripsList" component={TripsScreen} options={{ title: "Trips" }} />
      <TripsStack.Screen name="TripDetail" component={TripDetailScreen} options={{ title: "" }} />
      <TripsStack.Screen name="TripBudget" component={TripBudgetScreen} options={{ title: "Budget" }} />
    </TripsStack.Navigator>
  );
}

function MapStackNav() {
  return (
    <MapStack.Navigator screenOptions={{ headerShown: false }}>
      <MapStack.Screen name="Map" component={MapScreen} />
    </MapStack.Navigator>
  );
}

function ListsStackNav() {
  return (
    <ListsStack.Navigator screenOptions={{ headerShown: false }}>
      <ListsStack.Screen name="Lists" component={ListsScreen} />
    </ListsStack.Navigator>
  );
}

function MoreStackNav() {
  return (
    <MoreStack.Navigator screenOptions={chromeHeaderOptions}>
      <MoreStack.Screen name="MoreHub" component={MoreScreen} options={{ title: "More" }} />
      <MoreStack.Screen name="Settings" component={SettingsScreen} />
    </MoreStack.Navigator>
  );
}

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  HomeTab: "home",
  TripsTab: "airplane",
  MapTab: "map",
  ListsTab: "list",
  MoreTab: "menu",
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={TAB_ICONS[route.name]} color={color} size={size} />
        ),
      })}
    >
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

import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useAuth } from "../contexts/AuthContext";
import { LoginScreen } from "../screens/LoginScreen";
import { TripsScreen } from "../screens/TripsScreen";
import { MapScreen } from "../screens/MapScreen";
import { ItineraryScreen } from "../screens/ItineraryScreen";
import { PlacesScreen } from "../screens/PlacesScreen";
import { MoreScreen } from "../screens/MoreScreen";

const RootStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const TodayStack = createNativeStackNavigator();
const MapStack = createNativeStackNavigator();
const PlanStack = createNativeStackNavigator();
const PlacesStack = createNativeStackNavigator();
const MoreStack = createNativeStackNavigator();

// 5 bottom tabs, each its own native stack (Quest pattern) — Today · Map · Plan ·
// Places · More. Today opens straight to Trips for now (see TripsScreen comment);
// Plan = Itinerary today, Prep + Packing join it in Slice 3; More = Settings today,
// Bookings/Budget/Journal/Documents/Stats join it in their own slices.
function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Today">
        {() => (
          <TodayStack.Navigator>
            <TodayStack.Screen name="Trips" component={TripsScreen} />
          </TodayStack.Navigator>
        )}
      </Tab.Screen>
      <Tab.Screen name="Map">
        {() => (
          <MapStack.Navigator>
            <MapStack.Screen name="Map" component={MapScreen} />
          </MapStack.Navigator>
        )}
      </Tab.Screen>
      <Tab.Screen name="Plan">
        {() => (
          <PlanStack.Navigator>
            <PlanStack.Screen name="Itinerary" component={ItineraryScreen} />
          </PlanStack.Navigator>
        )}
      </Tab.Screen>
      <Tab.Screen name="Places">
        {() => (
          <PlacesStack.Navigator>
            <PlacesStack.Screen name="Places" component={PlacesScreen} />
          </PlacesStack.Navigator>
        )}
      </Tab.Screen>
      <Tab.Screen name="More">
        {() => (
          <MoreStack.Navigator>
            <MoreStack.Screen name="More" component={MoreScreen} />
          </MoreStack.Navigator>
        )}
      </Tab.Screen>
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

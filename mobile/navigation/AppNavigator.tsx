import { createNativeStackNavigator, type NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { COLORS } from '../constants';
import { useAuthStore } from '../stores/authStore';
import { APP_ROUTES } from './routes';

import LoginScreen from '../app/(auth)/login';
import DashboardTab from '../app/(tabs)/index';
import ScanTab from '../app/(tabs)/scan';
import InventoryTab from '../app/(tabs)/inventory';
import MenuTab from '../app/(tabs)/menu';

const Root = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

const headerStyle = {
  backgroundColor: COLORS.primary,
};

const stackHeaderOptions: NativeStackNavigationOptions = {
  headerShown: true,
  headerStyle,
  headerTintColor: COLORS.surface,
  headerTitleStyle: { fontWeight: '700', fontSize: 18 },
  headerBackButtonDisplayMode: 'minimal',
};

type TabIcon = { color: string; size: number };

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textLight,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.borderLight,
          height: 60,
          paddingBottom: 8,
          paddingTop: 4,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerStyle,
        headerTintColor: COLORS.surface,
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
      }}
    >
      <Tabs.Screen
        name="Dashboard"
        component={DashboardTab}
        options={{ title: 'Dashboard', tabBarIcon: ({ color, size }: TabIcon) => <Ionicons name="home" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="Scan"
        component={ScanTab}
        options={{ title: 'Scan', tabBarIcon: ({ color, size }: TabIcon) => <Ionicons name="qr-code" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="Inventory"
        component={InventoryTab}
        options={{ title: 'Inventory', tabBarIcon: ({ color, size }: TabIcon) => <Ionicons name="layers" size={size} color={color} /> }}
      />
      <Tabs.Screen
        name="Menu"
        component={MenuTab}
        options={{ title: 'Menu', tabBarIcon: ({ color, size }: TabIcon) => <Ionicons name="grid" size={size} color={color} /> }}
      />
    </Tabs.Navigator>
  );
}

/**
 * Signed out → only Login exists. Signed in → the tab shell plus every stack screen.
 * Switching on `isAuthenticated` is what the old expo-router AuthGate redirects did,
 * with no flash of the wrong screen and no way to deep-link past login.
 */
export default function AppNavigator() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return (
    <Root.Navigator screenOptions={stackHeaderOptions}>
      {isAuthenticated ? (
        <>
          <Root.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
          {APP_ROUTES.map((r) => (
            <Root.Screen key={r.path} name={r.path} component={r.component} options={{ title: r.title }} />
          ))}
        </>
      ) : (
        <Root.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      )}
    </Root.Navigator>
  );
}

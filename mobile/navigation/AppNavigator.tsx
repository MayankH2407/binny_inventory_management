import { createNativeStackNavigator, type NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ComponentType } from 'react';
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

/**
 * Android 15+/targetSdk 36 forces edge-to-edge, so every screen draws under the system
 * navigation bar. Stack screens get the bottom inset as padding (cached per component so
 * the wrapper identity stays stable across renders).
 */
const insetCache = new WeakMap<ComponentType<any>, ComponentType<any>>();
function withBottomInset(Component: ComponentType<any>): ComponentType<any> {
  let wrapped = insetCache.get(Component);
  if (!wrapped) {
    const W = (props: any) => {
      const insets = useSafeAreaInsets();
      return (
        <View style={{ flex: 1, paddingBottom: insets.bottom, backgroundColor: COLORS.background }}>
          <Component {...props} />
        </View>
      );
    };
    W.displayName = `WithBottomInset(${Component.displayName || Component.name || 'Screen'})`;
    wrapped = W;
    insetCache.set(Component, W);
  }
  return wrapped;
}

const TAB_ICONS = {
  Dashboard: ['home', 'home-outline'],
  Scan: ['qr-code', 'qr-code-outline'],
  Inventory: ['layers', 'layers-outline'],
  Menu: ['grid', 'grid-outline'],
} as const;

function tabIcon(name: keyof typeof TAB_ICONS) {
  return ({ color, focused }: { color: string; focused: boolean }) => (
    <View style={[tabStyles.pill, focused && tabStyles.pillActive]}>
      <Ionicons name={TAB_ICONS[name][focused ? 0 : 1]} size={22} color={color} />
    </View>
  );
}

const tabStyles = {
  pill: { width: 52, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  pillActive: { backgroundColor: COLORS.primary + '18' },
} as const;

function MainTabs() {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 8);
  return (
    <Tabs.Navigator
      screenOptions={{
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textLight,
        tabBarStyle: {
          backgroundColor: COLORS.surface,
          borderTopColor: COLORS.borderLight,
          height: 58 + bottom,
          paddingBottom: bottom,
          paddingTop: 6,
          borderTopWidth: 0,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          elevation: 12,
          shadowColor: '#1E1A5F',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.1,
          shadowRadius: 10,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        headerStyle,
        headerTintColor: COLORS.surface,
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
      }}
    >
      <Tabs.Screen
        name="Dashboard"
        component={DashboardTab}
        options={{ title: 'Dashboard', tabBarIcon: tabIcon('Dashboard') }}
      />
      <Tabs.Screen
        name="Scan"
        component={ScanTab}
        options={{ title: 'Scan', tabBarIcon: tabIcon('Scan') }}
      />
      <Tabs.Screen
        name="Inventory"
        component={InventoryTab}
        options={{ title: 'Inventory', tabBarIcon: tabIcon('Inventory') }}
      />
      <Tabs.Screen
        name="Menu"
        component={MenuTab}
        options={{ title: 'Menu', tabBarIcon: tabIcon('Menu') }}
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
            <Root.Screen key={r.path} name={r.path} component={withBottomInset(r.component)} options={{ title: r.title }} />
          ))}
        </>
      ) : (
        <Root.Screen name="Login" component={withBottomInset(LoginScreen)} options={{ headerShown: false }} />
      )}
    </Root.Navigator>
  );
}

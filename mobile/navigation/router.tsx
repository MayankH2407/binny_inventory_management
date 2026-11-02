import { useLayoutEffect } from 'react';
import {
  CommonActions,
  StackActions,
  createNavigationContainerRef,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';

import { APP_ROUTES } from './routes';
import { resolvePath } from './resolvePath';

const PATTERNS = APP_ROUTES.map((r) => r.path);

// A thin, path-based wrapper over React Navigation so screens can say
// `router.push('/samples/123')` and `useLocalSearchParams()` without knowing about
// navigator trees. (This replaced expo-router; the call shapes were kept so the
// ~35 screens needed only an import change.)

export const navigationRef = createNavigationContainerRef();

function go(action: 'push' | 'replace', href: string): void {
  const target = resolvePath(href, PATTERNS);
  if (!navigationRef.isReady()) return;

  switch (target.kind) {
    case 'main':
      navigationRef.dispatch(CommonActions.navigate({ name: 'Main' }));
      return;
    case 'login':
      // Auth is a conditional navigator: Login appears by itself once the user is
      // signed out, so there is nothing to navigate to.
      return;
    case 'screen':
      navigationRef.dispatch(
        action === 'push'
          ? StackActions.push(target.name, target.params)
          : StackActions.replace(target.name, target.params)
      );
      return;
    default:
      if (__DEV__) console.warn(`[router] No screen matches "${target.path}"`);
  }
}

export const router = {
  push: (href: string) => go('push', href),
  replace: (href: string) => go('replace', href),
  back: () => {
    if (navigationRef.isReady() && navigationRef.canGoBack()) navigationRef.goBack();
  },
  canGoBack: () => navigationRef.isReady() && navigationRef.canGoBack(),
};

export function useRouter() {
  return router;
}

/** Route params of the current screen (e.g. `{ id }` on '/samples/:id'). */
export function useLocalSearchParams<T extends Record<string, string | undefined> = Record<string, string>>(): T {
  const route = useRoute();
  return ((route.params as T | undefined) ?? {}) as T;
}

type StackScreenProps = { options?: NativeStackNavigationOptions };

function ScreenOptions({ options }: StackScreenProps) {
  const navigation = useNavigation();
  const serialized = JSON.stringify(options, (_k, v) => (typeof v === 'function' ? undefined : v));
  useLayoutEffect(() => {
    if (options) navigation.setOptions(options);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, serialized]);
  return null;
}

/** Drop-in for `<Stack.Screen options={{ title }} />` inside a screen. */
export const Stack = { Screen: ScreenOptions };

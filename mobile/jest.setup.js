// Mock secure storage (keychain-backed in the app)
jest.mock('./utils/secureStorage', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

// Mock the path-based navigation adapter (wraps React Navigation)
jest.mock('./navigation/router', () => {
  const router = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true };
  return {
    router,
    navigationRef: { isReady: () => false },
    useRouter: () => router,
    useLocalSearchParams: () => ({}),
    Stack: { Screen: () => null },
  };
});

// Mock haptics
jest.mock('react-native-haptic-feedback', () => ({
  __esModule: true,
  default: { trigger: jest.fn() },
}));

// Mock the camera
jest.mock('react-native-vision-camera', () => ({
  Camera: Object.assign('Camera', {
    getCameraPermissionStatus: () => 'granted',
    requestCameraPermission: jest.fn().mockResolvedValue('granted'),
  }),
  useCameraDevice: () => ({ id: 'back' }),
  useCodeScanner: () => ({}),
}));

// Mock icons
jest.mock('react-native-vector-icons/Ionicons', () => 'Ionicons');

// Mock the share sheet
jest.mock('react-native-share', () => ({
  __esModule: true,
  default: { open: jest.fn().mockResolvedValue({}) },
}));

// Silence React Native warnings in tests
try {
  jest.mock('react-native/Libraries/Animated/NativeAnimatedHelper');
} catch {
  // Module path may not exist in newer RN versions — safe to skip
}

import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

// Same call shape the screens already used (`Haptics.notificationAsync(
// Haptics.NotificationFeedbackType.Success)`), backed by react-native-haptic-feedback.
// Haptics are a nicety — a failure here must never break a scan or a save.

export const NotificationFeedbackType = {
  Success: 'notificationSuccess',
  Warning: 'notificationWarning',
  Error: 'notificationError',
} as const;

export type NotificationFeedbackType =
  (typeof NotificationFeedbackType)[keyof typeof NotificationFeedbackType];

export async function notificationAsync(type: NotificationFeedbackType): Promise<void> {
  try {
    ReactNativeHapticFeedback.trigger(type, { enableVibrateFallback: true, ignoreAndroidSystemSettings: false });
  } catch {
    // ignore
  }
}

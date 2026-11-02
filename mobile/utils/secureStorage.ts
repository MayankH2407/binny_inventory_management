import * as Keychain from 'react-native-keychain';

// Drop-in for the three expo-secure-store calls this app used. Each key is stored as
// its own Keychain entry (service = key), backed by the Android Keystore.

export async function getItemAsync(key: string): Promise<string | null> {
  const creds = await Keychain.getGenericPassword({ service: key });
  return creds ? creds.password : null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  await Keychain.setGenericPassword(key, value, { service: key });
}

export async function deleteItemAsync(key: string): Promise<void> {
  await Keychain.resetGenericPassword({ service: key });
}

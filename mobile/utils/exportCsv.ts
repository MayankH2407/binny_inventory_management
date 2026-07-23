import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

/**
 * Write a CSV string to the cache directory and open the native share sheet
 * so the user can save/send the file. Mirrors the web app's "Export CSV"
 * buttons but adapted for RN (no browser download, no Blob).
 */
export async function shareCsv(filename: string, csv: string): Promise<void> {
  try {
    const uri = (FileSystem.cacheDirectory ?? '') + filename;
    await FileSystem.writeAsStringAsync(uri, csv, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'text/csv',
        UTI: 'public.comma-separated-values-text',
      });
    } else {
      Alert.alert('Sharing unavailable', 'Cannot share files on this device.');
    }
  } catch (err: any) {
    Alert.alert('Export failed', err?.message ?? 'Could not export the CSV file.');
  }
}

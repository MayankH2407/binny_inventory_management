import { Alert } from 'react-native';
import Share from 'react-native-share';

/**
 * Open the native share sheet with a CSV file so the user can save/send it. Mirrors
 * the web app's "Export CSV" buttons, adapted for RN (no browser download, no Blob).
 * The CSV is handed to the share sheet as a base64 data URL, so nothing has to be
 * written to disk first.
 */
export async function shareCsv(filename: string, csv: string): Promise<void> {
  try {
    const base64 = (globalThis as unknown as { btoa: (s: string) => string }).btoa(unescape(encodeURIComponent(csv)));
    await Share.open({
      url: `data:text/csv;base64,${base64}`,
      type: 'text/csv',
      filename: filename.replace(/\.csv$/i, ''),
      failOnCancel: false,
    });
  } catch (err: any) {
    Alert.alert('Export failed', err?.message ?? 'Could not export the CSV file.');
  }
}

import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants';
import Card from '../../components/ui/Card';

export default function GenerateChildBoxesScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Generate Labels' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="print-outline" size={56} color={COLORS.primary} />
        </View>
        <Text style={styles.title}>Bulk label generation is web-only</Text>
        <Text style={styles.desc}>
          Generating new child-box QR labels, printing them on the TSC thermal printer,
          and bulk-creating boxes from a size range require the web portal.
        </Text>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Use the web portal</Text>
          <Text style={styles.cardText}>
            Open{'  '}
            <Text style={styles.link}>https://srv1409601.hstgr.cloud/binny/child-boxes/generate</Text>
            {'  '}on a desktop connected to the label printer.
          </Text>
        </Card>

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>On this device you can…</Text>
          <Row icon="cube-outline" text="Browse the full child-box list" />
          <Row icon="qr-code-outline" text="Scan existing child boxes to trace or pack" />
          <Row icon="archive-outline" text="Pack cartons by scanning boxes" />
        </Card>
      </ScrollView>
    </>
  );
}

function Row({ icon, text }: { icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={18} color={COLORS.primary} style={styles.rowIcon} />
      <Text style={styles.rowText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 24, alignItems: 'stretch' },
  iconWrap: {
    alignSelf: 'center',
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: COLORS.primary + '15',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 20, marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.text, textAlign: 'center', marginBottom: 10 },
  desc: { fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  card: { marginBottom: 14 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  cardText: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 19 },
  link: { color: COLORS.primary, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  rowIcon: { marginRight: 10 },
  rowText: { fontSize: 13, color: COLORS.text, flex: 1 },
});

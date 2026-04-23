import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Alert,
  StyleSheet,
  Platform,
} from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { COLORS } from '../constants';
import { masterCartonService } from '../services/masterCarton.service';
import type { MasterCarton } from '../types';
import { useApiMutation } from '../hooks/useApi';
import { parseQRCode, formatDate } from '../utils';

import BarcodeScanner from '../components/BarcodeScanner';
import RoleGate from '../components/RoleGate';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import EmptyState from '../components/ui/EmptyState';

// ─── Denied fallback ──────────────────────────────────────────────────────────

function DeniedView() {
  return (
    <EmptyState
      icon="lock-closed-outline"
      title="Not authorized"
      message="You do not have permission to unpack cartons."
    />
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function UnpackScreen() {
  const [carton, setCarton] = useState<MasterCarton | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // ── Scan handler ──────────────────────────────────────────────────────────

  const handleScan = async (raw: string) => {
    const parsed = parseQRCode(raw);
    const code = parsed.type === 'master' ? parsed.id : raw.trim().toUpperCase();
    setLoading(true);
    try {
      const c = await masterCartonService.getByBarcode(code);
      if (c.status === 'DISPATCHED') {
        Alert.alert(
          'Cannot unpack',
          `Carton ${c.carton_barcode} has already been dispatched.`,
        );
        return;
      }
      setCarton(c);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      const msg =
        e?.response?.data?.message ?? e?.message ?? 'Carton not found';
      Alert.alert('Scan failed', msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Unpack mutation ───────────────────────────────────────────────────────

  const unpackMutation = useApiMutation<void, string>(
    (id) => masterCartonService.fullUnpack(id),
    {
      successMessage: 'Carton unpacked. All boxes released to FREE.',
      invalidateKeys: [
        ['masterCartons'],
        ['childBoxes'],
        ['inventory-summary'],
        ['inventory-hierarchy'],
        ['dashboard-stats'],
      ],
      onSuccess: async () => {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setCarton(null);
      },
    },
  );

  function confirmUnpack() {
    if (!carton) return;
    Alert.alert(
      'Unpack carton?',
      `This will release all ${carton.child_count} child boxes from ${carton.carton_barcode} to FREE status. Continue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unpack',
          style: 'destructive',
          onPress: () => unpackMutation.mutate(carton.id),
        },
      ],
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <RoleGate
      allow={['Admin', 'Supervisor', 'Warehouse Operator']}
      fallback={<DeniedView />}
    >
      <Stack.Screen options={{ title: 'Unpack Carton' }} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Scan / rescan card ─────────────────────────────────────────── */}
        <Card style={styles.scanCard}>
          {carton === null ? (
            <>
              <Button
                title="Scan Master Carton"
                onPress={() => setScannerOpen(true)}
                icon={
                  <Ionicons
                    name="qr-code-outline"
                    size={20}
                    color={COLORS.surface}
                  />
                }
                fullWidth
              />
              <Text style={styles.scanHint}>
                Scan any ACTIVE or CLOSED master carton to unpack it.
              </Text>
            </>
          ) : (
            <Button
              title="Scan Different Carton"
              variant="outline"
              onPress={() => {
                setCarton(null);
                setScannerOpen(true);
              }}
              icon={
                <Ionicons
                  name="qr-code-outline"
                  size={18}
                  color={COLORS.primary}
                />
              }
            />
          )}
        </Card>

        {/* ── Scan lookup spinner ────────────────────────────────────────── */}
        {loading && (
          <View style={styles.spinnerRow}>
            <Spinner size="small" />
          </View>
        )}

        {/* ── Carton summary ─────────────────────────────────────────────── */}
        {carton !== null && (
          <>
            <Card style={styles.summaryCard}>
              {/* Header row */}
              <View style={styles.headerRow}>
                <Text style={styles.barcode} numberOfLines={1}>
                  {carton.carton_barcode}
                </Text>
                <Badge label={carton.status} type="carton" />
              </View>

              {/* Detail rows */}
              <SummaryRow label="Child boxes" value={String(carton.child_count)} />

              {!!carton.article_summary && (
                <SummaryRow label="Articles" value={carton.article_summary} />
              )}

              {!!carton.colour_summary && (
                <SummaryRow label="Colours" value={carton.colour_summary} />
              )}

              {!!carton.size_summary && (
                <SummaryRow label="Sizes" value={carton.size_summary} />
              )}

              {carton.mrp_summary != null && (
                <SummaryRow
                  label="Total MRP"
                  value={`₹${Number(carton.mrp_summary).toFixed(2)}`}
                />
              )}

              <SummaryRow label="Created" value={formatDate(carton.created_at)} />

              {!!carton.closed_at && (
                <SummaryRow label="Closed" value={formatDate(carton.closed_at)} />
              )}
            </Card>

            {/* ── Warning banner ──────────────────────────────────────────── */}
            <View style={styles.warningBanner}>
              <Ionicons
                name="warning-outline"
                size={20}
                color={COLORS.warning}
                style={styles.warningIcon}
              />
              <Text style={styles.warningText}>
                Unpacking will release all {carton.child_count} boxes back to FREE
                status. This cannot be undone.
              </Text>
            </View>

            {/* ── Unpack button ───────────────────────────────────────────── */}
            <Button
              title="Unpack Carton"
              variant="danger"
              icon={
                <Ionicons
                  name="open-outline"
                  size={20}
                  color={COLORS.surface}
                />
              }
              onPress={confirmUnpack}
              fullWidth
              disabled={unpackMutation.isPending}
              loading={unpackMutation.isPending}
            />
          </>
        )}
      </ScrollView>

      {/* ── Scanner modal ──────────────────────────────────────────────────── */}
      <BarcodeScanner
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
        expectedType="master"
        title="Scan Master Carton"
      />
    </RoleGate>
  );
}

// ─── Helper: summary row ──────────────────────────────────────────────────────

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 16,
    gap: 12,
  },

  // Scan card
  scanCard: {
    gap: 10,
  },
  scanHint: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 4,
  },

  // Scan lookup spinner
  spinnerRow: {
    alignItems: 'center',
    paddingVertical: 8,
  },

  // Summary card
  summaryCard: {
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  barcode: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginRight: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 3,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.borderLight,
  },
  summaryLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    flex: 1,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    flex: 2,
    textAlign: 'right',
  },

  // Warning banner
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.warning + '20',
    borderRadius: 10,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: COLORS.warning + '40',
  },
  warningIcon: {
    marginTop: 1,
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 20,
  },
});

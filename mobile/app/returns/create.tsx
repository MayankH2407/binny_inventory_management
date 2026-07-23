import { useState, useCallback } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { COLORS } from '../../constants';
import { returnsService } from '../../services/returns.service';
import { useApiMutation } from '../../hooks/useApi';
import RoleGate from '../../components/RoleGate';
import BarcodeScanner from '../../components/BarcodeScanner';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import { formatDate } from '../../utils';
import type { ReturnableItem, ReturnRecord, CreateReturnRequest } from '../../types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PickedItem {
  barcode: string;
  item_type: 'BOX' | 'CARTON';
  display: ReturnableItem;
}

// ─── Denied fallback ──────────────────────────────────────────────────────────

function DeniedView() {
  return (
    <View style={styles.deniedContainer}>
      <EmptyState
        icon="lock-closed-outline"
        title="Not authorized"
        message="You don't have permission to record returns."
      />
    </View>
  );
}

// ─── Product line helper ───────────────────────────────────────────────────────

function ItemProductLine({ item }: { item: ReturnableItem }) {
  const summary = item.product_summary;
  const article = item.article_name || summary?.article_summary;
  const colour = item.colour || summary?.colour_summary;
  const size = item.size || summary?.size_summary;
  const mrp = item.mrp ?? summary?.mrp;
  const pairs = summary?.pairs ?? (item.item_type === 'CARTON' ? item.child_count : undefined);

  if (!article && !colour && !size) return null;

  const metaParts: string[] = [];
  if (colour) metaParts.push(colour);
  if (size) metaParts.push(size);
  if (mrp != null) metaParts.push(`₹${Number(mrp).toFixed(2)}`);
  if (pairs != null) metaParts.push(`${pairs} prs`);

  return (
    <>
      {!!article && <Text style={styles.itemArticle}>{article}</Text>}
      {metaParts.length > 0 && <Text style={styles.itemMeta}>{metaParts.join(' · ')}</Text>}
    </>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

function ReturnCreateScreen() {
  const [items, setItems] = useState<PickedItem[]>([]);
  const [reason, setReason] = useState('');
  const [returnDate, setReturnDate] = useState('');

  const [scannerOpen, setScannerOpen] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [lookingUp, setLookingUp] = useState(false);

  // ── Mutation ─────────────────────────────────────────────────────────────────

  const mutation = useApiMutation<ReturnRecord, CreateReturnRequest>(
    (vars) => returnsService.create(vars),
    {
      successMessage: 'Return recorded',
      invalidateKeys: [['returns'], ['dispatches'], ['inventory'], ['dashboard-stats']],
      onSuccess: () => router.replace('/returns' as any),
    }
  );

  // ── Lookup / scan handling ────────────────────────────────────────────────────

  const lookupBarcode = useCallback(
    async (raw: string) => {
      const code = raw.trim().toUpperCase();
      if (!code) return;

      if (items.some((i) => i.barcode === code)) {
        Alert.alert('Already added', `${code} is already in the list.`);
        return;
      }

      setLookingUp(true);
      try {
        const item = await returnsService.lookup(code);
        if (!item.returnable) {
          Alert.alert('Cannot return', item.reason || 'This item cannot be returned.');
          return;
        }
        setItems((prev) => {
          if (prev.some((i) => i.barcode === item.barcode)) {
            Alert.alert('Already added', `${item.barcode} is already in the list.`);
            return prev;
          }
          return [...prev, { barcode: item.barcode, item_type: item.item_type, display: item }];
        });
        setManualInput('');
      } catch (err: any) {
        Alert.alert(
          'Not found',
          err?.response?.data?.message ?? err?.message ?? 'No item found for that barcode.'
        );
      } finally {
        setLookingUp(false);
      }
    },
    [items]
  );

  const handleScan = useCallback(
    (raw: string) => {
      setScannerOpen(false);
      lookupBarcode(raw);
    },
    [lookupBarcode]
  );

  const handleRemove = (barcode: string) => {
    setItems((prev) => prev.filter((i) => i.barcode !== barcode));
  };

  // ── Submit ────────────────────────────────────────────────────────────────────

  const submit = () => {
    if (items.length === 0) {
      Alert.alert('No items', 'Scan at least one item to record a return.');
      return;
    }
    mutation.mutate({
      reason: reason.trim() || undefined,
      return_date: returnDate.trim() ? new Date(returnDate.trim()).toISOString() : undefined,
      items: items.map((i) => ({ barcode: i.barcode, item_type: i.item_type })),
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'New Return' }} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* ── Scan section ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Scanned Items <Text style={styles.sectionCount}>({items.length})</Text>
          </Text>
        </View>

        <Button
          title={lookingUp ? 'Looking up…' : 'Scan Barcode'}
          onPress={() => setScannerOpen(true)}
          icon={<Ionicons name="qr-code-outline" size={18} color={COLORS.surface} />}
          fullWidth
          disabled={lookingUp}
          style={styles.scanBtn}
        />

        <View style={styles.manualRow}>
          <View style={styles.manualInputWrap}>
            <Input
              label="Or enter barcode manually"
              placeholder="Box or carton barcode"
              value={manualInput}
              onChangeText={setManualInput}
              autoCapitalize="characters"
              returnKeyType="search"
              onSubmitEditing={() => lookupBarcode(manualInput)}
            />
          </View>
          <TouchableOpacity
            style={[styles.findBtn, (!manualInput.trim() || lookingUp) && styles.findBtnDisabled]}
            onPress={() => lookupBarcode(manualInput)}
            disabled={!manualInput.trim() || lookingUp}
            activeOpacity={0.75}
          >
            <Text style={styles.findBtnText}>Add</Text>
          </TouchableOpacity>
        </View>

        <Card style={styles.listCard}>
          {items.length === 0 ? (
            <View style={styles.listEmptyHint}>
              <Text style={styles.listEmptyText}>
                Scan a dispatched box or carton to add it to this return.
              </Text>
            </View>
          ) : (
            <View>
              {items.map((ri, idx) => (
                <View
                  key={ri.barcode}
                  style={[styles.itemRow, idx < items.length - 1 && styles.itemRowBorder]}
                >
                  <View style={styles.itemInfo}>
                    <View style={styles.itemBadgeRow}>
                      <Badge
                        label={ri.item_type === 'CARTON' ? 'Carton' : 'Box'}
                        color={ri.item_type === 'CARTON' ? COLORS.primary : COLORS.textSecondary}
                      />
                      <Text style={styles.itemBarcode}>{ri.barcode}</Text>
                    </View>
                    <ItemProductLine item={ri.display} />
                    {ri.display.origin_dispatch && (
                      <Text style={styles.itemOrigin} numberOfLines={1}>
                        From: {ri.display.origin_dispatch.customer_firm_name || 'Walk-in'} —{' '}
                        {ri.display.origin_dispatch.source_label} (
                        {formatDate(ri.display.origin_dispatch.dispatch_date)})
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.trashBtn}
                    onPress={() => handleRemove(ri.barcode)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close-circle" size={22} color={COLORS.error} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </Card>

        {/* ── Details form (optional) ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Details (optional)</Text>
        </View>

        <Input
          label="Return Date"
          placeholder="YYYY-MM-DD"
          value={returnDate}
          onChangeText={setReturnDate}
          keyboardType="numeric"
          returnKeyType="next"
          containerStyle={styles.inputGap}
        />

        <Input
          label="Reason"
          placeholder="Why is this stock being returned?"
          value={reason}
          onChangeText={setReason}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          style={styles.notesInput}
          containerStyle={styles.inputGap}
        />

        {/* ── Submit ── */}
        <Button
          title={
            items.length === 0
              ? 'Record Return'
              : `Record Return (${items.length} item${items.length === 1 ? '' : 's'})`
          }
          onPress={submit}
          icon={<Ionicons name="return-down-back-outline" size={18} color={COLORS.surface} />}
          fullWidth
          disabled={items.length === 0 || mutation.isPending}
          loading={mutation.isPending}
          style={styles.submitBtn}
        />
      </ScrollView>

      {/* ── Scanner modal ── */}
      <BarcodeScanner
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
        expectedType="any"
        title="Scan a dispatched box or carton"
      />
    </KeyboardAvoidingView>
  );
}

// ─── Export (role-gated) ──────────────────────────────────────────────────────

export default function ReturnCreateScreenGated() {
  return (
    <RoleGate allow={['Admin', 'Supervisor', 'Dispatch Operator']} fallback={<DeniedView />}>
      <ReturnCreateScreen />
    </RoleGate>
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
    paddingBottom: 48,
  },
  deniedContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // Section headers
  sectionHeader: {
    marginBottom: 10,
    marginTop: 6,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCount: {
    fontWeight: '400',
    color: COLORS.textLight,
  },

  // Scan button
  scanBtn: {
    marginBottom: 12,
  },

  // Manual entry row
  manualRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 12,
  },
  manualInputWrap: {
    flex: 1,
  },
  findBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 2,
  },
  findBtnDisabled: {
    backgroundColor: COLORS.textLight,
  },
  findBtnText: {
    color: COLORS.surface,
    fontWeight: '700',
    fontSize: 14,
  },

  // Scanned items list card
  listCard: {
    marginBottom: 20,
  },
  listEmptyHint: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  listEmptyText: {
    fontSize: 13,
    color: COLORS.textLight,
    textAlign: 'center',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    gap: 10,
  },
  itemRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  itemInfo: {
    flex: 1,
    minWidth: 0,
  },
  itemBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  itemBarcode: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  itemArticle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 1,
  },
  itemMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 1,
  },
  itemOrigin: {
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 1,
  },
  trashBtn: {
    padding: 4,
  },

  // Details form
  inputGap: {
    marginBottom: 12,
  },
  notesInput: {
    minHeight: 80,
    paddingTop: 12,
  },

  // Submit button
  submitBtn: {
    marginTop: 8,
  },
});

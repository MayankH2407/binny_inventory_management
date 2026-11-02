import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  RefreshControl,
  Alert,
  StyleSheet,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { COLORS } from '../../constants';
import { samplesService } from '../../services/samples.service';
import type { AssortmentItem, Foot, SampleItem, SampleRecord, SampleState } from '../../types';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { formatDate, parseQRCode } from '../../utils';

import RoleGate from '../../components/RoleGate';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import BarcodeScanner from '../../components/BarcodeScanner';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATE_COLORS: Record<SampleState, string> = {
  EMPTY: COLORS.textSecondary,
  OPEN: COLORS.statusActive,
  DISPATCHED: COLORS.statusDispatched,
};

const FOOT_OPTIONS: { value: Foot; label: string }[] = [
  { value: 'PAIR', label: 'Pair' },
  { value: 'LEFT', label: 'Left' },
  { value: 'RIGHT', label: 'Right' },
];

const FOOT_LABEL: Record<Foot, string> = { PAIR: 'Pair', LEFT: 'Left shoe', RIGHT: 'Right shoe' };

// Roles that can scan boxes in / out and unpack cartons; backend permissions still apply.
const EDIT_ROLES = ['Admin', 'Supervisor', 'Warehouse Operator'] as const;

const invalidateKeys = (id: string) => [
  ['samples'],
  ['samples-summary'],
  ['sample', id],
  ['sample-contents', id],
  ['sample-assortment', id],
  ['inventory-summary'],
  ['inventory-hierarchy'],
  ['dashboard-stats'],
];

function errorMessage(err: any): string {
  return err?.response?.data?.message ?? err?.message ?? 'Something went wrong';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function AssortmentRow({ item }: { item: AssortmentItem }) {
  const label = `${item.article_name} · ${item.colour} · ${item.size} · ₹${Number(item.mrp).toFixed(2)}`;
  return (
    <View style={styles.assortmentRow}>
      <Text style={styles.assortmentLabel} numberOfLines={1} ellipsizeMode="tail">
        {label}
      </Text>
      <Text style={styles.assortmentQty}>×{item.count}</Text>
    </View>
  );
}

function SummaryLine({ item }: { item: SampleItem }) {
  const parts = [item.article_summary, item.colour_summary, item.size_summary].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <Text style={styles.itemSummary} numberOfLines={2}>
      {parts.join(' · ')}
      {item.mrp != null ? ` · ₹${Number(item.mrp).toFixed(2)}` : ''}
    </Text>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SampleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const sampleQ = useApiQuery<SampleRecord>(['sample', id!], () => samplesService.getById(id!), {
    enabled: !!id,
  });
  const contentsQ = useApiQuery<SampleItem[]>(['sample-contents', id!], () => samplesService.getContents(id!), {
    enabled: !!id,
  });
  const assortmentQ = useApiQuery<AssortmentItem[]>(
    ['sample-assortment', id!],
    () => samplesService.getAssortment(id!),
    { enabled: !!id },
  );

  const sample = sampleQ.data;
  const items = contentsQ.data ?? [];
  const cartons = items.filter((i) => i.item_type === 'CARTON');
  const boxes = items.filter((i) => i.item_type === 'BOX');
  const state: SampleState = sample?.state ?? 'EMPTY';

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([sampleQ.refetch(), contentsQ.refetch(), assortmentQ.refetch()]);
    setRefreshing(false);
  };

  // ── Scan / add ──────────────────────────────────────────────────────────────
  const [scannerOpen, setScannerOpen] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [scanFoot, setScanFoot] = useState<Foot>('PAIR');

  // Single scan input: the server works out whether it is a loose box or a whole
  // carton. No errorMessage override so the API's own message (e.g. "already in
  // another sample") reaches the operator.
  const scanMutation = useApiMutation(
    (barcode: string) => samplesService.scan(id!, { barcode, foot: scanFoot }),
    {
      invalidateKeys: invalidateKeys(id ?? ''),
      onSuccess: (result) => {
        const msg =
          result.item_type === 'CARTON'
            ? `Carton ${result.barcode} added (${result.boxes_added} box${result.boxes_added === 1 ? '' : 'es'})`
            : `Box ${result.barcode} added${result.foot !== 'PAIR' ? ` (${FOOT_LABEL[result.foot].toLowerCase()})` : ''}`;
        Alert.alert('Added', msg);
      },
    },
  );

  const submitScan = (raw: string) => {
    const parsed = parseQRCode(raw);
    const barcode = parsed.type === 'child' || parsed.type === 'master' ? parsed.id : raw.trim().toUpperCase();
    if (!barcode) return;
    scanMutation.mutate(barcode);
  };

  const handleCameraScan = (raw: string) => {
    setScannerOpen(false);
    submitScan(raw);
  };

  const handleManualAdd = () => {
    const trimmed = manualBarcode.trim();
    if (!trimmed) return;
    setManualBarcode('');
    submitScan(trimmed);
  };

  // ── Foot / unpack / remove ──────────────────────────────────────────────────
  const setFootMutation = useApiMutation(
    (vars: { mapping_id: string; foot: Foot }) => samplesService.setFoot(id!, vars),
    { invalidateKeys: invalidateKeys(id ?? '') },
  );

  const unpackMutation = useApiMutation(
    (mapping_id: string) => samplesService.unpackCarton(id!, mapping_id),
    {
      invalidateKeys: invalidateKeys(id ?? ''),
      onSuccess: (r) =>
        Alert.alert(
          'Carton unpacked',
          `${r.carton_barcode} → ${r.boxes_unpacked} loose box${r.boxes_unpacked === 1 ? '' : 'es'} in this sample.`,
        ),
    },
  );

  const removeMutation = useApiMutation(
    (vars: { item_type: 'BOX' | 'CARTON'; mapping_id: string }) => samplesService.remove(id!, vars),
    { invalidateKeys: invalidateKeys(id ?? '') },
  );

  const clearMutation = useApiMutation(() => samplesService.clear(id!), {
    invalidateKeys: invalidateKeys(id ?? ''),
    onSuccess: (r) =>
      Alert.alert('Sample emptied', `${r.released_boxes} box(es) and ${r.released_cartons} carton(s) are back in stock.`),
  });

  const deleteMutation = useApiMutation(() => samplesService.delete(id!), {
    invalidateKeys: invalidateKeys(id ?? ''),
    successMessage: 'Sample deleted',
    onSuccess: () => router.back(),
  });

  function confirmUnpack(item: SampleItem) {
    Alert.alert(
      'Unpack carton?',
      `All ${item.box_count} boxes in ${item.barcode} become loose items in this sample (each can be split left/right) and the carton itself becomes empty.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unpack', onPress: () => unpackMutation.mutate(item.mapping_id) },
      ],
    );
  }

  function confirmRemove(item: SampleItem) {
    Alert.alert(
      'Remove from sample?',
      item.item_type === 'CARTON'
        ? `Carton ${item.barcode} (${item.box_count} boxes) goes back to available stock.`
        : `Box ${item.barcode} goes back to available stock.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removeMutation.mutate({ item_type: item.item_type, mapping_id: item.mapping_id }),
        },
      ],
    );
  }

  function confirmClear() {
    Alert.alert(
      'Empty this sample?',
      'Every box and carton in it goes back to available stock. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Empty Sample', style: 'destructive', onPress: () => clearMutation.mutate() },
      ],
    );
  }

  function confirmDelete() {
    Alert.alert('Delete sample?', 'This permanently removes the empty sample record.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate() },
    ]);
  }

  // ── Render guards ───────────────────────────────────────────────────────────
  if (sampleQ.isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Sample' }} />
        <View style={styles.centered}>
          <Spinner />
        </View>
      </>
    );
  }

  if (sampleQ.isError || !sample) {
    return (
      <>
        <Stack.Screen options={{ title: 'Sample' }} />
        <EmptyState icon="alert-circle-outline" title="Sample not found" message="It may have been deleted." />
      </>
    );
  }

  const canDelete = state === 'EMPTY' && !sample.shipped_box_count;
  const busy = scanMutation.isPending;
  const totalAssortmentQty = (assortmentQ.data ?? []).reduce((s, a) => s + a.count, 0);

  return (
    <>
      <Stack.Screen options={{ title: sample.sample_barcode }} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* Header */}
        <Card style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.barcode} numberOfLines={1}>
              {sample.sample_barcode}
            </Text>
            <Badge label={state} color={STATE_COLORS[state]} />
          </View>
          {!!sample.name && <Text style={styles.name}>{sample.name}</Text>}

          <InfoRow label="Boxes in sample" value={`${sample.open_box_count ?? 0} (${sample.open_pairs ?? 0} pairs)`} />
          <InfoRow label="Items" value={String(sample.open_item_count ?? items.length)} />
          {!!sample.shipped_box_count && (
            <InfoRow label="Already shipped" value={`${sample.shipped_box_count} boxes`} />
          )}
          {!!sample.last_dispatch_date && (
            <InfoRow label="Last dispatch" value={formatDate(sample.last_dispatch_date)} />
          )}
          <InfoRow
            label="Created"
            value={`${formatDate(sample.created_at)}${sample.creator_name ? ` by ${sample.creator_name}` : ''}`}
          />

          <Text style={styles.hint}>
            Recipient, purpose and date are entered when you dispatch this sample from the Dispatch screen.
          </Text>
        </Card>

        {/* Scan section */}
        <RoleGate allow={[...EDIT_ROLES]}>
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Add to sample</Text>
            <Text style={styles.hint}>Scan a child box or a whole master carton.</Text>

            <View style={styles.footRow}>
              <Text style={styles.footLabel}>Loose box as:</Text>
              {FOOT_OPTIONS.map((o) => {
                const active = scanFoot === o.value;
                return (
                  <TouchableOpacity
                    key={o.value}
                    onPress={() => setScanFoot(o.value)}
                    style={[styles.footChip, active && styles.footChipActive]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.footChipText, active && styles.footChipTextActive]}>{o.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.scanRow}>
              <TextInput
                style={styles.scanInput}
                value={manualBarcode}
                onChangeText={setManualBarcode}
                placeholder="Scan or type a box / carton barcode"
                placeholderTextColor={COLORS.textLight}
                autoCapitalize="characters"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleManualAdd}
                editable={!busy}
              />
              <TouchableOpacity
                style={[styles.iconBtn, (!manualBarcode.trim() || busy) && styles.iconBtnDisabled]}
                onPress={handleManualAdd}
                disabled={!manualBarcode.trim() || busy}
              >
                {busy ? <Spinner size="small" /> : <Ionicons name="add" size={22} color="#FFFFFF" />}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cameraBtn} onPress={() => setScannerOpen(true)} disabled={busy}>
                <Ionicons name="scan-outline" size={22} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
          </Card>
        </RoleGate>

        {/* Assortment */}
        {(assortmentQ.data ?? []).length > 0 && (
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Assortment · {totalAssortmentQty} pairs</Text>
            {(assortmentQ.data ?? []).map((a) => (
              <AssortmentRow key={`${a.article_name}-${a.colour}-${a.size}-${a.mrp}`} item={a} />
            ))}
          </Card>
        )}

        {/* Contents */}
        {contentsQ.isLoading ? (
          <View style={styles.centered}>
            <Spinner />
          </View>
        ) : items.length === 0 ? (
          <Card style={styles.card}>
            <EmptyState
              icon="flask-outline"
              title="Nothing in this sample"
              message={state === 'DISPATCHED' ? 'Everything has been dispatched.' : 'Scan a box or carton above to add it.'}
            />
          </Card>
        ) : (
          <>
            {cartons.length > 0 && (
              <Card style={styles.card}>
                <Text style={styles.sectionTitle}>Cartons ({cartons.length})</Text>
                {cartons.map((c) => (
                  <View key={c.mapping_id} style={styles.itemBlock}>
                    <View style={styles.itemHeader}>
                      <Text style={styles.itemBarcode}>{c.barcode}</Text>
                      <Text style={styles.itemMeta}>
                        {c.box_count} boxes · {c.pairs} pairs
                      </Text>
                    </View>
                    <SummaryLine item={c} />
                    <RoleGate allow={[...EDIT_ROLES]}>
                      <View style={styles.actionRow}>
                        <Button
                          title="Unpack"
                          size="sm"
                          variant="outline"
                          onPress={() => confirmUnpack(c)}
                          loading={unpackMutation.isPending && unpackMutation.variables === c.mapping_id}
                        />
                        <Button title="Remove" size="sm" variant="danger" onPress={() => confirmRemove(c)} />
                      </View>
                    </RoleGate>
                  </View>
                ))}
              </Card>
            )}

            {boxes.length > 0 && (
              <Card style={styles.card}>
                <Text style={styles.sectionTitle}>Loose boxes ({boxes.length})</Text>
                {boxes.map((b) => (
                  <View key={b.mapping_id} style={styles.itemBlock}>
                    <View style={styles.itemHeader}>
                      <Text style={styles.itemBarcode}>{b.barcode}</Text>
                      {b.foot !== 'PAIR' ? (
                        <Badge label={FOOT_LABEL[b.foot]} color={COLORS.statusClosed} />
                      ) : (
                        <Text style={styles.itemMeta}>Pair</Text>
                      )}
                    </View>
                    <SummaryLine item={b} />
                    {!!b.source_carton_barcode && (
                      <Text style={styles.itemSource}>From carton {b.source_carton_barcode}</Text>
                    )}
                    <RoleGate allow={[...EDIT_ROLES]}>
                      <View style={styles.actionRow}>
                        <View style={styles.footToggle}>
                          {FOOT_OPTIONS.map((o) => {
                            const active = b.foot === o.value;
                            return (
                              <TouchableOpacity
                                key={o.value}
                                disabled={active || setFootMutation.isPending}
                                onPress={() => setFootMutation.mutate({ mapping_id: b.mapping_id, foot: o.value })}
                                style={[styles.footChip, active && styles.footChipActive]}
                                activeOpacity={0.7}
                              >
                                <Text style={[styles.footChipText, active && styles.footChipTextActive]}>
                                  {o.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                        <Button title="Remove" size="sm" variant="danger" onPress={() => confirmRemove(b)} />
                      </View>
                    </RoleGate>
                  </View>
                ))}
              </Card>
            )}
          </>
        )}

        {/* Danger zone */}
        <RoleGate allow={['Admin', 'Supervisor']}>
          {(items.length > 0 || canDelete) && (
            <View style={styles.dangerZone}>
              {items.length > 0 && (
                <Button
                  title="Empty Sample"
                  variant="outline"
                  onPress={confirmClear}
                  loading={clearMutation.isPending}
                  fullWidth
                />
              )}
              {canDelete && (
                <Button
                  title="Delete Sample"
                  variant="danger"
                  onPress={confirmDelete}
                  loading={deleteMutation.isPending}
                  fullWidth
                  style={styles.dangerGap}
                />
              )}
            </View>
          )}
        </RoleGate>
      </ScrollView>

      <BarcodeScanner
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleCameraScan}
        title="Scan Box or Carton"
        expectedType="any"
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const mono = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 12, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: { marginBottom: 12 },

  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  barcode: { flex: 1, fontSize: 16, fontWeight: '700', color: COLORS.text, fontFamily: mono, marginRight: 8 },
  name: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 8 },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  infoLabel: { fontSize: 13, color: COLORS.textSecondary },
  infoValue: { fontSize: 13, color: COLORS.text, fontWeight: '500', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  hint: { fontSize: 12, color: COLORS.textSecondary, marginTop: 8 },

  sectionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 6 },

  // Scan
  footRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 10 },
  footLabel: { fontSize: 12, color: COLORS.textSecondary },
  footChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  footChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  footChipText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  footChipTextActive: { color: '#FFFFFF' },
  scanRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scanInput: {
    flex: 1,
    height: 42,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
    fontFamily: mono,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBtnDisabled: { opacity: 0.5 },
  cameraBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Assortment
  assortmentRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  assortmentLabel: { flex: 1, fontSize: 12, color: COLORS.text, marginRight: 8 },
  assortmentQty: { fontSize: 12, fontWeight: '700', color: COLORS.text },

  // Items
  itemBlock: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: COLORS.border },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemBarcode: { fontSize: 14, fontWeight: '700', color: COLORS.text, fontFamily: mono },
  itemMeta: { fontSize: 12, color: COLORS.textSecondary },
  itemSummary: { fontSize: 12, color: COLORS.textSecondary, marginTop: 3 },
  itemSource: { fontSize: 11, color: COLORS.textLight, marginTop: 2 },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 },
  footToggle: { flexDirection: 'row', gap: 6, flexShrink: 1 },

  // Danger zone
  dangerZone: { marginTop: 4 },
  dangerGap: { marginTop: 8 },
});

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

import { COLORS, ECOMMERCE_STATUS_COLORS } from '../../constants';
import { ecommerceService } from '../../services/ecommerce.service';
import { childBoxService } from '../../services/childBox.service';
import type { EcommerceRecord, AssortmentItem, ChildBoxWithProduct } from '../../types';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { formatDate, parseQRCode } from '../../utils';

import RoleGate, { useHasRole } from '../../components/RoleGate';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import BarcodeScanner from '../../components/BarcodeScanner';

// ─── Constants ────────────────────────────────────────────────────────────────

const CHILD_BOX_COLLAPSE_THRESHOLD = 5;

const ECOMMERCE_INVALIDATE_KEYS = (id: string) => [
  ['ecommerce'],
  ['ecommerce', id],
  ['ecommerce-assortment', id],
  ['childBoxes'],
  ['inventory-summary'],
  ['inventory-hierarchy'],
  ['dashboard-stats'],
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function TimelineRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.timelineRow}>
      <Text style={styles.timelineLabel}>{label}</Text>
      <Text style={styles.timelineValue}>{value}</Text>
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
      <View style={styles.assortmentCountPill}>
        <Text style={styles.assortmentCountText}>x{item.count}</Text>
      </View>
    </View>
  );
}

interface ChildBoxRowProps {
  box: ChildBoxWithProduct;
  canRemove: boolean;
  onRemove: () => void;
}

function ChildBoxRow({ box, canRemove, onRemove }: ChildBoxRowProps) {
  return (
    <View style={styles.childBoxRow}>
      <View style={styles.childBoxTop}>
        <Text style={styles.childBoxBarcode} numberOfLines={1}>
          {box.barcode}
        </Text>
        <View style={styles.childBoxTopRight}>
          <Badge label={box.status} type="childBox" />
          {canRemove && (
            <TouchableOpacity
              style={styles.childBoxTrash}
              onPress={onRemove}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={18} color={COLORS.error} />
            </TouchableOpacity>
          )}
        </View>
      </View>
      <Text style={styles.childBoxDesc} numberOfLines={1}>
        {box.article_name} · {box.colour} · {box.size}
      </Text>
      <Text style={styles.childBoxMeta}>
        {box.sku} · ₹{Number(box.mrp).toFixed(2)}
      </Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function EcommerceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // Role checks (called unconditionally)
  const isManager = useHasRole(['Admin', 'Supervisor']);
  const canDispatch = useHasRole(['Admin', 'Supervisor', 'Dispatch Operator']);

  // ── Data queries ────────────────────────────────────────────────────────────
  const recordQ = useApiQuery(
    ['ecommerce', id ?? ''],
    () => ecommerceService.getById(id!),
    { enabled: !!id },
  );

  const assortmentQ = useApiQuery(
    ['ecommerce-assortment', id ?? ''],
    () => ecommerceService.getAssortment(id!),
    { enabled: !!id && !!recordQ.data },
  );

  const record: EcommerceRecord | undefined = recordQ.data;

  // ── Child boxes collapsible ─────────────────────────────────────────────────
  const childBoxCount = record?.child_boxes?.length ?? 0;
  const [childBoxesExpanded, setChildBoxesExpanded] = useState<boolean>(
    childBoxCount <= CHILD_BOX_COLLAPSE_THRESHOLD,
  );

  // ── Pull-to-refresh ─────────────────────────────────────────────────────────
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([recordQ.refetch(), assortmentQ.refetch()]);
    setRefreshing(false);
  };

  // ── Add Box scan section ────────────────────────────────────────────────────
  const [addBoxOpen, setAddBoxOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [addingBox, setAddingBox] = useState(false);

  const addBox = async (raw: string) => {
    const parsed = parseQRCode(raw);
    const barcode = parsed.type === 'child' ? parsed.id : raw.trim().toUpperCase();
    setAddingBox(true);
    try {
      const box = await childBoxService.getByBarcode(barcode);
      if (box.status !== 'FREE' && box.status !== 'GENERATED') {
        Alert.alert(
          'Box not available',
          `Box ${barcode} is ${box.status} — only FREE or GENERATED boxes can be added.`,
        );
        return;
      }
      await ecommerceService.addBox({ child_box_id: box.id, ecommerce_record_id: id! });
      Alert.alert('Success', `Box ${barcode} added to record.`);
      recordQ.refetch();
      assortmentQ.refetch();
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Failed to add box';
      Alert.alert('Error', msg);
    } finally {
      setAddingBox(false);
    }
  };

  const handleScan = (raw: string) => {
    setScannerOpen(false);
    addBox(raw);
  };

  const handleManualAdd = () => {
    const trimmed = manualBarcode.trim();
    if (!trimmed) return;
    setManualBarcode('');
    addBox(trimmed);
  };

  // ── Close mutation ──────────────────────────────────────────────────────────
  const closeMutation = useApiMutation<EcommerceRecord, string>(
    (recordId) => ecommerceService.close(recordId),
    {
      successMessage: 'Record closed successfully.',
      invalidateKeys: id ? ECOMMERCE_INVALIDATE_KEYS(id) : [],
    },
  );

  function confirmClose() {
    if (!record) return;
    Alert.alert(
      'Close Record?',
      `This will close "${record.name}" (${record.child_count} boxes) and move it to closed status.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Close', onPress: () => closeMutation.mutate(record.id) },
      ],
    );
  }

  // ── Full Unpack mutation ────────────────────────────────────────────────────
  const unpackMutation = useApiMutation<EcommerceRecord, string>(
    (recordId) => ecommerceService.fullUnpack(recordId),
    {
      successMessage: 'Record fully unpacked. All boxes returned to FREE.',
      invalidateKeys: id ? ECOMMERCE_INVALIDATE_KEYS(id) : [],
    },
  );

  function confirmUnpack() {
    if (!record) return;
    Alert.alert(
      'Full Unpack?',
      `This will release all ${record.child_count} boxes from "${record.name}" back to FREE status. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unpack',
          style: 'destructive',
          onPress: () => unpackMutation.mutate(record.id),
        },
      ],
    );
  }

  // ── Remove Box mutation ─────────────────────────────────────────────────────
  const removeBoxMutation = useApiMutation<any, { child_box_id: string; ecommerce_record_id: string }>(
    (vars) => ecommerceService.removeBox(vars),
    {
      successMessage: 'Box removed from record.',
      invalidateKeys: id ? ECOMMERCE_INVALIDATE_KEYS(id) : [],
    },
  );

  function confirmRemoveBox(box: ChildBoxWithProduct) {
    Alert.alert(
      'Remove Box?',
      `Remove ${box.barcode} from this record?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            removeBoxMutation.mutate({ child_box_id: box.id, ecommerce_record_id: id! }),
        },
      ],
    );
  }

  // ─── Loading / not found ────────────────────────────────────────────────────
  if (recordQ.isLoading && !record) {
    return (
      <>
        <Stack.Screen options={{ title: 'E-commerce Details' }} />
        <View style={styles.centeredContainer}>
          <Spinner />
        </View>
      </>
    );
  }

  if (!recordQ.isLoading && !record) {
    return (
      <>
        <Stack.Screen options={{ title: 'E-commerce Details' }} />
        <View style={styles.centeredContainer}>
          <EmptyState
            icon="cart-outline"
            title="Record not found"
            message="This e-commerce record may have been removed."
          />
        </View>
      </>
    );
  }

  // ── From here on record is defined ─────────────────────────────────────────
  const r = record!;
  const assortment: AssortmentItem[] = assortmentQ.data ?? [];
  const childBoxes: ChildBoxWithProduct[] = r.child_boxes ?? [];

  // Can remove boxes only for CREATED/ACTIVE
  const boxRemovable = isManager && (r.status === 'CREATED' || r.status === 'ACTIVE');

  // Can add box
  const canAddBox = isManager && (r.status === 'CREATED' || r.status === 'ACTIVE');

  // Can close
  const canClose = isManager && r.status === 'ACTIVE';

  // Can full unpack
  const canUnpack =
    isManager &&
    (r.status === 'CREATED' || r.status === 'ACTIVE' || r.status === 'CLOSED');

  // Dispatch visible
  const dispatchVisible = canDispatch && r.status === 'CLOSED';

  return (
    <>
      <Stack.Screen options={{ title: 'E-commerce Details' }} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
          />
        }
      >
        {/* ── 1. Header card ─────────────────────────────────────────────────── */}
        <Card style={styles.card}>
          <View style={styles.headerTopRow}>
            <Text style={styles.recordName} numberOfLines={2}>
              {r.name}
            </Text>
            <Badge label={r.status} color={ECOMMERCE_STATUS_COLORS[r.status]} />
          </View>

          <Text style={styles.barcodeText} numberOfLines={1}>
            {r.ecommerce_barcode}
          </Text>

          <Text style={styles.headerMeta}>
            {r.child_count} boxes
            {r.marketplace ? `  ·  Marketplace: ${r.marketplace}` : ''}
          </Text>
        </Card>

        {/* ── 2. Timeline card ───────────────────────────────────────────────── */}
        <Card style={styles.card}>
          <TimelineRow label="Created" value={formatDate(r.created_at)} />
          {!!r.mapped_date && (
            <TimelineRow label="Mapped Date" value={formatDate(r.mapped_date)} />
          )}
          {!!r.closed_at && (
            <TimelineRow label="Closed" value={formatDate(r.closed_at)} />
          )}
          {!!r.dispatched_at && (
            <TimelineRow label="Dispatched" value={formatDate(r.dispatched_at)} />
          )}
          {!!r.creator && (
            <TimelineRow label="Creator" value={r.creator.name ?? '—'} />
          )}
          {!!r.marketplace && (
            <TimelineRow label="Marketplace" value={r.marketplace} />
          )}
          {!!r.order_reference && (
            <TimelineRow label="Order Ref" value={r.order_reference} />
          )}
          {!!r.listing_sku && (
            <TimelineRow label="Listing SKU" value={r.listing_sku} />
          )}
        </Card>

        {/* ── 3. Action bar ──────────────────────────────────────────────────── */}
        {r.status === 'DISPATCHED' ? (
          <Text style={styles.dispatchedNote}>
            This record has been dispatched. No actions available.
          </Text>
        ) : (
          <View style={styles.actionBar}>
            {/* Add Box */}
            {canAddBox && (
              <Button
                title={addBoxOpen ? 'Hide Add Box' : 'Add Box'}
                variant={addBoxOpen ? 'outline' : 'primary'}
                fullWidth
                icon={
                  <Ionicons
                    name={addBoxOpen ? 'chevron-up' : 'add-circle-outline'}
                    size={20}
                    color={addBoxOpen ? COLORS.primary : COLORS.surface}
                  />
                }
                onPress={() => setAddBoxOpen((v) => !v)}
              />
            )}

            {/* Close */}
            {canClose && (
              <Button
                title="Close Record"
                variant="primary"
                fullWidth
                icon={
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={20}
                    color={COLORS.surface}
                  />
                }
                onPress={confirmClose}
                loading={closeMutation.isPending}
                disabled={closeMutation.isPending || unpackMutation.isPending}
              />
            )}

            {/* Full Unpack */}
            {canUnpack && (
              <Button
                title="Full Unpack"
                variant="outline"
                fullWidth
                icon={
                  <Ionicons
                    name="open-outline"
                    size={20}
                    color={COLORS.primary}
                  />
                }
                onPress={confirmUnpack}
                loading={unpackMutation.isPending}
                disabled={closeMutation.isPending || unpackMutation.isPending}
              />
            )}

            {/* Dispatch */}
            {dispatchVisible && (
              <Button
                title="Dispatch"
                variant="outline"
                fullWidth
                icon={
                  <Ionicons
                    name="paper-plane-outline"
                    size={20}
                    color={COLORS.primary}
                  />
                }
                onPress={() => router.push('/dispatch/create' as never)}
              />
            )}
          </View>
        )}

        {/* ── 3b. Add Box inline scan section ───────────────────────────────── */}
        {canAddBox && addBoxOpen && (
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Add Child Box</Text>

            <Button
              title={addingBox ? 'Adding…' : 'Scan Child Box'}
              onPress={() => setScannerOpen(true)}
              icon={<Ionicons name="qr-code-outline" size={18} color={COLORS.surface} />}
              fullWidth
              disabled={addingBox}
              style={styles.scanBtn}
            />

            <View style={styles.manualRow}>
              <TextInput
                style={styles.manualInput}
                value={manualBarcode}
                onChangeText={setManualBarcode}
                placeholder="Enter barcode manually…"
                placeholderTextColor={COLORS.textLight}
                autoCorrect={false}
                autoCapitalize="characters"
                returnKeyType="done"
                onSubmitEditing={handleManualAdd}
              />
              <TouchableOpacity
                style={styles.addBtn}
                onPress={handleManualAdd}
                activeOpacity={0.75}
                disabled={!manualBarcode.trim() || addingBox}
              >
                <Text style={styles.addBtnText}>Add</Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}

        {/* ── 4. Assortment card ─────────────────────────────────────────────── */}
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Assortment</Text>
          {assortmentQ.isLoading ? (
            <View style={styles.inlineSpinner}>
              <Spinner size="small" />
            </View>
          ) : assortment.length === 0 ? (
            <Text style={styles.emptyText}>No items</Text>
          ) : (
            assortment.map((item, idx) => (
              <AssortmentRow
                key={`${item.article_name}-${item.colour}-${item.size}-${idx}`}
                item={item}
              />
            ))
          )}
        </Card>

        {/* ── 5. Child boxes (collapsible) ───────────────────────────────────── */}
        {childBoxes.length > 0 && (
          <Card style={styles.card}>
            <TouchableOpacity
              style={styles.collapsibleHeader}
              onPress={() => setChildBoxesExpanded((v) => !v)}
              activeOpacity={0.7}
            >
              <Text style={styles.sectionTitle}>
                Child Boxes ({childBoxes.length})
              </Text>
              <Ionicons
                name={childBoxesExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={COLORS.textSecondary}
              />
            </TouchableOpacity>

            {childBoxesExpanded &&
              childBoxes.map((box, idx) => (
                <ChildBoxRow
                  key={box.id ?? idx}
                  box={box}
                  canRemove={boxRemovable}
                  onRemove={() => confirmRemoveBox(box)}
                />
              ))}
          </Card>
        )}
      </ScrollView>

      {/* Scanner modal for Add Box */}
      <BarcodeScanner
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
        expectedType="child"
        title="Scan Child Box"
      />
    </>
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
    paddingBottom: 32,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },

  // Cards
  card: {
    marginBottom: 0,
  },

  // Header card
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
    gap: 8,
  },
  recordName: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  barcodeText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 4,
  },
  headerMeta: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },

  // Timeline card
  timelineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderLight,
  },
  timelineLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    flex: 1,
  },
  timelineValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    flex: 2,
    textAlign: 'right',
  },

  // Action bar
  actionBar: {
    gap: 10,
  },
  dispatchedNote: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    paddingVertical: 8,
    fontStyle: 'italic',
  },

  // Add box scan section
  scanBtn: {
    marginBottom: 12,
  },
  manualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  manualInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 13,
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: COLORS.surface,
  },
  addBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 10 : 9,
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.surface,
  },

  // Assortment card
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 10,
  },
  inlineSpinner: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  assortmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.borderLight,
    gap: 8,
  },
  assortmentLabel: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
  },
  assortmentCountPill: {
    backgroundColor: COLORS.primary + '15',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
    minWidth: 36,
    alignItems: 'center',
  },
  assortmentCountText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },

  // Child boxes collapsible
  collapsibleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 0,
  },
  childBoxRow: {
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.borderLight,
    gap: 2,
  },
  childBoxTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  childBoxTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  childBoxTrash: {
    padding: 2,
  },
  childBoxBarcode: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginRight: 8,
  },
  childBoxDesc: {
    fontSize: 13,
    color: COLORS.text,
  },
  childBoxMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
});

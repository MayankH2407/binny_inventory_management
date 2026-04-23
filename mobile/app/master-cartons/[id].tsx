import { useState } from 'react';
import {
  View,
  Text,
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
import { masterCartonService } from '../../services/masterCarton.service';
import type { MasterCarton, AssortmentItem, ChildBoxWithProduct } from '../../types';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { formatDate } from '../../utils';

import RoleGate, { useHasRole } from '../../components/RoleGate';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';

// ─── Constants ────────────────────────────────────────────────────────────────

const CHILD_BOX_COLLAPSE_THRESHOLD = 5;

const INVALIDATE_KEYS = [
  ['masterCartons'],
  ['masterCarton-assortment'],
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

function ChildBoxRow({ box }: { box: ChildBoxWithProduct }) {
  return (
    <View style={styles.childBoxRow}>
      <View style={styles.childBoxTop}>
        <Text style={styles.childBoxBarcode} numberOfLines={1}>
          {box.barcode}
        </Text>
        <Badge label={box.status} type="childBox" />
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

export default function MasterCartonDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // Role checks for dispatch button (needs to be called unconditionally)
  const canDispatch = useHasRole(['Admin', 'Supervisor', 'Dispatch Operator']);

  // Data queries
  const cartonQ = useApiQuery(
    ['masterCarton', id ?? ''],
    () => masterCartonService.getById(id!),
    { enabled: !!id },
  );

  const assortmentQ = useApiQuery(
    ['masterCarton-assortment', id ?? ''],
    () => masterCartonService.getAssortment(id!),
    { enabled: !!id },
  );

  const carton: MasterCarton | undefined = cartonQ.data;

  // Child-boxes collapsible state — default collapsed for >5 boxes
  const childBoxCount = carton?.child_boxes?.length ?? 0;
  const [childBoxesExpanded, setChildBoxesExpanded] = useState<boolean>(
    childBoxCount <= CHILD_BOX_COLLAPSE_THRESHOLD,
  );

  // Pull-to-refresh
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([cartonQ.refetch(), assortmentQ.refetch()]);
    setRefreshing(false);
  };

  // ── Close mutation ──────────────────────────────────────────────────────────

  const closeMutation = useApiMutation<MasterCarton, string>(
    (cartonId) => masterCartonService.closeCarton(cartonId),
    {
      successMessage: 'Carton closed and stored successfully.',
      invalidateKeys: [
        ...INVALIDATE_KEYS,
        ['masterCarton', id ?? ''],
        ['masterCarton-assortment', id ?? ''],
      ],
    },
  );

  function confirmClose() {
    if (!carton) return;
    Alert.alert(
      'Close & Store?',
      `This will seal ${carton.carton_barcode} (${carton.child_count} boxes) and move it to closed inventory.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close & Store',
          onPress: () => closeMutation.mutate(carton.id),
        },
      ],
    );
  }

  // ── Unpack mutation ─────────────────────────────────────────────────────────

  const unpackMutation = useApiMutation<void, string>(
    (cartonId) => masterCartonService.fullUnpack(cartonId),
    {
      invalidateKeys: [
        ...INVALIDATE_KEYS,
        ['masterCarton', id ?? ''],
        ['masterCarton-assortment', id ?? ''],
      ],
    },
  );

  function confirmUnpack() {
    if (!carton) return;
    Alert.alert(
      'Unpack Carton?',
      `This will release all ${carton.child_count} child boxes from ${carton.carton_barcode} back to FREE status. This action cannot be undone.`,
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

  // ── Render: loading / not-found ─────────────────────────────────────────────

  if (cartonQ.isLoading && !carton) {
    return (
      <>
        <Stack.Screen options={{ title: 'Carton Details' }} />
        <View style={styles.centeredContainer}>
          <Spinner />
        </View>
      </>
    );
  }

  if (!cartonQ.isLoading && !carton) {
    return (
      <>
        <Stack.Screen options={{ title: 'Carton Details' }} />
        <View style={styles.centeredContainer}>
          <EmptyState
            icon="archive-outline"
            title="Carton not found"
            message="This carton may have been removed."
          />
        </View>
      </>
    );
  }

  // ── From here on carton is defined ─────────────────────────────────────────

  const c = carton!;
  const progressFill = c.max_capacity > 0 ? c.child_count / c.max_capacity : 0;
  const assortment: AssortmentItem[] = assortmentQ.data ?? [];
  const childBoxes: ChildBoxWithProduct[] = c.child_boxes ?? [];

  return (
    <>
      <Stack.Screen options={{ title: 'Carton Details' }} />

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
        {/* ── 1. Header card ────────────────────────────────────────────────── */}
        <Card style={styles.card}>
          <View style={styles.headerTopRow}>
            <Text style={styles.barcodeText} numberOfLines={1}>
              {c.carton_barcode}
            </Text>
            <Badge label={c.status} type="carton" />
          </View>

          <Text style={styles.capacityText}>
            {c.child_count} / {c.max_capacity} boxes
          </Text>

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.min(progressFill * 100, 100)}%` },
              ]}
            />
          </View>
        </Card>

        {/* ── 2. Timeline card ──────────────────────────────────────────────── */}
        <Card style={styles.card}>
          <TimelineRow label="Created" value={formatDate(c.created_at)} />
          {!!c.closed_at && (
            <TimelineRow label="Closed" value={formatDate(c.closed_at)} />
          )}
          {!!c.dispatched_at && (
            <TimelineRow label="Dispatched" value={formatDate(c.dispatched_at)} />
          )}
          {!!c.creator && (
            <TimelineRow label="Creator" value={c.creator.name ?? '—'} />
          )}
        </Card>

        {/* ── 3. Action bar ─────────────────────────────────────────────────── */}
        {c.status === 'DISPATCHED' ? (
          <Text style={styles.dispatchedNote}>
            This carton has been dispatched. No actions available.
          </Text>
        ) : (
          <RoleGate allow={['Admin', 'Supervisor', 'Warehouse Operator']}>
            <View style={styles.actionBar}>
              {c.status === 'ACTIVE' && (
                <>
                  <Button
                    title="Close & Store"
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
                  <Button
                    title="Unpack"
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
                </>
              )}

              {c.status === 'CLOSED' && (
                <>
                  <Button
                    title="Unpack"
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
                    disabled={unpackMutation.isPending}
                  />
                  {canDispatch && (
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
                </>
              )}

              {c.status === 'CREATED' && (
                <Button
                  title="Unpack"
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
                  disabled={unpackMutation.isPending}
                />
              )}
            </View>
          </RoleGate>
        )}

        {/* ── 4. Assortment card ────────────────────────────────────────────── */}
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

        {/* ── 5. Child boxes (collapsible) ──────────────────────────────────── */}
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
                <ChildBoxRow key={box.id ?? idx} box={box} />
              ))}
          </Card>
        )}
      </ScrollView>
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
    marginBottom: 0, // gap handled by content's gap
  },

  // Header card
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  barcodeText: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginRight: 10,
  },
  capacityText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 10,
  },
  progressTrack: {
    height: 4,
    backgroundColor: COLORS.borderLight,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
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

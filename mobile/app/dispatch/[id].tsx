import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Platform,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { AxiosError } from 'axios';

import { COLORS, CHILD_BOX_STATUS_COLORS, RETURN_STATUS_COLORS } from '../../constants';
import { dispatchService } from '../../services/dispatch.service';
import { returnsService } from '../../services/returns.service';
import type { DispatchRecord, DispatchSourceType, ReturnableItem, ReturnRecord, CreateReturnRequest } from '../../types';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { formatDate } from '../../utils';
import { useHasRole } from '../../components/RoleGate';

import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function ReturnableItemLine({ item }: { item: ReturnableItem }) {
  const summary = item.product_summary;
  const article = item.article_name || summary?.article_summary;
  const colour = item.colour || summary?.colour_summary;
  const size = item.size || summary?.size_summary;
  const mrp = item.mrp ?? summary?.mrp;

  if (!article && !colour && !size) return null;

  const metaParts: string[] = [];
  if (colour) metaParts.push(colour);
  if (size) metaParts.push(size);
  if (mrp != null) metaParts.push(`₹${Number(mrp).toFixed(2)}`);

  return (
    <>
      {!!article && <Text style={styles.returnItemArticle}>{article}</Text>}
      {metaParts.length > 0 && <Text style={styles.returnItemMeta}>{metaParts.join(' · ')}</Text>}
    </>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function DispatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const dispatchQ = useApiQuery(
    ['dispatch', id ?? ''],
    () => dispatchService.getById(id!),
    { enabled: !!id },
  );

  const dispatch: DispatchRecord | undefined = dispatchQ.data;

  // Pull-to-refresh
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await dispatchQ.refetch();
    setRefreshing(false);
  };

  // ── Returns section (role-gated) ──────────────────────────────────────────────
  const canReturn = useHasRole(['Admin', 'Supervisor', 'Dispatch Operator']);

  const returnableQ = useApiQuery(
    ['dispatch-returnable', id ?? ''],
    () => returnsService.getDispatchItems(id!),
    { enabled: !!id && canReturn, retry: false }
  );

  const [returnReason, setReturnReason] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const lastSignatureRef = useRef<string | null>(null);

  // Default: every currently-returnable item is checked. Re-derive whenever
  // the set of returnable barcodes changes (initial load, or a return removes
  // items from the returnable pool) without clobbering the user's own
  // unchecking within the same set.
  useEffect(() => {
    if (!returnableQ.data) return;
    const returnableBarcodes = returnableQ.data.items.filter((i) => i.returnable).map((i) => i.barcode);
    const signature = [...returnableBarcodes].sort().join(',');
    if (lastSignatureRef.current === signature) return;
    lastSignatureRef.current = signature;
    setSelected(new Set(returnableBarcodes));
  }, [returnableQ.data]);

  const toggleReturnItem = (item: ReturnableItem) => {
    if (!item.returnable) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item.barcode)) {
        next.delete(item.barcode);
      } else {
        next.add(item.barcode);
      }
      return next;
    });
  };

  const returnableItems = returnableQ.data?.items ?? [];
  const returnableCount = returnableItems.filter((i) => i.returnable).length;

  const selectAllReturnable = () => {
    setSelected(new Set(returnableItems.filter((i) => i.returnable).map((i) => i.barcode)));
  };
  const selectNoneReturnable = () => setSelected(new Set());

  const selectedReturnItems = useMemo(
    () => returnableItems.filter((i) => selected.has(i.barcode)),
    [returnableItems, selected]
  );

  const returnMutation = useApiMutation<ReturnRecord, CreateReturnRequest>(
    (vars) => returnsService.create(vars),
    {
      successMessage: 'Return recorded',
      invalidateKeys: [
        ['dispatch', id ?? ''],
        ['dispatch-returnable', id ?? ''],
        ['dispatches'],
        ['returns'],
        ['inventory'],
        ['dashboard-stats'],
      ],
      onSuccess: () => setReturnReason(''),
    }
  );

  const handleSubmitReturn = () => {
    if (selectedReturnItems.length === 0) {
      Alert.alert('No items selected', 'Select at least one item to return.');
      return;
    }
    returnMutation.mutate({
      dispatch_record_id: id!,
      reason: returnReason.trim() || undefined,
      items: selectedReturnItems.map((i) => ({ barcode: i.barcode, item_type: i.item_type })),
    });
  };

  const returnableIsNotSupported =
    returnableQ.isError &&
    (returnableQ.error as AxiosError)?.response?.status === 400;
  const returnableNotSupportedMessage =
    ((returnableQ.error as AxiosError<{ message?: string }>)?.response?.data?.message) ||
    'Returns are not supported for sample dispatches';

  // ── Loading state ───────────────────────────────────────────────────────────

  if (dispatchQ.isLoading && !dispatch) {
    return (
      <>
        <Stack.Screen options={{ title: 'Dispatch' }} />
        <View style={styles.centeredContainer}>
          <Spinner />
        </View>
      </>
    );
  }

  // ── Not found ───────────────────────────────────────────────────────────────

  if (!dispatchQ.isLoading && !dispatch) {
    return (
      <>
        <Stack.Screen options={{ title: 'Dispatch' }} />
        <View style={styles.centeredContainer}>
          <EmptyState
            icon="paper-plane-outline"
            title="Dispatch not found"
            message="This dispatch record may have been removed."
          />
        </View>
      </>
    );
  }

  // ── From here on dispatch is defined ────────────────────────────────────────

  const d = dispatch!;

  // Determine whether audit footer needs the "Record created" line
  const dispatchDay = d.dispatch_date.split('T')[0];
  const createdDay = d.created_at.split('T')[0];
  const showCreatedAt = createdDay !== dispatchDay;

  // Source type helpers
  const sourceType: DispatchSourceType =
    d.source_type ??
    (d.master_carton_id ? 'master_carton' : 'master_carton');

  const sourceChipBgColor =
    sourceType === 'sample'
      ? '#FEE2E2'
      : sourceType === 'ecommerce'
      ? '#F3E8FF'
      : '#EEF0FF';
  const sourceChipTextColor =
    sourceType === 'sample'
      ? COLORS.error
      : sourceType === 'ecommerce'
      ? CHILD_BOX_STATUS_COLORS.ECOMMERCE
      : COLORS.primary;
  const sourceChipLabel =
    sourceType === 'sample'
      ? 'Sample'
      : sourceType === 'ecommerce'
      ? 'E-commerce'
      : 'Carton';

  const sourceTypeLabel =
    sourceType === 'sample'
      ? 'Sample'
      : sourceType === 'ecommerce'
      ? 'E-commerce'
      : 'Master Carton';

  // Navigation to source record
  const handleViewSource = () => {
    if (sourceType === 'master_carton' && d.master_carton_id) {
      router.push(('/master-cartons/' + d.master_carton_id) as any);
    } else if (sourceType === 'sample' && d.sample_record_id) {
      router.push(('/samples/' + d.sample_record_id) as any);
    } else if (sourceType === 'ecommerce' && d.ecommerce_record_id) {
      router.push(('/ecommerce/' + d.ecommerce_record_id) as any);
    }
  };

  const hasSourceLink =
    (sourceType === 'master_carton' && !!d.master_carton_id) ||
    (sourceType === 'sample' && !!d.sample_record_id) ||
    (sourceType === 'ecommerce' && !!d.ecommerce_record_id);

  return (
    <>
      <Stack.Screen options={{ title: 'Dispatch' }} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* ── 1. Header card ────────────────────────────────────────────────── */}
        <Card style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.barcodeText} numberOfLines={1}>
              {d.source_label ?? d.carton_barcode ?? '—'}
            </Text>
            <View
              style={[
                styles.sourceChip,
                { backgroundColor: sourceChipBgColor },
              ]}
            >
              <Text style={[styles.sourceChipText, { color: sourceChipTextColor }]}>
                {sourceChipLabel}
              </Text>
            </View>
            <Text style={styles.headerDate}>
              {formatDate(d.dispatch_date)}
            </Text>
          </View>
          {!!d.return_status && d.return_status !== 'none' && (
            <View style={styles.returnStatusRow}>
              <View
                style={[
                  styles.returnPill,
                  { backgroundColor: RETURN_STATUS_COLORS[d.return_status] + '18' },
                ]}
              >
                <Text style={[styles.returnPillText, { color: RETURN_STATUS_COLORS[d.return_status] }]}>
                  {d.return_status === 'full' ? 'Fully Returned' : 'Partially Returned'}
                </Text>
              </View>
              <Text style={styles.returnProgressText}>
                {d.returned_box_count ?? 0} of {d.total_box_count ?? d.child_count ?? '?'} boxes returned
              </Text>
            </View>
          )}
        </Card>

        {/* ── 2. Customer card ──────────────────────────────────────────────── */}
        <Card style={styles.card}>
          <SectionTitle title="Customer" />
          {d.customer_firm_name ? (
            <Text style={styles.customerName}>{d.customer_firm_name}</Text>
          ) : (
            <Text style={styles.mutedText}>— No customer —</Text>
          )}
        </Card>

        {/* ── 3. Source card ───────────────────────────────────────────────── */}
        <Card style={styles.card}>
          <SectionTitle title="Source" />
          <SummaryRow label="Type" value={sourceTypeLabel} />
          {hasSourceLink && (
            <TouchableOpacity
              style={styles.viewSourceRow}
              onPress={handleViewSource}
              activeOpacity={0.7}
            >
              <Text style={styles.viewSourceText}>View source record</Text>
              <Ionicons name="arrow-forward-outline" size={16} color={COLORS.primary} />
            </TouchableOpacity>
          )}
        </Card>

        {/* ── 5. Shipment card (only if any field has a value) ──────────────── */}
        {(d.destination || d.transport_details || d.lr_number || d.vehicle_number) && (
          <Card style={styles.card}>
            <SectionTitle title="Shipment" />
            {!!d.destination && (
              <SummaryRow label="Destination" value={d.destination} />
            )}
            {!!d.transport_details && (
              <SummaryRow label="Transport" value={d.transport_details} />
            )}
            {!!d.lr_number && (
              <SummaryRow label="LR Number" value={d.lr_number} />
            )}
            {!!d.vehicle_number && (
              <SummaryRow label="Vehicle No." value={d.vehicle_number} />
            )}
          </Card>
        )}

        {/* ── 6. Contents card ──────────────────────────────────────────────── */}
        <Card style={styles.card}>
          <SectionTitle title="Contents" />
          <SummaryRow
            label="Child Boxes"
            value={d.child_count != null ? String(d.child_count) : '—'}
          />
          {!!d.article_summary && (
            <SummaryRow label="Articles" value={d.article_summary} />
          )}
          {!!d.colour_summary && (
            <SummaryRow label="Colours" value={d.colour_summary} />
          )}
          {!!d.size_summary && (
            <SummaryRow label="Sizes" value={d.size_summary} />
          )}
          {d.mrp_summary != null && (
            <SummaryRow
              label="Total MRP"
              value={`₹${Number(d.mrp_summary).toFixed(2)}`}
            />
          )}
        </Card>

        {/* ── 7. Notes card (only if notes present) ────────────────────────── */}
        {!!d.notes && (
          <Card style={styles.card}>
            <SectionTitle title="Notes" />
            <Text style={styles.notesText}>{d.notes}</Text>
          </Card>
        )}

        {/* ── 7b. Returns card (Admin / Supervisor / Dispatch Operator only) ── */}
        {canReturn && (
          <Card style={styles.card}>
            <View style={styles.returnsCardHeader}>
              <Ionicons name="return-down-back-outline" size={16} color={COLORS.primary} />
              <Text style={styles.returnsCardTitle}>Return Items From This Dispatch</Text>
            </View>

            {returnableQ.isLoading ? (
              <Text style={styles.mutedText}>Loading items…</Text>
            ) : returnableIsNotSupported ? (
              <Text style={styles.mutedText}>{returnableNotSupportedMessage}</Text>
            ) : returnableItems.length === 0 ? (
              <Text style={styles.mutedText}>No items found on this dispatch.</Text>
            ) : returnableCount === 0 ? (
              <View style={styles.allReturnedBox}>
                <Ionicons name="checkmark-done-outline" size={28} color={COLORS.textLight} />
                <Text style={styles.allReturnedTitle}>All items returned</Text>
                <Text style={styles.allReturnedMessage}>
                  Every item on this dispatch has already been returned.
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.selectRow}>
                  <Text style={styles.selectRowText}>
                    {selectedReturnItems.length} of {returnableCount} returnable selected
                  </Text>
                  <View style={styles.selectRowActions}>
                    <TouchableOpacity onPress={selectAllReturnable} style={styles.selectLink}>
                      <Text style={styles.selectLinkText}>All</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={selectNoneReturnable} style={styles.selectLink}>
                      <Text style={styles.selectLinkText}>None</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={styles.returnItemsList}>
                  {returnableItems.map((item) => {
                    const checked = selected.has(item.barcode);
                    return (
                      <TouchableOpacity
                        key={item.barcode}
                        style={[
                          styles.returnItemRow,
                          !item.returnable && styles.returnItemRowDisabled,
                        ]}
                        activeOpacity={item.returnable ? 0.7 : 1}
                        onPress={() => toggleReturnItem(item)}
                        disabled={!item.returnable}
                      >
                        <Ionicons
                          name={checked ? 'checkbox' : 'square-outline'}
                          size={20}
                          color={item.returnable ? COLORS.primary : COLORS.textLight}
                          style={styles.returnItemCheckbox}
                        />
                        <View style={styles.returnItemInfo}>
                          <View style={styles.returnItemBadgeRow}>
                            <Badge
                              label={item.item_type === 'CARTON' ? 'Carton' : 'Box'}
                              color={item.item_type === 'CARTON' ? COLORS.primary : COLORS.textSecondary}
                            />
                            <Text style={styles.returnItemBarcode}>{item.barcode}</Text>
                            {item.returned && (
                              <Badge label="Returned" color={COLORS.success} />
                            )}
                          </View>
                          <ReturnableItemLine item={item} />
                          {item.returned && item.returned_at && (
                            <Text style={styles.returnItemReturnedAt}>
                              Returned on {formatDate(item.returned_at)}
                            </Text>
                          )}
                          {!item.returnable && !item.returned && item.reason && (
                            <Text style={styles.returnItemReason}>{item.reason}</Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Input
                  label="Reason (optional)"
                  placeholder="Why is this stock being returned?"
                  value={returnReason}
                  onChangeText={setReturnReason}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  style={styles.returnReasonInput}
                  containerStyle={styles.returnReasonContainer}
                />

                <Button
                  title={
                    selectedReturnItems.length === 0
                      ? 'Return Selected'
                      : `Return Selected (${selectedReturnItems.length})`
                  }
                  onPress={handleSubmitReturn}
                  icon={<Ionicons name="return-down-back-outline" size={18} color={COLORS.surface} />}
                  fullWidth
                  disabled={selectedReturnItems.length === 0 || returnMutation.isPending}
                  loading={returnMutation.isPending}
                />
              </>
            )}
          </Card>
        )}

        {/* ── 8. Audit footer ───────────────────────────────────────────────── */}
        <View style={styles.auditFooter}>
          <Text style={styles.auditText}>
            Dispatched at: {formatDate(d.dispatch_date)}
          </Text>
          {showCreatedAt && (
            <Text style={styles.auditText}>
              Record created: {formatDate(d.created_at)}
            </Text>
          )}
        </View>
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  barcodeText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  returnStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  returnPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    flexShrink: 0,
  },
  returnPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  returnProgressText: {
    fontSize: 12,
    color: COLORS.warning,
    fontWeight: '600',
    flexShrink: 1,
  },
  headerDate: {
    fontSize: 13,
    color: COLORS.textSecondary,
    flexShrink: 0,
  },

  // Source chip (in header)
  sourceChip: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    flexShrink: 0,
  },
  sourceChipText: {
    fontSize: 10,
    fontWeight: '700',
  },

  // Source card — view link row
  viewSourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.borderLight,
    marginTop: 2,
  },
  viewSourceText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },

  // Section title
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },

  // Customer card
  customerName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  mutedText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },

  // Summary rows (Shipment + Contents)
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 6,
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

  // Notes card
  notesText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },

  // Audit footer
  auditFooter: {
    paddingHorizontal: 4,
    paddingTop: 4,
    gap: 2,
  },
  auditText: {
    fontSize: 11,
    color: COLORS.textLight,
  },

  // ── Returns card ────────────────────────────────────────────────────────────
  returnsCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  returnsCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  allReturnedBox: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 6,
  },
  allReturnedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  allReturnedMessage: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  selectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  selectRowText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    flex: 1,
  },
  selectRowActions: {
    flexDirection: 'row',
    gap: 12,
  },
  selectLink: {
    paddingVertical: 4,
    paddingHorizontal: 4,
  },
  selectLinkText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  returnItemsList: {
    marginBottom: 14,
  },
  returnItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderLight,
  },
  returnItemRowDisabled: {
    opacity: 0.55,
  },
  returnItemCheckbox: {
    marginTop: 2,
  },
  returnItemInfo: {
    flex: 1,
    minWidth: 0,
  },
  returnItemBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  returnItemBarcode: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  returnItemArticle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 1,
  },
  returnItemMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 1,
  },
  returnItemReturnedAt: {
    fontSize: 11,
    color: COLORS.success,
    marginTop: 1,
  },
  returnItemReason: {
    fontSize: 11,
    color: COLORS.error,
    marginTop: 1,
  },
  returnReasonContainer: {
    marginBottom: 12,
  },
  returnReasonInput: {
    minHeight: 70,
    paddingTop: 12,
  },
});

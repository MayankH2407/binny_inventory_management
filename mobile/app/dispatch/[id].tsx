import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { COLORS, CHILD_BOX_STATUS_COLORS } from '../../constants';
import { dispatchService } from '../../services/dispatch.service';
import type { DispatchRecord, DispatchSourceType } from '../../types';
import { useApiQuery } from '../../hooks/useApi';
import { formatDate } from '../../utils';

import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';

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
});

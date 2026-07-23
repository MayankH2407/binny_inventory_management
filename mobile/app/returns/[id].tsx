import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl, StyleSheet, Platform } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';

import { COLORS } from '../../constants';
import { returnsService } from '../../services/returns.service';
import type { ReturnRecord, ReturnItem } from '../../types';
import { useApiQuery } from '../../hooks/useApi';
import { formatDate } from '../../utils';

import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import Badge from '../../components/ui/Badge';

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

function ItemRow({ item, isLast }: { item: ReturnItem; isLast: boolean }) {
  const metaParts: string[] = [];
  if (item.colour) metaParts.push(item.colour);
  if (item.size) metaParts.push(item.size);
  if (item.mrp != null) metaParts.push(`₹${Number(item.mrp).toFixed(2)}`);

  return (
    <View style={[styles.itemRow, !isLast && styles.itemRowBorder]}>
      <View style={styles.itemBadgeRow}>
        <Badge
          label={item.item_type === 'CARTON' ? 'Carton' : 'Box'}
          color={item.item_type === 'CARTON' ? COLORS.primary : COLORS.textSecondary}
        />
        <Text style={styles.itemBarcode}>{item.barcode}</Text>
      </View>
      {!!item.article_name && <Text style={styles.itemArticle}>{item.article_name}</Text>}
      {metaParts.length > 0 && <Text style={styles.itemMeta}>{metaParts.join(' · ')}</Text>}
      {!!item.carton_barcode && (
        <Text style={styles.itemMeta}>Carton: {item.carton_barcode}</Text>
      )}
      {!!item.origin_dispatch_label && (
        <Text style={styles.itemOrigin} numberOfLines={1}>
          Origin: {item.origin_dispatch_label}
        </Text>
      )}
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ReturnDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const returnQ = useApiQuery(
    ['return', id ?? ''],
    () => returnsService.getById(id!),
    { enabled: !!id }
  );

  const record: ReturnRecord | undefined = returnQ.data;

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await returnQ.refetch();
    setRefreshing(false);
  };

  if (returnQ.isLoading && !record) {
    return (
      <>
        <Stack.Screen options={{ title: 'Return' }} />
        <View style={styles.centeredContainer}>
          <Spinner />
        </View>
      </>
    );
  }

  if (!returnQ.isLoading && !record) {
    return (
      <>
        <Stack.Screen options={{ title: 'Return' }} />
        <View style={styles.centeredContainer}>
          <EmptyState
            icon="return-down-back-outline"
            title="Return not found"
            message="This return record may have been removed."
          />
        </View>
      </>
    );
  }

  const r = record!;
  const items = r.items ?? [];

  return (
    <>
      <Stack.Screen options={{ title: 'Return' }} />

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
        {/* Header card */}
        <Card style={styles.card}>
          <View style={styles.headerRow}>
            <View
              style={[
                styles.sourceChip,
                r.dispatch_record_id ? styles.sourceChipDispatch : styles.sourceChipBlind,
              ]}
            >
              <Text
                style={[
                  styles.sourceChipText,
                  r.dispatch_record_id ? styles.sourceChipTextDispatch : styles.sourceChipTextBlind,
                ]}
              >
                {r.dispatch_record_id ? 'Against Dispatch' : 'Blind Scan-in'}
              </Text>
            </View>
            <Text style={styles.headerDate}>{formatDate(r.return_date)}</Text>
          </View>
          {!!r.source_label && (
            <Text style={styles.sourceLabelText}>{r.source_label}</Text>
          )}
        </Card>

        {/* Customer / returned-by card */}
        <Card style={styles.card}>
          <SectionTitle title="Customer" />
          <Text style={r.customer_firm_name ? styles.customerName : styles.mutedText}>
            {r.customer_firm_name ?? '— Blind / No Customer —'}
          </Text>
          {!!r.returned_by_name && (
            <SummaryRow label="Returned By" value={r.returned_by_name} />
          )}
        </Card>

        {/* Contents summary */}
        <Card style={styles.card}>
          <SectionTitle title="Contents" />
          <SummaryRow label="Items" value={String(r.item_count ?? items.length)} />
          {r.box_count != null && <SummaryRow label="Boxes" value={String(r.box_count)} />}
          {r.pairs != null && <SummaryRow label="Pairs" value={String(r.pairs)} />}
          {!!r.article_summary && <SummaryRow label="Articles" value={r.article_summary} />}
          {!!r.colour_summary && <SummaryRow label="Colours" value={r.colour_summary} />}
          {!!r.size_summary && <SummaryRow label="Sizes" value={r.size_summary} />}
        </Card>

        {/* Reason / notes */}
        {(!!r.reason || !!r.notes) && (
          <Card style={styles.card}>
            {!!r.reason && (
              <>
                <SectionTitle title="Reason" />
                <Text style={styles.notesText}>{r.reason}</Text>
              </>
            )}
            {!!r.notes && (
              <>
                <SectionTitle title="Notes" />
                <Text style={styles.notesText}>{r.notes}</Text>
              </>
            )}
          </Card>
        )}

        {/* Items list */}
        <Card style={styles.card}>
          <SectionTitle title={`Returned Items (${items.length})`} />
          {items.length === 0 ? (
            <Text style={styles.mutedText}>No item details available for this return.</Text>
          ) : (
            <View>
              {items.map((item, idx) => (
                <ItemRow key={item.id} item={item} isLast={idx === items.length - 1} />
              ))}
            </View>
          )}
        </Card>

        {/* Audit footer */}
        <View style={styles.auditFooter}>
          <Text style={styles.auditText}>Returned at: {formatDate(r.return_date)}</Text>
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

  card: {
    marginBottom: 0,
  },

  // Header card
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  headerDate: {
    fontSize: 13,
    color: COLORS.textSecondary,
    flexShrink: 0,
  },
  sourceLabelText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 6,
  },

  // Source chip
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
  sourceChipDispatch: {
    backgroundColor: '#EEF0FF',
  },
  sourceChipTextDispatch: {
    color: COLORS.primary,
  },
  sourceChipBlind: {
    backgroundColor: COLORS.borderLight,
  },
  sourceChipTextBlind: {
    color: COLORS.textSecondary,
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

  notesText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
    marginBottom: 8,
  },

  // Item rows
  itemRow: {
    paddingVertical: 10,
  },
  itemRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderLight,
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

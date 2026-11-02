import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Stack, router } from '../../navigation/router';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { COLORS, CHILD_BOX_STATUS_COLORS, RETURN_STATUS_COLORS } from '../../constants';
import { dispatchService } from '../../services/dispatch.service';
import { shareCsv } from '../../utils/exportCsv';
import type { DispatchRecord, DispatchSourceType } from '../../types';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Spinner from '../../components/ui/Spinner';
import RoleGate from '../../components/RoleGate';
import { formatDate } from '../../utils';

type ReturnStatusFilter = 'none' | 'partial' | 'full' | undefined;

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Validate and normalise a freeform date string to YYYY-MM-DD, or undefined. */
const toISO = (v: string): string | undefined => {
  const trimmed = v.trim();
  if (!trimmed) return undefined;
  const d = new Date(trimmed + 'T00:00:00');
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString().split('T')[0];
};

const fmtISO = (d: Date): string => d.toISOString().split('T')[0];

// ─── Main component ───────────────────────────────────────────────────────────

export default function DispatchScreen() {
  // Search
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

  // Date range — raw text inputs
  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');

  // Validated dates sent to the API
  const [startDate, setStartDate] = useState<string | undefined>();
  const [endDate, setEndDate] = useState<string | undefined>();

  // Return-status filter
  const [returnStatus, setReturnStatus] = useState<ReturnStatusFilter>(undefined);

  // Export
  const [exporting, setExporting] = useState(false);

  // ── 300 ms debounce for search ─────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // ── Sync validated API dates from text inputs (also 300 ms debounced) ──────
  useEffect(() => {
    const timer = setTimeout(() => {
      setStartDate(toISO(fromInput));
      setEndDate(toISO(toInput));
    }, 300);
    return () => clearTimeout(timer);
  }, [fromInput, toInput]);

  // ── Quick-select date range helpers ───────────────────────────────────────
  const applyRange = useCallback((days: number) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - days + 1);
    const s = fmtISO(start);
    const e = fmtISO(end);
    setFromInput(s);
    setToInput(e);
    // Set immediately — no need to wait for the effect debounce on chip taps
    setStartDate(s);
    setEndDate(e);
  }, []);

  const clearDates = useCallback(() => {
    setFromInput('');
    setToInput('');
    setStartDate(undefined);
    setEndDate(undefined);
  }, []);

  // ── Infinite query ─────────────────────────────────────────────────────────
  const query = useInfiniteQuery({
    queryKey: ['dispatches', { search, startDate, endDate, returnStatus }],
    queryFn: ({ pageParam }) =>
      dispatchService.getAll({
        page: pageParam,
        limit: PAGE_SIZE,
        search: search || undefined,
        from_date: startDate,
        to_date: endDate,
        return_status: returnStatus || undefined,
      }),
    getNextPageParam: (last) =>
      last.page < last.totalPages ? last.page + 1 : undefined,
    initialPageParam: 1,
  });

  const items: DispatchRecord[] =
    query.data?.pages.flatMap((p) => p.data) ?? [];

  const handleLoadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      query.fetchNextPage();
    }
  }, [query]);

  // ── Export CSV ─────────────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const csv = await dispatchService.exportCsv({ from_date: startDate, to_date: endDate });
      await shareCsv('dispatch-report.csv', csv);
    } catch (err: any) {
      Alert.alert(
        'Export failed',
        err?.response?.data?.message ?? err?.message ?? 'Could not export the dispatch report.'
      );
    } finally {
      setExporting(false);
    }
  }, [startDate, endDate]);

  // ─── Row renderer ──────────────────────────────────────────────────────────

  const renderItem = useCallback(({ item: dispatch }: { item: DispatchRecord }) => {
    // Meta line: "12 boxes · ₹1,450.00 · LR 12345"
    const metaParts: string[] = [];
    // total_box_count is the universal count (sample / e-commerce dispatches
    // don't populate child_count, which only master-carton dispatches carry).
    metaParts.push(`${dispatch.total_box_count ?? dispatch.child_count ?? '?'} boxes`);
    if (dispatch.mrp_summary != null) {
      metaParts.push(`₹${Number(dispatch.mrp_summary).toFixed(2)}`);
    }
    if (dispatch.lr_number) {
      metaParts.push(`LR ${dispatch.lr_number}`);
    }
    // Dispatch-time details captured for sample / e-commerce dispatches
    if (dispatch.source_type === 'ecommerce') {
      const ec = [dispatch.marketplace, dispatch.order_reference].filter(Boolean).join(' · ');
      if (ec) metaParts.push(ec);
    } else if (dispatch.source_type === 'sample' && dispatch.sample_recipient_name) {
      metaParts.push(`To ${dispatch.sample_recipient_name}`);
    }
    const metaLine = metaParts.join(' · ');

    // Source type chip
    const sourceType: DispatchSourceType =
      dispatch.source_type ??
      (dispatch.master_carton_id ? 'master_carton' : 'master_carton');
    const sourceChipStyle =
      sourceType === 'sample'
        ? styles.sourceChipSample
        : sourceType === 'ecommerce'
        ? styles.sourceChipEcommerce
        : styles.sourceChipCarton;
    const sourceChipTextStyle =
      sourceType === 'sample'
        ? styles.sourceChipTextSample
        : sourceType === 'ecommerce'
        ? styles.sourceChipTextEcommerce
        : styles.sourceChipTextCarton;
    const sourceChipLabel =
      sourceType === 'sample'
        ? 'Sample'
        : sourceType === 'ecommerce'
        ? 'E-commerce'
        : 'Carton';

    // Display barcode: prefer source_label, then carton_barcode, else '—'
    const displayBarcode = dispatch.source_label ?? dispatch.carton_barcode ?? '—';

    // Return-status pill (only shown when some/all of the dispatch has been returned)
    const showReturnStatus = !!dispatch.return_status && dispatch.return_status !== 'none';
    const returnStatusColor: string = dispatch.return_status
      ? RETURN_STATUS_COLORS[dispatch.return_status]
      : COLORS.textLight;
    const returnStatusLabel = dispatch.return_status === 'full' ? 'Full Return' : 'Partial Return';

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => router.push(`/dispatch/${dispatch.id}` as any)}
        style={styles.rowTouchable}
      >
        <Card style={styles.itemCard}>
          {/* Row 1: Barcode + source chip + dispatch date */}
          <View style={styles.row1}>
            <Text style={styles.barcode} numberOfLines={1}>
              {displayBarcode}
            </Text>
            <View style={[styles.sourceChip, sourceChipStyle]}>
              <Text style={[styles.sourceChipText, sourceChipTextStyle]}>{sourceChipLabel}</Text>
            </View>
            {showReturnStatus && (
              <View style={[styles.returnPill, { backgroundColor: returnStatusColor + '18' }]}>
                <Text style={[styles.returnPillText, { color: returnStatusColor }]}>
                  {returnStatusLabel}
                </Text>
              </View>
            )}
            <Text style={styles.dateText}>
              {formatDate(dispatch.dispatch_date)}
            </Text>
          </View>

          {/* Return progress */}
          {showReturnStatus && (
            <Text style={styles.returnProgressLine}>
              {dispatch.returned_box_count ?? 0} of {dispatch.total_box_count ?? dispatch.child_count ?? '?'} returned
            </Text>
          )}

          {/* Customer firm name */}
          <Text
            style={[
              styles.customerLine,
              !dispatch.customer_firm_name && styles.mutedText,
            ]}
            numberOfLines={1}
          >
            {dispatch.customer_firm_name ?? '— No customer —'}
          </Text>

          {/* Article summary */}
          {!!dispatch.article_summary && (
            <Text style={styles.secondaryLine} numberOfLines={1}>
              {dispatch.article_summary}
            </Text>
          )}

          {/* Meta: boxes · MRP · LR */}
          <Text style={styles.metaLine} numberOfLines={1}>
            {metaLine}
          </Text>

          {/* Destination */}
          {!!dispatch.destination && (
            <Text style={styles.destinationLine} numberOfLines={1}>
              Destination: {dispatch.destination}
            </Text>
          )}
        </Card>
      </TouchableOpacity>
    );
  }, []);

  // ─── Footer ────────────────────────────────────────────────────────────────

  const ListFooter = useCallback(() => {
    if (query.isFetchingNextPage) {
      return (
        <View style={styles.footer}>
          <Spinner size="small" />
        </View>
      );
    }
    if (!query.hasNextPage && items.length > 0) {
      return (
        <View style={styles.footer}>
          <Text style={styles.footerText}>End of list</Text>
        </View>
      );
    }
    return null;
  }, [query.isFetchingNextPage, query.hasNextPage, items.length]);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <Stack.Screen options={{ title: 'Dispatches' }} />

      <View style={styles.container}>
        {/* Search bar */}
        <View style={styles.searchWrapper}>
          <Ionicons
            name="search-outline"
            size={18}
            color={COLORS.textSecondary}
            style={styles.searchIcon}
          />
          <TextInput
            style={styles.searchInput}
            value={searchInput}
            onChangeText={setSearchInput}
            placeholder="Search by carton barcode, customer..."
            placeholderTextColor={COLORS.textLight}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {searchInput.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchInput('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Date range filter */}
        <View style={styles.dateRangeWrapper}>
          <View style={styles.dateInputRow}>
            <View style={styles.dateInputGroup}>
              <Text style={styles.dateLabel}>From</Text>
              <TextInput
                style={styles.dateInput}
                value={fromInput}
                onChangeText={setFromInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.textLight}
                returnKeyType="done"
                autoCorrect={false}
                autoCapitalize="none"
                keyboardType="numeric"
              />
            </View>
            <View style={styles.dateSeparator} />
            <View style={styles.dateInputGroup}>
              <Text style={styles.dateLabel}>To</Text>
              <TextInput
                style={styles.dateInput}
                value={toInput}
                onChangeText={setToInput}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={COLORS.textLight}
                returnKeyType="done"
                autoCorrect={false}
                autoCapitalize="none"
                keyboardType="numeric"
              />
            </View>
          </View>

          {/* Quick-select chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={styles.chipsContent}
          >
            <TouchableOpacity
              style={styles.chip}
              onPress={() => applyRange(1)}
              activeOpacity={0.7}
            >
              <Text style={styles.chipText}>Today</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.chip}
              onPress={() => applyRange(7)}
              activeOpacity={0.7}
            >
              <Text style={styles.chipText}>Last 7 days</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.chip}
              onPress={() => applyRange(30)}
              activeOpacity={0.7}
            >
              <Text style={styles.chipText}>Last 30 days</Text>
            </TouchableOpacity>
            {(fromInput || toInput) && (
              <TouchableOpacity
                style={[styles.chip, styles.chipClear]}
                onPress={clearDates}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, styles.chipClearText]}>Clear</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.chip, styles.chipExport]}
              onPress={handleExport}
              activeOpacity={0.7}
              disabled={exporting}
            >
              {exporting ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <>
                  <Ionicons name="download-outline" size={14} color={COLORS.primary} />
                  <Text style={[styles.chipText, styles.chipExportText]}>Export CSV</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Return-status filter */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.returnFilterScroll}
          contentContainerStyle={styles.chipsContent}
        >
          {(
            [
              { value: undefined, label: 'All' },
              { value: 'none', label: 'Not Returned' },
              { value: 'partial', label: 'Partial' },
              { value: 'full', label: 'Full' },
            ] as Array<{ value: ReturnStatusFilter; label: string }>
          ).map((opt) => {
            const active = returnStatus === opt.value;
            return (
              <TouchableOpacity
                key={opt.label}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setReturnStatus(opt.value)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* List / loading / empty */}
        {query.isLoading && items.length === 0 ? (
          <View style={styles.centered}>
            <Spinner />
          </View>
        ) : !query.isLoading && items.length === 0 ? (
          <EmptyState
            icon="paper-plane-outline"
            title="No dispatches yet"
            message="Dispatch history will appear here."
          />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.4}
            ListFooterComponent={ListFooter}
            refreshControl={
              <RefreshControl
                refreshing={query.isRefetching && !query.isFetchingNextPage}
                onRefresh={() => query.refetch()}
                tintColor={COLORS.primary}
                colors={[COLORS.primary]}
              />
            }
          />
        )}

        {/* FAB — Create dispatch (Admin / Supervisor / Dispatch Operator only) */}
        <RoleGate allow={['Admin', 'Supervisor', 'Dispatch Operator']}>
          <TouchableOpacity
            style={styles.fab}
            onPress={() => router.push('/dispatch/create' as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={28} color="#FFFFFF" />
          </TouchableOpacity>
        </RoleGate>
      </View>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // Search
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    margin: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 42,
    fontSize: 14,
    color: COLORS.text,
  },

  // Date range
  dateRangeWrapper: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  dateInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  dateInputGroup: {
    flex: 1,
  },
  dateLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 3,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dateInput: {
    height: 36,
    fontSize: 13,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    backgroundColor: COLORS.background,
  },
  dateSeparator: {
    width: 12,
  },

  // Chips
  chipsScroll: {
    flexGrow: 0,
  },
  chipsContent: {
    paddingBottom: 4,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.surface,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  chipClear: {
    borderColor: COLORS.error,
  },
  chipClearText: {
    color: COLORS.error,
  },
  chipExport: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.primary + '10',
  },
  chipExportText: {
    color: COLORS.primary,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
  },
  chipTextActive: {
    color: COLORS.surface,
  },

  // Return-status filter
  returnFilterScroll: {
    flexGrow: 0,
    marginHorizontal: 12,
    marginBottom: 8,
  },

  // Return-status pill (row card)
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
  returnProgressLine: {
    fontSize: 12,
    color: COLORS.warning,
    fontWeight: '600',
    marginBottom: 3,
  },

  // List
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 88, // clear the FAB
    paddingTop: 4,
  },
  rowTouchable: {
    marginBottom: 8,
  },
  itemCard: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },

  // Card rows
  row1: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  barcode: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  dateText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    flexShrink: 0,
  },

  // Source type chip
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
  sourceChipCarton: {
    backgroundColor: '#EEF0FF',
  },
  sourceChipTextCarton: {
    color: COLORS.primary,
  },
  sourceChipSample: {
    backgroundColor: '#FEE2E2',
  },
  sourceChipTextSample: {
    color: COLORS.error,
  },
  sourceChipEcommerce: {
    backgroundColor: '#F3E8FF',
  },
  sourceChipTextEcommerce: {
    color: CHILD_BOX_STATUS_COLORS.ECOMMERCE,
  },
  customerLine: {
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 3,
  },
  mutedText: {
    color: COLORS.textSecondary,
  },
  secondaryLine: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 3,
  },
  metaLine: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 3,
  },
  destinationLine: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 1,
  },

  // Misc
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    color: COLORS.textLight,
  },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
});

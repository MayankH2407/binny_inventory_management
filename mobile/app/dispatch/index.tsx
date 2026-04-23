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
  Alert,
  Platform,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { COLORS } from '../../constants';
import { dispatchService } from '../../services/dispatch.service';
import type { DispatchRecord } from '../../types';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Spinner from '../../components/ui/Spinner';
import RoleGate from '../../components/RoleGate';
import { formatDate } from '../../utils';

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
    queryKey: ['dispatches', { search, startDate, endDate }],
    queryFn: ({ pageParam }) =>
      dispatchService.getAll({
        page: pageParam,
        limit: PAGE_SIZE,
        search: search || undefined,
        start_date: startDate,
        end_date: endDate,
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

  // ─── Row renderer ──────────────────────────────────────────────────────────

  const renderItem = useCallback(({ item: dispatch }: { item: DispatchRecord }) => {
    // Meta line: "12 boxes · ₹1,450.00 · LR 12345"
    const metaParts: string[] = [];
    metaParts.push(`${dispatch.child_count ?? '?'} boxes`);
    if (dispatch.mrp_summary != null) {
      metaParts.push(`₹${Number(dispatch.mrp_summary).toFixed(2)}`);
    }
    if (dispatch.lr_number) {
      metaParts.push(`LR ${dispatch.lr_number}`);
    }
    const metaLine = metaParts.join(' · ');

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => {
          // TODO: route to /dispatch/[id] once detail screen is built
          Alert.alert('Dispatch detail', 'Detail view coming soon.');
        }}
        style={styles.rowTouchable}
      >
        <Card style={styles.itemCard}>
          {/* Row 1: Barcode + dispatch date */}
          <View style={styles.row1}>
            <Text style={styles.barcode} numberOfLines={1}>
              {dispatch.carton_barcode ?? '—'}
            </Text>
            <Text style={styles.dateText}>
              {formatDate(dispatch.dispatch_date)}
            </Text>
          </View>

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
          </ScrollView>
        </View>

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
  },
  barcode: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginRight: 8,
  },
  dateText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    flexShrink: 0,
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

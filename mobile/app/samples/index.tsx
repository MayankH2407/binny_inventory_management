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
} from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery } from '@tanstack/react-query';
import { COLORS } from '../../constants';
import { samplesService } from '../../services/samples.service';
import type { SampleRecord, SampleState } from '../../types';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import Spinner from '../../components/ui/Spinner';
import RoleGate from '../../components/RoleGate';
import BarcodeScanner from '../../components/BarcodeScanner';
import { formatDate, parseQRCode } from '../../utils';

// ─── Types ────────────────────────────────────────────────────────────────────

// Sample status is DERIVED server-side from live mapping rows: EMPTY (nothing in
// it), OPEN (items waiting to be dispatched) or DISPATCHED (everything shipped).
type StateFilter = 'ALL' | SampleState;
const STATE_OPTIONS: { value: StateFilter; label: string }[] = [
  { value: 'OPEN', label: 'Open' },
  { value: 'EMPTY', label: 'Empty' },
  { value: 'DISPATCHED', label: 'Dispatched' },
  { value: 'ALL', label: 'All' },
];

const STATE_COLORS: Record<SampleState, string> = {
  EMPTY: COLORS.textSecondary,
  OPEN: COLORS.statusActive,
  DISPATCHED: COLORS.statusDispatched,
};

const PAGE_SIZE = 20;

// ─── Main component ───────────────────────────────────────────────────────────

export default function SamplesScreen() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('OPEN');
  const [scannerOpen, setScannerOpen] = useState(false);

  // 300 ms debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const summaryQ = useApiQuery(['samples-summary'], () => samplesService.getSummary());

  const query = useInfiniteQuery({
    queryKey: ['samples', { state: stateFilter, search }],
    queryFn: ({ pageParam }) =>
      samplesService.getAll({
        page: pageParam,
        limit: PAGE_SIZE,
        state: stateFilter === 'ALL' ? undefined : stateFilter,
        search: search || undefined,
      }),
    getNextPageParam: (last) =>
      last.page < last.totalPages ? last.page + 1 : undefined,
    initialPageParam: 1,
  });

  const items: SampleRecord[] =
    query.data?.pages.flatMap((p) => p.data) ?? [];

  const handleLoadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      query.fetchNextPage();
    }
  }, [query]);

  // One-click "New Sample" — mints an empty record and opens it, ready to scan into.
  const createMutation = useApiMutation<SampleRecord, void>(
    () => samplesService.create(),
    {
      invalidateKeys: [['samples'], ['samples-summary']],
      onSuccess: (sample) => router.push(`/samples/${sample.id}`),
    },
  );

  // Scan a sample's own sticker to jump straight to it.
  const findMutation = useApiMutation<SampleRecord, string>(
    (barcode) => samplesService.getByBarcode(barcode),
    {
      onSuccess: (sample) => router.push(`/samples/${sample.id}`),
      errorMessage: 'No sample found with that barcode',
    },
  );

  const handleScan = (raw: string) => {
    setScannerOpen(false);
    const parsed = parseQRCode(raw);
    findMutation.mutate(parsed.type === 'sample' ? parsed.id : raw.trim().toUpperCase());
  };

  // ─── Row renderer ──────────────────────────────────────────────────────────

  const renderItem = useCallback(({ item: sample }: { item: SampleRecord }) => {
    const state: SampleState = sample.state ?? 'EMPTY';

    const stockLine =
      state === 'EMPTY'
        ? 'Nothing in this sample yet'
        : `${sample.open_box_count ?? 0} box${(sample.open_box_count ?? 0) === 1 ? '' : 'es'}` +
          ` · ${sample.open_pairs ?? 0} pairs` +
          (sample.mrp_summary != null ? ` · ₹${Number(sample.mrp_summary).toFixed(2)}` : '');

    let datesLine = `Created ${formatDate(sample.created_at)}`;
    if (sample.shipped_box_count) {
      datesLine += ` · ${sample.shipped_box_count} shipped`;
    }
    if (sample.last_dispatch_date) {
      datesLine += ` · Last dispatch ${formatDate(sample.last_dispatch_date)}`;
    }

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => router.push(`/samples/${sample.id}`)}
        style={styles.rowTouchable}
      >
        <Card style={styles.itemCard}>
          <View style={styles.row1}>
            <Text style={styles.barcode} numberOfLines={1}>
              {sample.sample_barcode}
            </Text>
            <Badge label={state} color={STATE_COLORS[state]} />
          </View>

          {!!sample.name && (
            <Text style={styles.nameLine} numberOfLines={1}>
              {sample.name}
            </Text>
          )}

          <Text style={styles.secondaryLine}>{stockLine}</Text>

          {!!sample.article_summary && state !== 'EMPTY' && (
            <Text style={styles.secondaryLine} numberOfLines={1}>
              {sample.article_summary}
            </Text>
          )}

          <Text style={styles.datesLine} numberOfLines={1}>
            {datesLine}
          </Text>
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

  const summary = summaryQ.data;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <Stack.Screen options={{ title: 'Samples' }} />

      <View style={styles.container}>
        {/* Summary strip */}
        {summary && (
          <View style={styles.summaryRow}>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryValue}>{summary.open_records}</Text>
              <Text style={styles.summaryLabel}>Open samples</Text>
            </View>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryValue}>{summary.open_boxes}</Text>
              <Text style={styles.summaryLabel}>Boxes waiting</Text>
            </View>
            <View style={styles.summaryCell}>
              <Text style={styles.summaryValue}>{summary.dispatched_records}</Text>
              <Text style={styles.summaryLabel}>Dispatched</Text>
            </View>
          </View>
        )}

        {/* Search bar + scan-to-find */}
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
            placeholder="Search by sample name or barcode..."
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
          <TouchableOpacity
            onPress={() => setScannerOpen(true)}
            style={styles.scanBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="scan-outline" size={22} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {/* State filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
          contentContainerStyle={styles.chipsContent}
        >
          {STATE_OPTIONS.map((o) => {
            const active = stateFilter === o.value;
            return (
              <TouchableOpacity
                key={o.value}
                onPress={() => setStateFilter(o.value)}
                style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.chipText,
                    active ? styles.chipTextActive : styles.chipTextInactive,
                  ]}
                >
                  {o.label}
                </Text>
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
            icon="flask-outline"
            title="No samples"
            message={
              stateFilter === 'OPEN'
                ? 'No samples in progress. Tap + to start a new one.'
                : 'No samples match this filter.'
            }
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
                onRefresh={() => {
                  query.refetch();
                  summaryQ.refetch();
                }}
                tintColor={COLORS.primary}
                colors={[COLORS.primary]}
              />
            }
          />
        )}

        {/* FAB — one-click New Sample (Admin / Supervisor only) */}
        <RoleGate allow={['Admin', 'Supervisor']}>
          <TouchableOpacity
            style={[styles.fab, createMutation.isPending && styles.fabDisabled]}
            onPress={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            activeOpacity={0.85}
          >
            {createMutation.isPending ? (
              <Spinner size="small" />
            ) : (
              <Ionicons name="add" size={28} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </RoleGate>
      </View>

      <BarcodeScanner
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
        title="Scan Sample"
        expectedType="sample"
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

  // Summary
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 12,
    marginTop: 12,
  },
  summaryCell: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 8,
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  summaryLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 1,
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
  scanBtn: {
    marginLeft: 10,
  },

  // Chips
  chipsScroll: {
    flexGrow: 0,
  },
  chipsContent: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
  },
  chipInactive: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: COLORS.surface,
  },
  chipTextInactive: {
    color: COLORS.textSecondary,
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
  nameLine: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 3,
  },
  secondaryLine: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 3,
  },
  datesLine: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
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
  fabDisabled: {
    opacity: 0.7,
  },
});

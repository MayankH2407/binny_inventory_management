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
import { COLORS, SAMPLE_STATUS_COLORS } from '../../constants';
import { samplesService } from '../../services/samples.service';
import type { SampleRecord, SampleStatus } from '../../types';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import Spinner from '../../components/ui/Spinner';
import RoleGate from '../../components/RoleGate';
import { formatDate } from '../../utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusFilter = 'ALL' | SampleStatus;
const STATUS_OPTIONS: StatusFilter[] = ['ALL', 'CREATED', 'ACTIVE', 'CLOSED', 'DISPATCHED'];
const PAGE_SIZE = 20;

// ─── Main component ───────────────────────────────────────────────────────────

export default function SamplesScreen() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  // 300 ms debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const query = useInfiniteQuery({
    queryKey: ['samples', { status: statusFilter, search }],
    queryFn: ({ pageParam }) =>
      samplesService.getAll({
        page: pageParam,
        limit: PAGE_SIZE,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
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

  // ─── Row renderer ──────────────────────────────────────────────────────────

  const renderItem = useCallback(({ item: sample }: { item: SampleRecord }) => {
    // Recipient line — customer firm name takes priority
    const recipientLine =
      sample.customer_firm_name
        ? `To: ${sample.customer_firm_name}`
        : sample.recipient_name
        ? `To: ${sample.recipient_name}`
        : null;

    // Box count + MRP
    const boxMrpLine =
      `${sample.child_count} boxes` +
      (sample.mrp_summary != null
        ? ` · ₹${Number(sample.mrp_summary).toFixed(2)}`
        : '');

    // Dates line
    let datesLine = `Created ${formatDate(sample.created_at)}`;
    if (sample.closed_at) {
      datesLine += ` · Closed ${formatDate(sample.closed_at)}`;
    }
    if (sample.dispatched_at) {
      datesLine += ` · Dispatched ${formatDate(sample.dispatched_at)}`;
    }

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => router.push(`/samples/${sample.id}`)}
        style={styles.rowTouchable}
      >
        <Card style={styles.itemCard}>
          {/* Row 1: Barcode + Status badge */}
          <View style={styles.row1}>
            <Text style={styles.barcode} numberOfLines={1}>
              {sample.sample_barcode}
            </Text>
            <Badge
              label={sample.status}
              color={SAMPLE_STATUS_COLORS[sample.status]}
            />
          </View>

          {/* Row 2: Sample name */}
          <Text style={styles.nameLine} numberOfLines={1}>
            {sample.name}
          </Text>

          {/* Row 3: Recipient / customer (optional) */}
          {!!recipientLine && (
            <Text style={styles.secondaryLine} numberOfLines={1}>
              {recipientLine}
            </Text>
          )}

          {/* Row 4: Box count + MRP */}
          <Text style={styles.secondaryLine}>{boxMrpLine}</Text>

          {/* Row 5: Dates */}
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

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <Stack.Screen options={{ title: 'Samples' }} />

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
        </View>

        {/* Status filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
          contentContainerStyle={styles.chipsContent}
        >
          {STATUS_OPTIONS.map((s) => {
            const active = statusFilter === s;
            return (
              <TouchableOpacity
                key={s}
                onPress={() => setStatusFilter(s)}
                style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.chipText,
                    active ? styles.chipTextActive : styles.chipTextInactive,
                  ]}
                >
                  {s}
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
            message="Samples will appear once created."
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

        {/* FAB — Create sample (Admin / Supervisor only) */}
        <RoleGate allow={['Admin', 'Supervisor']}>
          <TouchableOpacity
            style={styles.fab}
            onPress={() => router.push('/samples/create')}
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
});

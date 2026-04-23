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
import { childBoxService } from '../../services/childBox.service';
import type { ChildBoxWithProduct } from '../../types';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import Spinner from '../../components/ui/Spinner';

// ─── Aging helpers (ported from web) ─────────────────────────────────────────

type AgingState = 'red' | 'yellow' | 'none';

function getAgeDays(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
}

function getAgingState(status: string, createdAt: string): AgingState {
  if (status !== 'FREE') return 'none';
  const d = getAgeDays(createdAt);
  if (d >= 180) return 'red';
  if (d >= 90) return 'yellow';
  return 'none';
}

function getCardBgColor(status: string, createdAt: string): string | undefined {
  if (status !== 'FREE') return undefined;
  const d = getAgeDays(createdAt);
  if (d >= 180) return 'rgba(254, 226, 226, 0.6)';
  if (d >= 90) return 'rgba(254, 243, 199, 0.6)';
  return undefined;
}

// ─── Status filter chips ──────────────────────────────────────────────────────

type StatusFilter = 'ALL' | 'FREE' | 'PACKED' | 'DISPATCHED';
const STATUS_OPTIONS: StatusFilter[] = ['ALL', 'FREE', 'PACKED', 'DISPATCHED'];
const PAGE_SIZE = 20;

// ─── Main component ───────────────────────────────────────────────────────────

export default function ChildBoxesScreen() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  // Debounce search input 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const query = useInfiniteQuery({
    queryKey: ['childBoxes', { status: statusFilter, search }],
    queryFn: ({ pageParam }) =>
      childBoxService.getAll({
        page: pageParam,
        limit: PAGE_SIZE,
        status: statusFilter === 'ALL' ? undefined : statusFilter,
        search: search || undefined,
      }),
    getNextPageParam: (last) =>
      last.page < last.totalPages ? last.page + 1 : undefined,
    initialPageParam: 1,
  });

  const items: ChildBoxWithProduct[] =
    query.data?.pages.flatMap((p) => p.data) ?? [];

  const handleLoadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      query.fetchNextPage();
    }
  }, [query]);

  // ─── Row renderer ───────────────────────────────────────────────────────────

  const renderItem = useCallback(
    ({ item: box }: { item: ChildBoxWithProduct }) => {
      const aging = getAgingState(box.status, box.created_at);
      const ageDays = aging !== 'none' ? getAgeDays(box.created_at) : null;
      const cardBg = getCardBgColor(box.status, box.created_at);
      const cardStyle = cardBg
        ? { ...styles.itemCard, backgroundColor: cardBg }
        : styles.itemCard;

      return (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.push(`/child-boxes/${box.id}`)}
          style={styles.rowTouchable}
        >
          <Card style={cardStyle}>
            {/* Row 1: Barcode + Status */}
            <View style={styles.row1}>
              <Text style={styles.barcode} numberOfLines={1}>
                {box.barcode}
              </Text>
              <Badge label={box.status} type="childBox" />
            </View>

            {/* Row 2: Article · Colour · Size */}
            <Text style={styles.articleLine} numberOfLines={1}>
              {box.article_name} · {box.colour} · {box.size}
            </Text>

            {/* Row 3: SKU · MRP (left)  +  Age pill (right) */}
            <View style={styles.row3}>
              <Text style={styles.skuLine}>
                {box.sku} · ₹{Number(box.mrp).toFixed(2)}
              </Text>
              {aging !== 'none' && ageDays !== null && (
                <View
                  style={[
                    styles.agePill,
                    aging === 'red' ? styles.agePillRed : styles.agePillYellow,
                  ]}
                >
                  <Text
                    style={[
                      styles.agePillText,
                      aging === 'red'
                        ? styles.agePillTextRed
                        : styles.agePillTextYellow,
                    ]}
                  >
                    {ageDays}d
                  </Text>
                </View>
              )}
            </View>
          </Card>
        </TouchableOpacity>
      );
    },
    [],
  );

  // ─── Footer ─────────────────────────────────────────────────────────────────

  const ListFooter = () => {
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
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  const showAgingLegend =
    statusFilter === 'ALL' || statusFilter === 'FREE';

  return (
    <>
      <Stack.Screen options={{ title: 'Child Boxes' }} />

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
            placeholder="Search by barcode, SKU, article..."
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
              <Ionicons
                name="close-circle"
                size={18}
                color={COLORS.textSecondary}
              />
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

        {/* Aging legend */}
        {showAgingLegend && (
          <View style={styles.agingLegend}>
            <Text style={styles.agingLegendLabel}>FREE box aging:</Text>
            <View style={styles.agingLegendItem}>
              <View style={[styles.agingSwatch, styles.agingSwatchYellow]} />
              <Text style={styles.agingLegendText}>90–179 days</Text>
            </View>
            <View style={styles.agingLegendItem}>
              <View style={[styles.agingSwatch, styles.agingSwatchRed]} />
              <Text style={styles.agingLegendText}>180+ days</Text>
            </View>
          </View>
        )}

        {/* List */}
        {query.isLoading && items.length === 0 ? (
          <View style={styles.centered}>
            <Spinner />
          </View>
        ) : !query.isLoading && items.length === 0 ? (
          <EmptyState
            icon="cube-outline"
            title="No child boxes"
            message="Try adjusting your filters."
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
                refreshing={
                  query.isRefetching && !query.isFetchingNextPage
                }
                onRefresh={() => query.refetch()}
                tintColor={COLORS.primary}
                colors={[COLORS.primary]}
              />
            }
          />
        )}
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

  // Aging legend
  agingLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 2,
  },
  agingLegendLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  agingLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  agingSwatch: {
    width: 10,
    height: 10,
    borderRadius: 4,
  },
  agingSwatchYellow: {
    backgroundColor: '#FEF08A',
    borderWidth: 1,
    borderColor: '#CA8A04',
  },
  agingSwatchRed: {
    backgroundColor: '#FECACA',
    borderWidth: 1,
    borderColor: '#DC2626',
  },
  agingLegendText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },

  // List
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 24,
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
    marginBottom: 6,
  },
  barcode: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginRight: 8,
  },
  articleLine: {
    fontSize: 13,
    color: COLORS.text,
    marginBottom: 4,
  },
  row3: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skuLine: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },

  // Age pill
  agePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  agePillYellow: {
    backgroundColor: '#FEF9C3',
  },
  agePillRed: {
    backgroundColor: '#FEE2E2',
  },
  agePillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  agePillTextYellow: {
    color: '#92400E',
  },
  agePillTextRed: {
    color: '#991B1B',
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
});

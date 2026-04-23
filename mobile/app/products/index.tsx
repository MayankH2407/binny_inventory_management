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
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { COLORS } from '../../constants';
import { productService } from '../../services/product.service';
import type { Product, ProductSection } from '../../types';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import Spinner from '../../components/ui/Spinner';
import RoleGate from '../../components/RoleGate';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

// ─── Sub-components ───────────────────────────────────────────────────────────

function DeniedView() {
  return (
    <EmptyState
      icon="lock-closed-outline"
      title="Not authorized"
      message="You do not have permission to view products."
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProductsScreen() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState<string | undefined>(undefined);
  const [activeOnly, setActiveOnly] = useState(false);

  // 300 ms debounce on search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Fetch sections once on mount for filter chips
  const sectionsQuery = useQuery<ProductSection[]>({
    queryKey: ['productSections'],
    queryFn: () => productService.getSections(),
    staleTime: 5 * 60 * 1000, // 5 min — sections are static-ish
  });
  const sections: ProductSection[] = sectionsQuery.data ?? [];

  // Infinite products query
  const query = useInfiniteQuery({
    queryKey: ['products', { search, section: sectionFilter, is_active: activeOnly }],
    queryFn: ({ pageParam }) =>
      productService.getAll({
        page: pageParam,
        limit: PAGE_SIZE,
        search: search || undefined,
        section: sectionFilter,
        is_active: activeOnly ? true : undefined,
      }),
    getNextPageParam: (last) =>
      last.page < last.totalPages ? last.page + 1 : undefined,
    initialPageParam: 1,
  });

  const items: Product[] = query.data?.pages.flatMap((p) => p.data) ?? [];

  const handleLoadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      query.fetchNextPage();
    }
  }, [query]);

  // ─── Row renderer ──────────────────────────────────────────────────────────

  const renderItem = useCallback(({ item: product }: { item: Product }) => {
    const mrpDisplay = `₹${Number(product.mrp).toFixed(2)}`;
    const skuLine = [product.sku, product.article_code].filter(Boolean).join(' · ');
    const colourSizeLine = [
      product.colour ? `Colour: ${product.colour}` : null,
      product.size ? `Size: ${product.size}` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    const sectionCatLine = [
      product.section ?? '—',
      product.category ?? '—',
    ].join(' · ');

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => router.push(`/products/${product.id}` as any)}
        style={styles.rowTouchable}
      >
        <Card style={styles.itemCard}>
          {/* Row 1: article_name + MRP */}
          <View style={styles.row1}>
            <Text style={styles.articleName} numberOfLines={2} ellipsizeMode="tail">
              {product.article_name}
            </Text>
            <Text style={styles.mrp}>{mrpDisplay}</Text>
          </View>

          {/* Row 2: SKU · article_code */}
          {!!skuLine && (
            <Text style={styles.skuLine} numberOfLines={1}>
              {product.sku ? (
                <Text style={styles.skuMono}>{product.sku}</Text>
              ) : null}
              {product.sku && product.article_code ? ' · ' : ''}
              {product.article_code ?? ''}
            </Text>
          )}

          {/* Row 3: Colour · Size */}
          {!!colourSizeLine && (
            <Text style={styles.secondaryLine} numberOfLines={1}>
              {colourSizeLine}
            </Text>
          )}

          {/* Row 4: Section · Category + Inactive badge */}
          <View style={styles.row4}>
            <Text style={styles.mutedLine} numberOfLines={1}>
              {sectionCatLine}
            </Text>
            {!product.is_active && (
              <Badge label="Inactive" color={COLORS.textSecondary} />
            )}
          </View>
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
    <RoleGate allow={['Admin', 'Supervisor']} fallback={<DeniedView />}>
      <>
        <Stack.Screen options={{ title: 'Products' }} />

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
              placeholder="Search by article, SKU, colour..."
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

          {/* Filter chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipsScroll}
            contentContainerStyle={styles.chipsContent}
          >
            {/* Section filter chips */}
            <TouchableOpacity
              onPress={() => setSectionFilter(undefined)}
              style={[
                styles.chip,
                sectionFilter === undefined ? styles.chipActive : styles.chipInactive,
              ]}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.chipText,
                  sectionFilter === undefined ? styles.chipTextActive : styles.chipTextInactive,
                ]}
              >
                All sections
              </Text>
            </TouchableOpacity>
            {sections.map((sec) => {
              const active = sectionFilter === sec.name;
              return (
                <TouchableOpacity
                  key={sec.id}
                  onPress={() => setSectionFilter(active ? undefined : sec.name)}
                  style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.chipText,
                      active ? styles.chipTextActive : styles.chipTextInactive,
                    ]}
                  >
                    {sec.name}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {/* Active-only toggle chip */}
            <TouchableOpacity
              onPress={() => setActiveOnly((v) => !v)}
              style={[
                styles.chip,
                activeOnly ? styles.chipActive : styles.chipInactive,
              ]}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.chipText,
                  activeOnly ? styles.chipTextActive : styles.chipTextInactive,
                ]}
              >
                Active only
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* List / loading / empty */}
          {query.isLoading && items.length === 0 ? (
            <View style={styles.centered}>
              <Spinner />
            </View>
          ) : !query.isLoading && items.length === 0 ? (
            <EmptyState
              icon="pricetag-outline"
              title="No products"
              message="Try adjusting filters."
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
        </View>
      </>
    </RoleGate>
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
    alignItems: 'flex-start',
    marginBottom: 5,
    gap: 8,
  },
  articleName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  mrp: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  skuLine: {
    fontSize: 13,
    color: COLORS.text,
    marginBottom: 3,
  },
  skuMono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  secondaryLine: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 3,
  },
  row4: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  mutedLine: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textSecondary,
    marginRight: 8,
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

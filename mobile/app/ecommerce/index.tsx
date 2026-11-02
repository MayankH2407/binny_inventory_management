import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Keyboard,
} from 'react-native';
import { Stack, router } from '../../navigation/router';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { COLORS } from '../../constants';
import { ecommerceService, type EcommerceStockRow } from '../../services/ecommerce.service';
import type { EcommercePoolItem } from '../../types';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import Spinner from '../../components/ui/Spinner';
import BarcodeScanner from '../../components/BarcodeScanner';
import RoleGate from '../../components/RoleGate';
import { formatDate, parseQRCode } from '../../utils';

// E-commerce Area — a single unordered pool of loose boxes / whole cartons.
// Mirrors the web "E-commerce Area" page. Items are SHIPPED from the Dispatch
// screen (source = E-commerce); there is no per-record create/close/dispatch here.

type Tab = 'POOL' | 'STOCK';
type TypeFilter = 'ALL' | 'BOX' | 'CARTON';
const TYPE_OPTIONS: TypeFilter[] = ['ALL', 'BOX', 'CARTON'];
const PAGE_SIZE = 25;

function apiError(err: any, fallback: string): string {
  return err?.response?.data?.message ?? err?.message ?? fallback;
}

export default function EcommerceScreen() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('POOL');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [scanInput, setScanInput] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const summaryQuery = useQuery({
    queryKey: ['ecommerce-pool-summary'],
    queryFn: () => ecommerceService.getPoolSummary(),
  });

  const poolQuery = useInfiniteQuery({
    queryKey: ['ecommerce-pool', { type: typeFilter, search }],
    queryFn: ({ pageParam }) =>
      ecommerceService.getPool({
        page: pageParam,
        limit: PAGE_SIZE,
        search: search || undefined,
        item_type: typeFilter === 'ALL' ? undefined : typeFilter,
      }),
    getNextPageParam: (last) => (last.page < last.totalPages ? last.page + 1 : undefined),
    initialPageParam: 1,
    enabled: tab === 'POOL',
  });

  const stockQuery = useQuery({
    queryKey: ['ecommerce-stock-summary'],
    queryFn: () => ecommerceService.getStockSummary(),
    enabled: tab === 'STOCK',
  });

  const items: EcommercePoolItem[] = poolQuery.data?.pages.flatMap((p) => p.data) ?? [];

  const refreshAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['ecommerce-pool'] });
    queryClient.invalidateQueries({ queryKey: ['ecommerce-pool-summary'] });
    queryClient.invalidateQueries({ queryKey: ['ecommerce-stock-summary'] });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
  }, [queryClient]);

  // ── Scan to add ────────────────────────────────────────────────────────────
  const addCode = useCallback(
    async (raw: string) => {
      const code = parseQRCode(raw).id.trim().toUpperCase();
      if (!code || adding) return;
      setAdding(true);
      try {
        const res = await ecommerceService.addToPool(code);
        setLastAdded(
          `${res.item_type === 'CARTON' ? 'Carton' : 'Box'} ${res.barcode} added` +
            (res.item_type === 'CARTON' ? ` (${res.boxes_added} boxes)` : '')
        );
        setScanInput('');
        refreshAll();
      } catch (err: any) {
        setLastAdded(null);
        Alert.alert('Cannot add', apiError(err, 'Could not add that item to the E-commerce Area.'));
      } finally {
        setAdding(false);
      }
    },
    [adding, refreshAll]
  );

  const handleScan = useCallback(
    (data: string) => {
      setScannerOpen(false);
      addCode(data);
    },
    [addCode]
  );

  // ── Per-item actions ───────────────────────────────────────────────────────
  const confirmRemove = (item: EcommercePoolItem) => {
    Alert.alert(
      'Remove from E-commerce Area',
      `${item.barcode} will go back to available warehouse stock.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusyId(item.mapping_id);
            try {
              await ecommerceService.removeFromPool({ item_type: item.item_type, mapping_id: item.mapping_id });
              refreshAll();
            } catch (err: any) {
              Alert.alert('Could not remove', apiError(err, 'Remove failed.'));
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  const confirmUnpack = (item: EcommercePoolItem) => {
    Alert.alert(
      'Unpack carton',
      `All ${item.box_count} boxes in ${item.barcode} will come out as loose boxes in the E-commerce Area. The carton is emptied. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unpack',
          style: 'destructive',
          onPress: async () => {
            setBusyId(item.mapping_id);
            try {
              const res = await ecommerceService.unpackPoolCarton(item.mapping_id);
              Alert.alert('Unpacked', `${res.boxes_unpacked} boxes are now loose in the E-commerce Area.`);
              refreshAll();
            } catch (err: any) {
              Alert.alert('Could not unpack', apiError(err, 'Unpack failed.'));
            } finally {
              setBusyId(null);
            }
          },
        },
      ]
    );
  };

  // ── Renderers ──────────────────────────────────────────────────────────────
  const renderPoolItem = useCallback(
    ({ item }: { item: EcommercePoolItem }) => {
      const isCarton = item.item_type === 'CARTON';
      const detail = [item.article_summary, item.colour_summary, item.size_summary].filter(Boolean).join(' · ');
      const busy = busyId === item.mapping_id;
      return (
        <Card style={styles.itemCard}>
          <View style={styles.row1}>
            <Text style={styles.barcode} numberOfLines={1}>{item.barcode}</Text>
            <Badge label={isCarton ? 'CARTON' : 'BOX'} color={isCarton ? COLORS.primaryLight : COLORS.textSecondary} />
          </View>
          {!!detail && <Text style={styles.nameLine} numberOfLines={2}>{detail}</Text>}
          <Text style={styles.secondaryLine}>
            {item.box_count} {item.box_count === 1 ? 'box' : 'boxes'}
            {item.mrp != null ? ` · ₹${Number(item.mrp).toFixed(2)}` : ''}
          </Text>
          {!!item.source_carton_barcode && (
            <Text style={styles.secondaryLine}>From carton {item.source_carton_barcode}</Text>
          )}
          {!!item.legacy_record_barcode && (
            <Text style={styles.secondaryLine}>Legacy record {item.legacy_record_barcode}</Text>
          )}
          <Text style={styles.datesLine}>
            Added {formatDate(item.added_at)}{item.added_by_name ? ` by ${item.added_by_name}` : ''}
          </Text>
          <RoleGate allow={['Admin', 'Supervisor']}>
            <View style={styles.actions}>
              {isCarton && (
                <TouchableOpacity style={styles.actionBtn} disabled={busy} onPress={() => confirmUnpack(item)}>
                  <Ionicons name="albums-outline" size={16} color={COLORS.primary} />
                  <Text style={styles.actionText}>Unpack</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.actionBtn} disabled={busy} onPress={() => confirmRemove(item)}>
                <Ionicons name="trash-outline" size={16} color={COLORS.error} />
                <Text style={[styles.actionText, { color: COLORS.error }]}>{busy ? 'Working…' : 'Remove'}</Text>
              </TouchableOpacity>
            </View>
          </RoleGate>
        </Card>
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busyId]
  );

  const renderStockRow = useCallback(({ item }: { item: EcommerceStockRow }) => (
    <Card style={styles.itemCard}>
      <Text style={styles.nameLine} numberOfLines={1}>{item.article_name}</Text>
      <Text style={styles.secondaryLine}>{item.colour} · Size {item.size} · ₹{Number(item.mrp).toFixed(2)}</Text>
      <View style={styles.stockRow}>
        <View style={styles.stockCell}>
          <Text style={styles.stockNum}>{item.allocated_pairs}</Text>
          <Text style={styles.stockLabel}>In E-com Area (prs)</Text>
        </View>
        <View style={styles.stockCell}>
          <Text style={styles.stockNum}>{item.available_pairs}</Text>
          <Text style={styles.stockLabel}>Available (prs)</Text>
        </View>
      </View>
    </Card>
  ), []);

  const summary = summaryQuery.data;

  return (
    <>
      <Stack.Screen options={{ title: 'E-commerce Area' }} />
      <View style={styles.container}>
        {/* Summary */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryNum}>{summary?.total_boxes ?? '–'}</Text>
            <Text style={styles.summaryLabel}>Boxes</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryNum}>{summary?.total_pairs ?? '–'}</Text>
            <Text style={styles.summaryLabel}>Pairs</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryNum}>{summary?.carton_items ?? '–'}</Text>
            <Text style={styles.summaryLabel}>Cartons</Text>
          </View>
          <View style={styles.summaryCell}>
            <Text style={styles.summaryNum}>{summary?.box_items ?? '–'}</Text>
            <Text style={styles.summaryLabel}>Loose</Text>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          {(['POOL', 'STOCK'] as Tab[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[styles.tab, tab === t && styles.tabActive]}
              onPress={() => setTab(t)}
              activeOpacity={0.7}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
                {t === 'POOL' ? 'Area contents' : 'Stock by product'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'POOL' ? (
          <>
            {/* Scan / enter a barcode to add */}
            <RoleGate allow={['Admin', 'Supervisor', 'Warehouse Operator']}>
              <View style={styles.scanBox}>
                <View style={styles.scanRow}>
                  <TextInput
                    style={styles.scanInput}
                    value={scanInput}
                    onChangeText={setScanInput}
                    placeholder="Scan or enter box / carton barcode to add"
                    placeholderTextColor={COLORS.textLight}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={() => { Keyboard.dismiss(); addCode(scanInput); }}
                  />
                  <TouchableOpacity style={styles.iconBtn} onPress={() => setScannerOpen(true)} disabled={adding}>
                    <Ionicons name="scan-outline" size={22} color="#FFFFFF" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.iconBtn, (!scanInput.trim() || adding) && styles.iconBtnDisabled]}
                    onPress={() => { Keyboard.dismiss(); addCode(scanInput); }}
                    disabled={!scanInput.trim() || adding}
                  >
                    <Ionicons name="add" size={24} color="#FFFFFF" />
                  </TouchableOpacity>
                </View>
                {!!lastAdded && <Text style={styles.addedText}>{lastAdded}</Text>}
              </View>
            </RoleGate>

            {/* Search */}
            <View style={styles.searchWrapper}>
              <Ionicons name="search-outline" size={18} color={COLORS.textSecondary} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                value={searchInput}
                onChangeText={setSearchInput}
                placeholder="Search barcode or article..."
                placeholderTextColor={COLORS.textLight}
                returnKeyType="search"
                autoCorrect={false}
                autoCapitalize="none"
              />
              {searchInput.length > 0 && (
                <TouchableOpacity onPress={() => setSearchInput('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close-circle" size={18} color={COLORS.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.chipsContent}>
              {TYPE_OPTIONS.map((t) => {
                const active = typeFilter === t;
                return (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setTypeFilter(t)}
                    style={[styles.chip, active ? styles.chipActive : styles.chipInactive]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextInactive]}>{t}</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity style={styles.historyLink} onPress={() => router.push('/dispatch/create' as any)}>
                <Ionicons name="send-outline" size={14} color={COLORS.primary} />
                <Text style={styles.historyLinkText}>Dispatch</Text>
              </TouchableOpacity>
            </View>

            {poolQuery.isLoading && items.length === 0 ? (
              <View style={styles.centered}><Spinner /></View>
            ) : items.length === 0 ? (
              <EmptyState
                icon="cart-outline"
                title="E-commerce Area is empty"
                message="Scan boxes or cartons above to move them into the E-commerce Area."
              />
            ) : (
              <FlatList
                data={items}
                keyExtractor={(i) => `${i.item_type}-${i.mapping_id}`}
                renderItem={renderPoolItem}
                contentContainerStyle={styles.listContent}
                onEndReached={() => { if (poolQuery.hasNextPage && !poolQuery.isFetchingNextPage) poolQuery.fetchNextPage(); }}
                onEndReachedThreshold={0.4}
                ListFooterComponent={poolQuery.isFetchingNextPage ? <View style={styles.footer}><Spinner size="small" /></View> : null}
                refreshControl={
                  <RefreshControl
                    refreshing={poolQuery.isRefetching && !poolQuery.isFetchingNextPage}
                    onRefresh={() => { poolQuery.refetch(); summaryQuery.refetch(); }}
                    tintColor={COLORS.primary}
                    colors={[COLORS.primary]}
                  />
                }
              />
            )}
          </>
        ) : stockQuery.isLoading ? (
          <View style={styles.centered}><Spinner /></View>
        ) : (stockQuery.data ?? []).length === 0 ? (
          <EmptyState icon="cube-outline" title="No e-commerce stock" message="Nothing is allocated to e-commerce yet." />
        ) : (
          <FlatList
            data={stockQuery.data}
            keyExtractor={(r) => r.product_id}
            renderItem={renderStockRow}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={stockQuery.isRefetching}
                onRefresh={() => stockQuery.refetch()}
                tintColor={COLORS.primary}
                colors={[COLORS.primary]}
              />
            }
          />
        )}
      </View>

      <BarcodeScanner
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
        expectedType="any"
        title="Scan a box or carton"
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  summaryRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
  },
  summaryCell: { flex: 1, alignItems: 'center' },
  summaryNum: { fontSize: 20, fontWeight: '700', color: COLORS.primary },
  summaryLabel: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },

  tabs: { flexDirection: 'row', marginHorizontal: 12, marginTop: 10, marginBottom: 4 },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: COLORS.border },
  tabActive: { borderBottomColor: COLORS.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  tabTextActive: { color: COLORS.primary },

  scanBox: { marginHorizontal: 12, marginTop: 8 },
  scanRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scanInput: {
    flex: 1,
    height: 44,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    fontSize: 14,
    color: COLORS.text,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnDisabled: { opacity: 0.45 },
  addedText: { marginTop: 6, fontSize: 12, color: COLORS.success, fontWeight: '600' },

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
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, height: 42, fontSize: 14, color: COLORS.text },

  chipsContent: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  chipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipInactive: { backgroundColor: COLORS.surface, borderColor: COLORS.border },
  chipText: { fontSize: 12, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF' },
  chipTextInactive: { color: COLORS.textSecondary },
  historyLink: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 },
  historyLinkText: { fontSize: 12, fontWeight: '600', color: COLORS.primary },

  listContent: { paddingHorizontal: 12, paddingBottom: 24 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingVertical: 16, alignItems: 'center' },

  itemCard: { marginBottom: 10 },
  row1: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  barcode: { flex: 1, fontSize: 14, fontWeight: '700', color: COLORS.primary, fontFamily: undefined },
  nameLine: { fontSize: 13, color: COLORS.text, marginTop: 4, fontWeight: '600' },
  secondaryLine: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  datesLine: { fontSize: 11, color: COLORS.textLight, marginTop: 4 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16, marginTop: 8, borderTopWidth: 1, borderTopColor: COLORS.borderLight, paddingTop: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },

  stockRow: { flexDirection: 'row', marginTop: 8 },
  stockCell: { flex: 1 },
  stockNum: { fontSize: 18, fontWeight: '700', color: COLORS.primary },
  stockLabel: { fontSize: 11, color: COLORS.textSecondary },
});

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
} from 'react-native';
import { Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { COLORS, CARTON_STATUS_COLORS } from '../constants';
import { reportService } from '../services/report.service';
import type {
  ProductWiseRow,
  CartonRow,
  DispatchSummary,
  DailyActivityRow,
  InventorySummaryResponse,
  CustomerDispatchGroup,
} from '../types';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';
import RoleGate from '../components/RoleGate';
import { formatDate } from '../utils';

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = 'stock' | 'cartons' | 'dispatches' | 'activity';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'stock', label: 'Stock' },
  { id: 'cartons', label: 'Cartons' },
  { id: 'dispatches', label: 'Dispatches' },
  { id: 'activity', label: 'Activity' },
];

const CARTON_STATUS_FILTERS = ['All', 'CREATED', 'ACTIVE', 'CLOSED', 'DISPATCHED'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtISO = (d: Date): string => d.toISOString().split('T')[0];

function getDefaultDates() {
  const today = new Date();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return { today: fmtISO(today), weekAgo: fmtISO(weekAgo) };
}

const toISO = (v: string): string | undefined => {
  const trimmed = v.trim();
  if (!trimmed) return undefined;
  const d = new Date(trimmed + 'T00:00:00');
  if (isNaN(d.getTime())) return undefined;
  return d.toISOString().split('T')[0];
};

function statusColor(status: string): string {
  return CARTON_STATUS_COLORS[status] ?? COLORS.textSecondary;
}

// ─── DeniedView ───────────────────────────────────────────────────────────────

function DeniedView() {
  return (
    <View style={styles.centered}>
      <Text style={styles.deniedText}>
        You need Admin or Supervisor access to view reports.
      </Text>
    </View>
  );
}

// ─── SummaryCard ──────────────────────────────────────────────────────────────

function SummaryCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card style={styles.summaryCard} padded>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </Card>
  );
}

// ─── DateRangeFilter ──────────────────────────────────────────────────────────

interface DateRangeFilterProps {
  fromInput: string;
  toInput: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onApplyRange: (days: number) => void;
  onClear: () => void;
}

function DateRangeFilter({
  fromInput,
  toInput,
  onFromChange,
  onToChange,
  onApplyRange,
  onClear,
}: DateRangeFilterProps) {
  const hasDates = fromInput.length > 0 || toInput.length > 0;
  return (
    <Card style={styles.dateCard} padded={false}>
      <View style={styles.dateInputRow}>
        <View style={styles.dateInputGroup}>
          <Text style={styles.dateLabel}>From</Text>
          <TextInput
            style={styles.dateInput}
            value={fromInput}
            onChangeText={onFromChange}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={COLORS.textLight}
            keyboardType="numeric"
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="done"
          />
        </View>
        <View style={styles.dateSep} />
        <View style={styles.dateInputGroup}>
          <Text style={styles.dateLabel}>To</Text>
          <TextInput
            style={styles.dateInput}
            value={toInput}
            onChangeText={onToChange}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={COLORS.textLight}
            keyboardType="numeric"
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="done"
          />
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsContent}
      >
        <TouchableOpacity style={styles.chip} onPress={() => onApplyRange(1)} activeOpacity={0.7}>
          <Text style={styles.chipText}>Today</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.chip} onPress={() => onApplyRange(7)} activeOpacity={0.7}>
          <Text style={styles.chipText}>7d</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.chip} onPress={() => onApplyRange(30)} activeOpacity={0.7}>
          <Text style={styles.chipText}>30d</Text>
        </TouchableOpacity>
        {hasDates && (
          <TouchableOpacity
            style={[styles.chip, styles.chipClear]}
            onPress={onClear}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, styles.chipClearText]}>Clear</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </Card>
  );
}

// ─── Stock Tab ────────────────────────────────────────────────────────────────

function StockTab() {
  const summaryQuery = useQuery<InventorySummaryResponse, Error>({
    queryKey: ['reports', 'inventory-summary'],
    queryFn: () => reportService.getInventorySummary(),
  });

  const productQuery = useQuery<ProductWiseRow[], Error>({
    queryKey: ['reports', 'product-wise'],
    queryFn: () => reportService.getProductWiseReport(),
  });

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([summaryQuery.refetch(), productQuery.refetch()]);
    setRefreshing(false);
  }, [summaryQuery, productQuery]);

  const isLoading = summaryQuery.isLoading || productQuery.isLoading;
  const summary = summaryQuery.data ?? null;
  const rows = productQuery.data ?? [];

  if (isLoading && rows.length === 0) {
    return (
      <View style={styles.centered}>
        <Spinner />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.tabScroll}
      contentContainerStyle={styles.tabContent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={COLORS.primary}
          colors={[COLORS.primary]}
        />
      }
    >
      {/* Summary cards */}
      {summary && (
        <View style={styles.summaryRow}>
          <SummaryCard label="Products" value={summary.totalProducts} />
          <SummaryCard label="Pairs In Stock" value={summary.totalPairsInStock} />
          <SummaryCard label="Pairs Dispatched" value={summary.totalPairsDispatched} />
        </View>
      )}

      {/* Product-wise rows */}
      {rows.length === 0 ? (
        <EmptyState
          icon="bar-chart-outline"
          title="No data"
          message="Adjust filters or come back later."
        />
      ) : (
        rows.map((row, idx) => (
          <Card key={idx} style={styles.itemCard}>
            <View style={styles.rowHeader}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {row.article_name}
              </Text>
              <Text style={styles.skuText}>{row.sku}</Text>
            </View>
            <Text style={styles.rowSubtitle} numberOfLines={1}>
              {row.colour} · Size {row.size}
            </Text>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{row.total_boxes}</Text>
                <Text style={styles.statLabel}>Total</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: COLORS.statusFree }]}>
                  {row.free_boxes}
                </Text>
                <Text style={styles.statLabel}>Free</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: COLORS.statusPacked }]}>
                  {row.packed_boxes}
                </Text>
                <Text style={styles.statLabel}>Packed</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: COLORS.statusDispatched }]}>
                  {row.dispatched_boxes}
                </Text>
                <Text style={styles.statLabel}>Dispatched</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: COLORS.info }]}>
                  {row.pairs_in_stock}
                </Text>
                <Text style={styles.statLabel}>Pairs (Stock)</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{row.pairs_dispatched}</Text>
                <Text style={styles.statLabel}>Pairs (Sent)</Text>
              </View>
            </View>
          </Card>
        ))
      )}
    </ScrollView>
  );
}

// ─── Cartons Tab ──────────────────────────────────────────────────────────────

function CartonsTab() {
  const [statusFilter, setStatusFilter] = useState('All');

  const query = useQuery<CartonRow[], Error>({
    queryKey: ['reports', 'carton-inventory'],
    queryFn: () => reportService.getCartonInventory(),
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await query.refetch();
    setRefreshing(false);
  }, [query]);

  const filtered = useMemo(() => {
    const data = query.data ?? [];
    if (statusFilter === 'All') return data;
    return data.filter((c) => c.status === statusFilter);
  }, [query.data, statusFilter]);

  if (query.isLoading) {
    return (
      <View style={styles.centered}>
        <Spinner />
      </View>
    );
  }

  return (
    <View style={styles.tabFlex}>
      {/* Status filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterChipsContent}
        style={styles.filterChipsScroll}
      >
        {CARTON_STATUS_FILTERS.map((s) => {
          const active = statusFilter === s;
          return (
            <TouchableOpacity
              key={s}
              style={[styles.filterChip, active && styles.filterChipActive]}
              onPress={() => setStatusFilter(s)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {s}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {filtered.length === 0 ? (
        <EmptyState
          icon="bar-chart-outline"
          title="No data"
          message="Adjust filters or come back later."
        />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item, idx) => `${item.carton_barcode}-${idx}`}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }
          renderItem={({ item }) => (
            <Card style={styles.itemCard}>
              <View style={styles.rowHeader}>
                <Text style={styles.barcodeText} numberOfLines={1}>
                  {item.carton_barcode}
                </Text>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: statusColor(item.status) + '22' },
                  ]}
                >
                  <Text
                    style={[styles.statusBadgeText, { color: statusColor(item.status) }]}
                  >
                    {item.status}
                  </Text>
                </View>
              </View>
              <View style={styles.statsGrid}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{item.child_count}</Text>
                  <Text style={styles.statLabel}>Boxes</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{formatDate(item.created_at)}</Text>
                  <Text style={styles.statLabel}>Created</Text>
                </View>
                {item.dispatched_at && (
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{formatDate(item.dispatched_at)}</Text>
                    <Text style={styles.statLabel}>Dispatched</Text>
                  </View>
                )}
                {item.destination && (
                  <View style={[styles.statItem, { flexBasis: '60%' }]}>
                    <Text style={styles.statValue} numberOfLines={1}>
                      {item.destination}
                    </Text>
                    <Text style={styles.statLabel}>Destination</Text>
                  </View>
                )}
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}

// ─── Dispatches Tab ───────────────────────────────────────────────────────────

function DispatchesTab() {
  const { weekAgo, today } = useMemo(() => getDefaultDates(), []);
  const [fromInput, setFromInput] = useState(weekAgo);
  const [toInput, setToInput] = useState(today);
  const [fromDate, setFromDate] = useState<string | undefined>(weekAgo);
  const [toDate, setToDate] = useState<string | undefined>(today);

  // 300ms debounce for typed dates
  useEffect(() => {
    const timer = setTimeout(() => {
      setFromDate(toISO(fromInput));
      setToDate(toISO(toInput));
    }, 300);
    return () => clearTimeout(timer);
  }, [fromInput, toInput]);

  const applyRange = useCallback((days: number) => {
    const end = new Date();
    const start = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);
    const s = fmtISO(start);
    const e = fmtISO(end);
    setFromInput(s);
    setToInput(e);
    setFromDate(s);
    setToDate(e);
  }, []);

  const clearDates = useCallback(() => {
    setFromInput('');
    setToInput('');
    setFromDate(undefined);
    setToDate(undefined);
  }, []);

  const query = useQuery<DispatchSummary, Error>({
    queryKey: ['reports', 'dispatch-summary', fromDate, toDate],
    queryFn: () =>
      reportService.getDispatchSummary({ from_date: fromDate, to_date: toDate }),
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await query.refetch();
    setRefreshing(false);
  }, [query]);

  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);

  const data = query.data ?? null;

  const renderCustomerGroup = useCallback(
    ({ item, index }: { item: CustomerDispatchGroup; index: number }) => {
      const key = item.customer_id ?? `walk-in-${index}`;
      const isExpanded = expandedCustomer === key;
      return (
        <Card style={styles.itemCard} padded={false}>
          <TouchableOpacity
            style={styles.groupHeader}
            onPress={() => setExpandedCustomer(isExpanded ? null : key)}
            activeOpacity={0.7}
          >
            <View style={styles.groupHeaderLeft}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {item.customer_name}
              </Text>
              <Text style={styles.rowSubtitle}>
                {item.total_cartons} carton{item.total_cartons !== 1 ? 's' : ''}
                {item.destinations.length > 0 ? ` · ${item.destinations.join(', ')}` : ''}
              </Text>
            </View>
            <Text style={styles.groupCount}>{item.total_cartons}</Text>
          </TouchableOpacity>

          {isExpanded && item.items.length > 0 && (
            <View style={styles.groupExpanded}>
              {item.items.map((it, iIdx) => (
                <View key={iIdx} style={styles.expandedItem}>
                  <Text style={styles.expandedArticle}>{it.article_name}</Text>
                  <Text style={styles.expandedMeta}>
                    {it.colour} · Sizes: {it.sizes} · MRP ₹{Number(it.mrp).toFixed(0)}
                  </Text>
                  <Text style={styles.expandedMeta}>
                    {it.carton_count} carton{it.carton_count !== 1 ? 's' : ''} /{' '}
                    {it.box_count} box{it.box_count !== 1 ? 'es' : ''}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </Card>
      );
    },
    [expandedCustomer]
  );

  return (
    <View style={styles.tabFlex}>
      <DateRangeFilter
        fromInput={fromInput}
        toInput={toInput}
        onFromChange={setFromInput}
        onToChange={setToInput}
        onApplyRange={applyRange}
        onClear={clearDates}
      />

      {query.isLoading ? (
        <View style={styles.centered}>
          <Spinner />
        </View>
      ) : !data ? (
        <EmptyState
          icon="bar-chart-outline"
          title="No data"
          message="Adjust filters or come back later."
        />
      ) : (
        <FlatList
          data={data.by_customer ?? []}
          keyExtractor={(item, idx) =>
            item.customer_id ?? `walk-in-${idx}`
          }
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }
          ListHeaderComponent={
            <View style={styles.summaryRow}>
              <SummaryCard label="Dispatches" value={data.total_dispatches} />
              <SummaryCard label="Cartons Out" value={data.total_cartons_dispatched} />
            </View>
          }
          ListEmptyComponent={
            <EmptyState
              icon="bar-chart-outline"
              title="No data"
              message="No dispatches in this period."
            />
          }
          renderItem={renderCustomerGroup}
        />
      )}
    </View>
  );
}

// ─── Activity Tab ─────────────────────────────────────────────────────────────

function ActivityTab() {
  const { weekAgo, today } = useMemo(() => getDefaultDates(), []);
  const [fromInput, setFromInput] = useState(weekAgo);
  const [toInput, setToInput] = useState(today);
  const [fromDate, setFromDate] = useState(weekAgo);
  const [toDate, setToDate] = useState(today);

  // 300ms debounce for typed dates
  useEffect(() => {
    const timer = setTimeout(() => {
      const f = toISO(fromInput);
      const t = toISO(toInput);
      if (f) setFromDate(f);
      if (t) setToDate(t);
    }, 300);
    return () => clearTimeout(timer);
  }, [fromInput, toInput]);

  const applyRange = useCallback((days: number) => {
    const end = new Date();
    const start = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000);
    const s = fmtISO(start);
    const e = fmtISO(end);
    setFromInput(s);
    setToInput(e);
    setFromDate(s);
    setToDate(e);
  }, []);

  const clearDates = useCallback(() => {
    const def = getDefaultDates();
    setFromInput(def.weekAgo);
    setToInput(def.today);
    setFromDate(def.weekAgo);
    setToDate(def.today);
  }, []);

  const query = useQuery<DailyActivityRow[], Error>({
    queryKey: ['reports', 'daily-activity', fromDate, toDate],
    queryFn: () =>
      reportService.getDailyActivity({ from_date: fromDate, to_date: toDate }),
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await query.refetch();
    setRefreshing(false);
  }, [query]);

  const rows = query.data ?? [];

  return (
    <View style={styles.tabFlex}>
      <DateRangeFilter
        fromInput={fromInput}
        toInput={toInput}
        onFromChange={setFromInput}
        onToChange={setToInput}
        onApplyRange={applyRange}
        onClear={clearDates}
      />

      {query.isLoading ? (
        <View style={styles.centered}>
          <Spinner />
        </View>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="bar-chart-outline"
          title="No data"
          message="Adjust filters or come back later."
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.date}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }
          renderItem={({ item }) => (
            <Card style={styles.itemCard}>
              <Text style={styles.activityDate}>{item.date}</Text>
              <View style={styles.statsGrid}>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{item.boxes_created}</Text>
                  <Text style={styles.statLabel}>Boxes Created</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: COLORS.statusPacked }]}>
                    {item.boxes_packed}
                  </Text>
                  <Text style={styles.statLabel}>Packed</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{item.boxes_unpacked}</Text>
                  <Text style={styles.statLabel}>Unpacked</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: COLORS.statusDispatched }]}>
                    {item.boxes_dispatched}
                  </Text>
                  <Text style={styles.statLabel}>Dispatched</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{item.cartons_created}</Text>
                  <Text style={styles.statLabel}>Cartons</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: COLORS.statusClosed }]}>
                    {item.cartons_closed}
                  </Text>
                  <Text style={styles.statLabel}>Closed</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: COLORS.statusDispatched }]}>
                    {item.cartons_dispatched}
                  </Text>
                  <Text style={styles.statLabel}>Ctn Dispatched</Text>
                </View>
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}

// ─── Root screen ──────────────────────────────────────────────────────────────

export default function ReportsScreen() {
  const [activeTab, setActiveTab] = useState<TabId>('stock');

  return (
    <>
      <Stack.Screen options={{ title: 'Reports' }} />
      <RoleGate allow={['Admin', 'Supervisor']} fallback={<DeniedView />}>
        <View style={styles.container}>
          {/* Tab pill row */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.pillScroll}
            contentContainerStyle={styles.pillContent}
          >
            {TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  style={[styles.pill, active && styles.pillActive]}
                  onPress={() => setActiveTab(tab.id)}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Tab content */}
          <View style={styles.tabContainer}>
            {activeTab === 'stock' && <StockTab />}
            {activeTab === 'cartons' && <CartonsTab />}
            {activeTab === 'dispatches' && <DispatchesTab />}
            {activeTab === 'activity' && <ActivityTab />}
          </View>
        </View>
      </RoleGate>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // Pill tab bar
  pillScroll: {
    flexGrow: 0,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  pillContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  pill: {
    paddingHorizontal: 18,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: COLORS.text,
    backgroundColor: 'transparent',
  },
  pillActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  pillTextActive: {
    color: '#FFFFFF',
  },

  // Tab container
  tabContainer: {
    flex: 1,
  },
  tabFlex: {
    flex: 1,
  },
  tabScroll: {
    flex: 1,
  },
  tabContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 24,
    gap: 8,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 24,
  },

  // Summary cards
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  summaryCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.primary,
  },
  summaryLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 3,
    textAlign: 'center',
  },

  // Item cards
  itemCard: {
    marginBottom: 8,
  },
  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  rowTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginRight: 8,
  },
  skuText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  rowSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 10,
  },
  barcodeText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    fontFamily: 'monospace',
    marginRight: 8,
  },

  // Stats grid (2 × N)
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statItem: {
    flexBasis: '30%',
    flexGrow: 1,
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  statLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },

  // Status badge
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // Filter chips (carton status)
  filterChipsScroll: {
    flexGrow: 0,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  filterChipsContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },

  // Date range card
  dateCard: {
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 4,
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
  dateSep: {
    width: 12,
  },
  dateLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
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

  // Dispatch customer group
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  groupHeaderLeft: {
    flex: 1,
    marginRight: 8,
  },
  groupCount: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.primary,
  },
  groupExpanded: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  expandedItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  expandedArticle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 3,
  },
  expandedMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 1,
  },

  // Activity
  activityDate: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 10,
  },

  // Misc
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  deniedText: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
});

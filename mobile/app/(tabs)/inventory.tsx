import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '../../constants';
import { useApiQuery } from '../../hooks/useApi';
import { inventoryService } from '../../services/inventory.service';
import Spinner from '../../components/ui/Spinner';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import type {
  InventoryStockSummary,
  InventoryHierarchyItem,
  CartonHierarchyLevel,
  CartonStockNode,
} from '../../types';

// ─── Child Box hierarchy ───────────────────────────────────────────────────────

type Level = 'section' | 'article_name' | 'mrp' | 'colour' | 'product';

interface Breadcrumb {
  level: Level;
  label: string;
  filter: Record<string, string>;
  distinctMrpCount?: number;
}

function nextChildLevel(breadcrumbs: Breadcrumb[]): Level {
  if (breadcrumbs.length === 0) return 'section';
  const last = breadcrumbs[breadcrumbs.length - 1];
  switch (last.level) {
    case 'section': return 'article_name';
    case 'article_name': return (last.distinctMrpCount && last.distinctMrpCount > 1) ? 'mrp' : 'colour';
    case 'mrp': return 'colour';
    case 'colour': return 'product';
    default: return 'product';
  }
}

// ─── Carton hierarchy ──────────────────────────────────────────────────────────

type CartonCrumb = {
  level: CartonHierarchyLevel;
  label: string;
  filter: Record<string, string>;
};

function nextCartonLevel(crumbs: CartonCrumb[]): CartonHierarchyLevel {
  if (crumbs.length === 0) return 'status';
  const last = crumbs[crumbs.length - 1];
  switch (last.level) {
    case 'status': return 'section';
    case 'section': return 'article_name';
    case 'article_name': return 'carton';
    default: return 'carton';
  }
}

// ─── Status badge helpers ──────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  CREATED:    { bg: '#FEF3C7', text: '#92400E' },
  ACTIVE:     { bg: '#D1FAE5', text: '#065F46' },
  CLOSED:     { bg: '#FED7AA', text: '#9A3412' },
  DISPATCHED: { bg: '#E5E7EB', text: '#374151' },
};

function utilizationColor(pct: number): string {
  if (pct >= 90) return '#EF4444';
  if (pct >= 60) return '#F59E0B';
  return '#10B981';
}

// ─── Main screen ───────────────────────────────────────────────────────────────

export default function InventoryScreen() {
  const router = useRouter();

  // Tab toggle
  const [activeTab, setActiveTab] = useState<'child' | 'carton'>('child');

  // ── Child Box state ────────────────────────────────────────────────────────
  const [childBreadcrumbs, setChildBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const currentLevel = nextChildLevel(childBreadcrumbs);
  const currentFilters = childBreadcrumbs.reduce<Record<string, string>>(
    (acc, b) => ({ ...acc, ...b.filter }),
    {}
  );

  const { data: summary } = useApiQuery<InventoryStockSummary>(
    ['inventory-summary'],
    () => inventoryService.getStockSummary(),
  );

  const { data: childItems, isLoading: childLoading, refetch: childRefetch } =
    useApiQuery<InventoryHierarchyItem[]>(
      ['inventory-hierarchy', currentLevel, JSON.stringify(currentFilters)],
      () => inventoryService.getStockHierarchy({ level: currentLevel, ...currentFilters }),
      { enabled: activeTab === 'child' },
    );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await childRefetch();
    setRefreshing(false);
  }, [childRefetch]);

  const drillDownChild = (item: InventoryHierarchyItem) => {
    if (currentLevel === 'product') return;
    const filterKey = currentLevel; // 'section' | 'article_name' | 'mrp' | 'colour'
    const filterValue = item.key ?? item.name;
    setChildBreadcrumbs((prev) => [
      ...prev,
      {
        level: currentLevel,
        label: item.name,
        filter: { [filterKey]: filterValue },
        distinctMrpCount: currentLevel === 'section' ? undefined : currentLevel === 'article_name' ? item.distinctMrpCount : undefined,
      },
    ]);
  };

  const goBackChild = () => setChildBreadcrumbs((prev) => prev.slice(0, -1));
  const goToChildLevel = (index: number) => setChildBreadcrumbs((prev) => prev.slice(0, index));

  // ── Carton hierarchy state ─────────────────────────────────────────────────
  const [cartonCrumbs, setCartonCrumbs] = useState<CartonCrumb[]>([]);
  const [cartonPage, setCartonPage] = useState(1);
  const [cartonAccum, setCartonAccum] = useState<CartonStockNode[]>([]);

  const cartonLevel = nextCartonLevel(cartonCrumbs);
  const cartonFilters = cartonCrumbs.reduce<Record<string, string>>(
    (acc, c) => ({ ...acc, ...c.filter }),
    {}
  );

  const {
    data: cartonResult,
    isLoading: cartonLoading,
  } = useApiQuery<{ data: CartonStockNode[]; meta?: { page: number; limit: number; total: number; totalPages: number } }>(
    ['carton-hierarchy', cartonLevel, JSON.stringify(cartonFilters), String(cartonPage)],
    () => inventoryService.getCartonHierarchy(
      cartonLevel,
      {
        ...cartonFilters,
        ...(cartonLevel === 'carton' ? { page: cartonPage } : {}),
      }
    ),
    { enabled: activeTab === 'carton' },
  );

  // Accumulate carton leaf pages
  useEffect(() => {
    if (cartonLevel === 'carton' && cartonResult) {
      if (cartonPage === 1) {
        setCartonAccum(cartonResult.data);
      } else {
        setCartonAccum((prev) => [...prev, ...cartonResult.data]);
      }
    }
  }, [cartonResult]); // eslint-disable-line react-hooks/exhaustive-deps

  const cartonNodes: CartonStockNode[] =
    cartonLevel === 'carton'
      ? cartonAccum
      : (cartonResult?.data ?? []);

  const cartonMeta = cartonResult?.meta;

  const drillDownCarton = (node: CartonStockNode) => {
    if (cartonLevel === 'carton') {
      if (node.id) router.push(`/master-cartons/${node.id}` as any);
      return;
    }
    const filterKey = cartonLevel; // 'status' | 'section' | 'article_name'
    const filterValue = node.key ?? node.name;
    setCartonCrumbs((prev) => [
      ...prev,
      { level: cartonLevel, label: node.name, filter: { [filterKey]: filterValue } },
    ]);
    setCartonPage(1);
    setCartonAccum([]);
  };

  const goBackCarton = () => {
    setCartonCrumbs((prev) => prev.slice(0, -1));
    setCartonPage(1);
    setCartonAccum([]);
  };

  const goToCartonLevel = (index: number) => {
    setCartonCrumbs((prev) => prev.slice(0, index));
    setCartonPage(1);
    setCartonAccum([]);
  };

  const loadMoreCartons = () => {
    if (cartonMeta && cartonPage < cartonMeta.totalPages) {
      setCartonPage((p) => p + 1);
    }
  };

  // ── Switch tab ─────────────────────────────────────────────────────────────
  const switchTab = (tab: 'child' | 'carton') => {
    setActiveTab(tab);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const activeBreadcrumbs = activeTab === 'child' ? childBreadcrumbs : cartonCrumbs;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={COLORS.primary}
        />
      }
    >
      {/* Summary */}
      {summary && activeBreadcrumbs.length === 0 && (
        <View style={styles.summaryRow}>
          <Card style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{summary.totalPairsInStock}</Text>
            <Text style={styles.summaryLabel}>Pairs in Stock</Text>
          </Card>
          <Card style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{summary.totalChildBoxes}</Text>
            <Text style={styles.summaryLabel}>Child Boxes</Text>
          </Card>
        </View>
      )}

      {/* Tab Toggle */}
      <View style={styles.segmentedRow}>
        {(
          [
            { id: 'child', label: 'Child Box' },
            { id: 'carton', label: 'Master Carton' },
          ] as Array<{ id: 'child' | 'carton'; label: string }>
        ).map((tab, idx, arr) => {
          const active = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[
                styles.segmentBtn,
                active ? styles.segmentBtnActive : styles.segmentBtnInactive,
                idx === 0 && styles.segmentBtnFirst,
                idx === arr.length - 1 && styles.segmentBtnLast,
              ]}
              onPress={() => switchTab(tab.id)}
              activeOpacity={0.75}
            >
              <Text
                style={[
                  styles.segmentBtnText,
                  active ? styles.segmentBtnTextActive : styles.segmentBtnTextInactive,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Breadcrumbs */}
      {activeBreadcrumbs.length > 0 && (
        <View style={styles.breadcrumbs}>
          <TouchableOpacity onPress={() => activeTab === 'child' ? goToChildLevel(0) : goToCartonLevel(0)}>
            <Text style={styles.breadcrumbLink}>All</Text>
          </TouchableOpacity>
          {activeBreadcrumbs.map((b, i) => (
            <View key={i} style={styles.breadcrumbItem}>
              <Ionicons name="chevron-forward" size={14} color={COLORS.textLight} />
              <TouchableOpacity
                onPress={() => activeTab === 'child' ? goToChildLevel(i + 1) : goToCartonLevel(i + 1)}
                disabled={i === activeBreadcrumbs.length - 1}
              >
                <Text style={i === activeBreadcrumbs.length - 1 ? styles.breadcrumbActive : styles.breadcrumbLink}>
                  {b.label}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {activeBreadcrumbs.length > 0 && (
        <TouchableOpacity
          onPress={activeTab === 'child' ? goBackChild : goBackCarton}
          style={styles.backButton}
        >
          <Ionicons name="arrow-back" size={18} color={COLORS.primary} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      )}

      {/* ── Child Box view ── */}
      {activeTab === 'child' && (
        childLoading ? <Spinner /> : childItems && childItems.length > 0 ? (
          childItems.map((item, idx) => (
            <TouchableOpacity
              key={idx}
              onPress={() => drillDownChild(item)}
              disabled={currentLevel === 'product'}
              activeOpacity={0.7}
            >
              <Card style={styles.itemCard}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  {currentLevel !== 'product' && (
                    <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
                  )}
                </View>
                {currentLevel === 'article_name' && item.distinctMrpCount && item.distinctMrpCount > 1 && (
                  <Text style={styles.mrpCaption}>{item.distinctMrpCount} MRPs</Text>
                )}
                <View style={styles.stockBar}>
                  {item.total > 0 && (
                    <>
                      <View style={[styles.barSegment, { flex: item.free, backgroundColor: COLORS.statusFree }]} />
                      <View style={[styles.barSegment, { flex: item.packed, backgroundColor: COLORS.statusPacked }]} />
                      <View style={[styles.barSegment, { flex: item.dispatched, backgroundColor: COLORS.statusDispatched }]} />
                    </>
                  )}
                </View>
                <View style={styles.stockLabels}>
                  <Text style={[styles.stockLabel, { color: COLORS.statusFree }]}>Free: {item.free}</Text>
                  <Text style={[styles.stockLabel, { color: COLORS.statusPacked }]}>Packed: {item.packed}</Text>
                  <Text style={[styles.stockLabel, { color: COLORS.statusDispatched }]}>Disp: {item.dispatched}</Text>
                </View>
              </Card>
            </TouchableOpacity>
          ))
        ) : (
          !childLoading && (
            <EmptyState
              icon="layers-outline"
              title="No stock data"
              message="Products will appear here once inventory is added"
            />
          )
        )
      )}

      {/* ── Master Carton view ── */}
      {activeTab === 'carton' && (
        cartonLoading && cartonNodes.length === 0 ? (
          <Spinner />
        ) : cartonNodes.length > 0 ? (
          <>
            {cartonNodes.map((node, idx) =>
              cartonLevel === 'carton' ? (
                <CartonLeafCard key={node.id ?? idx} node={node} onPress={() => drillDownCarton(node)} />
              ) : (
                <CartonGroupCard key={idx} node={node} onPress={() => drillDownCarton(node)} />
              )
            )}
            {cartonLevel === 'carton' && cartonMeta && cartonPage < cartonMeta.totalPages && (
              <TouchableOpacity style={styles.loadMoreBtn} onPress={loadMoreCartons} activeOpacity={0.75}>
                <Text style={styles.loadMoreText}>
                  Load more ({cartonMeta.total - cartonNodes.length} remaining)
                </Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          !cartonLoading && (
            <EmptyState
              icon="cube-outline"
              title="No cartons found"
              message="Master cartons will appear here once created"
            />
          )
        )
      )}
    </ScrollView>
  );
}

// ─── Carton group (non-leaf) card ──────────────────────────────────────────────

function CartonGroupCard({ node, onPress }: { node: CartonStockNode; onPress: () => void }) {
  const statusBreakdown: Array<{ label: string; count: number; badge: { bg: string; text: string } }> = [
    { label: 'Created', count: node.createdCount ?? 0, badge: STATUS_BADGE.CREATED },
    { label: 'Active', count: node.activeCount ?? 0, badge: STATUS_BADGE.ACTIVE },
    { label: 'Closed', count: node.closedCount ?? 0, badge: STATUS_BADGE.CLOSED },
    { label: 'Dispatched', count: node.dispatchedCount ?? 0, badge: STATUS_BADGE.DISPATCHED },
  ].filter((s) => s.count > 0);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card style={styles.itemCard}>
        <View style={styles.itemHeader}>
          <Text style={styles.itemName}>{node.name}</Text>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
        </View>
        <Text style={styles.cartonSubtitle}>{node.cartonCount} carton(s)</Text>

        {statusBreakdown.length > 0 && (
          <View style={styles.chipRow}>
            {statusBreakdown.map((s) => (
              <View key={s.label} style={[styles.chip, { backgroundColor: s.badge.bg }]}>
                <Text style={[styles.chipText, { color: s.badge.text }]}>
                  {s.label}: {s.count}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.cartonFooter}>
          <Text style={styles.cartonFooterText}>{node.childBoxCount} boxes</Text>
          {node.avgUtilization !== undefined && (
            <Text style={styles.cartonFooterText}>{node.avgUtilization}% avg util</Text>
          )}
        </View>
      </Card>
    </TouchableOpacity>
  );
}

// ─── Carton leaf card ──────────────────────────────────────────────────────────

function CartonLeafCard({ node, onPress }: { node: CartonStockNode; onPress: () => void }) {
  const status = node.status ?? 'CREATED';
  const badge = STATUS_BADGE[status] ?? STATUS_BADGE.CREATED;

  const childCount = node.child_count ?? 0;
  const maxCap = node.max_capacity ?? 1;
  const pct = Math.round((childCount / maxCap) * 100);
  const barColor = utilizationColor(pct);

  const location = [node.primary_section, node.primary_article].filter(Boolean).join(' / ');

  const formatDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : null;

  const createdStr = formatDate(node.created_at);
  const closedStr = formatDate(node.closed_at);
  const dispatchedStr = formatDate(node.dispatched_at);

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <Card style={styles.itemCard}>
        {/* Header row: barcode + status badge */}
        <View style={styles.itemHeader}>
          <Text style={[styles.cartonBarcode, { flex: 1, marginRight: 8 }]} numberOfLines={1}>
            {node.carton_barcode}
          </Text>
          <View style={[styles.statusPill, { backgroundColor: badge.bg }]}>
            <Text style={[styles.statusPillText, { color: badge.text }]}>{status}</Text>
          </View>
        </View>

        {/* Location */}
        {!!location && (
          <Text style={styles.cartonSubtitle} numberOfLines={1}>{location}</Text>
        )}

        {/* Utilization bar */}
        <View style={styles.utilRow}>
          <View style={styles.utilBarTrack}>
            <View
              style={[styles.utilBarFill, { flex: pct, backgroundColor: barColor }]}
            />
            <View style={{ flex: 100 - pct }} />
          </View>
          <Text style={[styles.utilPct, { color: barColor }]}>{pct}%</Text>
        </View>
        <Text style={styles.utilLabel}>{childCount}/{maxCap} boxes</Text>

        {/* Dates */}
        <View style={styles.datesRow}>
          {createdStr && <Text style={styles.dateText}>Created: {createdStr}</Text>}
          {closedStr && <Text style={styles.dateText}>Closed: {closedStr}</Text>}
          {dispatchedStr && <Text style={styles.dateText}>Dispatched: {dispatchedStr}</Text>}
        </View>
      </Card>
    </TouchableOpacity>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 32 },

  // Summary
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  summaryCard: { flex: 1, alignItems: 'center', paddingVertical: 16 },
  summaryValue: { fontSize: 22, fontWeight: '800', color: COLORS.primary },
  summaryLabel: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },

  // Segmented control
  segmentedRow: {
    flexDirection: 'row',
    marginBottom: 16,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnFirst: { borderTopLeftRadius: 9, borderBottomLeftRadius: 9 },
  segmentBtnLast: { borderTopRightRadius: 9, borderBottomRightRadius: 9 },
  segmentBtnActive: { backgroundColor: COLORS.primary },
  segmentBtnInactive: {
    backgroundColor: COLORS.surface,
    borderRightWidth: 1,
    borderRightColor: COLORS.primary,
  },
  segmentBtnText: { fontSize: 13, fontWeight: '600' },
  segmentBtnTextActive: { color: COLORS.surface },
  segmentBtnTextInactive: { color: COLORS.primary },

  // Breadcrumbs
  breadcrumbs: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 },
  breadcrumbItem: { flexDirection: 'row', alignItems: 'center' },
  breadcrumbLink: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  breadcrumbActive: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  backText: { fontSize: 14, color: COLORS.primary, fontWeight: '600' },

  // Item card (shared)
  itemCard: { marginBottom: 10 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  itemName: { fontSize: 15, fontWeight: '700', color: COLORS.text, flex: 1, marginRight: 4 },

  // MRP caption (article level multi-MRP)
  mrpCaption: { fontSize: 12, color: COLORS.primary, fontWeight: '600', marginBottom: 6 },

  // Child Box stock bar
  stockBar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: COLORS.borderLight,
    marginBottom: 8,
  },
  barSegment: { minWidth: 2 },
  stockLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  stockLabel: { fontSize: 11, fontWeight: '600' },

  // Carton group
  cartonSubtitle: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 },
  chip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  chipText: { fontSize: 10, fontWeight: '600' },
  cartonFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  cartonFooterText: { fontSize: 11, color: COLORS.textSecondary },

  // Carton leaf
  cartonBarcode: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusPillText: { fontSize: 11, fontWeight: '700' },
  utilRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, marginBottom: 2 },
  utilBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: COLORS.borderLight,
    flexDirection: 'row',
  },
  utilBarFill: { borderRadius: 3 },
  utilPct: { fontSize: 11, fontWeight: '700', minWidth: 32, textAlign: 'right' },
  utilLabel: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 6 },
  datesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  dateText: { fontSize: 11, color: COLORS.textSecondary },

  // Load more
  loadMoreBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 10,
  },
  loadMoreText: { fontSize: 13, fontWeight: '600', color: COLORS.primary },
});

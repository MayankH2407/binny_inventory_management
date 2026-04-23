import { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants';
import { useApiQuery } from '../../hooks/useApi';
import { inventoryService } from '../../services/inventory.service';
import Spinner from '../../components/ui/Spinner';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import type { InventoryStockSummary, InventoryHierarchyItem } from '../../types';

type Level = 'section' | 'article_name' | 'colour' | 'product';

interface Breadcrumb {
  level: Level;
  label: string;
  filter: Record<string, string>;
}

export default function InventoryScreen() {
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const currentLevel: Level = breadcrumbs.length === 0 ? 'section'
    : breadcrumbs.length === 1 ? 'article_name'
    : breadcrumbs.length === 2 ? 'colour'
    : 'product';

  const currentFilters = breadcrumbs.reduce<Record<string, string>>((acc, b) => ({ ...acc, ...b.filter }), {});

  const { data: summary } = useApiQuery<InventoryStockSummary>(
    ['inventory-summary'],
    () => inventoryService.getStockSummary(),
  );

  const { data: items, isLoading, refetch } = useApiQuery<InventoryHierarchyItem[]>(
    ['inventory-hierarchy', currentLevel, JSON.stringify(currentFilters)],
    () => inventoryService.getStockHierarchy({ level: currentLevel, ...currentFilters }),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const drillDown = (item: InventoryHierarchyItem) => {
    if (currentLevel === 'product') return;
    const filterKey = currentLevel;
    setBreadcrumbs((prev) => [
      ...prev,
      { level: currentLevel, label: item.name, filter: { [filterKey]: item.name } },
    ]);
  };

  const goBack = () => {
    setBreadcrumbs((prev) => prev.slice(0, -1));
  };

  const goToLevel = (index: number) => {
    setBreadcrumbs((prev) => prev.slice(0, index));
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
    >
      {/* Summary */}
      {summary && breadcrumbs.length === 0 && (
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

      {/* Breadcrumbs */}
      {breadcrumbs.length > 0 && (
        <View style={styles.breadcrumbs}>
          <TouchableOpacity onPress={() => goToLevel(0)}>
            <Text style={styles.breadcrumbLink}>All</Text>
          </TouchableOpacity>
          {breadcrumbs.map((b, i) => (
            <View key={i} style={styles.breadcrumbItem}>
              <Ionicons name="chevron-forward" size={14} color={COLORS.textLight} />
              <TouchableOpacity onPress={() => goToLevel(i + 1)} disabled={i === breadcrumbs.length - 1}>
                <Text style={i === breadcrumbs.length - 1 ? styles.breadcrumbActive : styles.breadcrumbLink}>
                  {b.label}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {breadcrumbs.length > 0 && (
        <TouchableOpacity onPress={goBack} style={styles.backButton}>
          <Ionicons name="arrow-back" size={18} color={COLORS.primary} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
      )}

      {/* Items */}
      {isLoading ? <Spinner /> : items && items.length > 0 ? (
        items.map((item, idx) => (
          <TouchableOpacity
            key={idx}
            onPress={() => drillDown(item)}
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
        <EmptyState icon="layers-outline" title="No stock data" message="Products will appear here once inventory is added" />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 32 },
  summaryRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  summaryCard: { flex: 1, alignItems: 'center', paddingVertical: 16 },
  summaryValue: { fontSize: 22, fontWeight: '800', color: COLORS.primary },
  summaryLabel: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4 },
  breadcrumbs: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 },
  breadcrumbItem: { flexDirection: 'row', alignItems: 'center' },
  breadcrumbLink: { fontSize: 13, color: COLORS.primary, fontWeight: '600' },
  breadcrumbActive: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  backText: { fontSize: 14, color: COLORS.primary, fontWeight: '600' },
  itemCard: { marginBottom: 10 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  itemName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  stockBar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: COLORS.borderLight, marginBottom: 8 },
  barSegment: { minWidth: 2 },
  stockLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  stockLabel: { fontSize: 11, fontWeight: '600' },
});

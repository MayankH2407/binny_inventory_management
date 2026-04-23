import { View, Text, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { useState, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants';
import { useApiQuery } from '../../hooks/useApi';
import { dashboardService } from '../../services/dashboard.service';
import Spinner from '../../components/ui/Spinner';
import Card from '../../components/ui/Card';
import type { DashboardStats } from '../../types';

function StatCard({ icon, label, value, color }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number | string; color: string }) {
  return (
    <Card style={styles.statCard}>
      <View style={[styles.iconContainer, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon} size={22} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Card>
  );
}

export default function DashboardScreen() {
  const [refreshing, setRefreshing] = useState(false);

  const { data: stats, isLoading, refetch } = useApiQuery<DashboardStats>(
    ['dashboard-stats'],
    () => dashboardService.getStats(),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  if (isLoading) return <Spinner fullScreen />;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
    >
      <Text style={styles.welcome}>Welcome to Binny Inventory</Text>

      <View style={styles.grid}>
        <StatCard icon="cube-outline" label="Child Boxes" value={stats?.totalChildBoxes ?? 0} color={COLORS.primary} />
        <StatCard icon="archive-outline" label="Master Cartons" value={stats?.totalMasterCartons ?? 0} color={COLORS.info} />
        <StatCard icon="paper-plane-outline" label="Dispatches" value={stats?.totalDispatches ?? 0} color={COLORS.success} />
        <StatCard icon="footsteps-outline" label="Pairs in Stock" value={stats?.totalPairsInStock ?? 0} color={COLORS.accent} />
      </View>

      <Card style={styles.summaryCard}>
        <Text style={styles.sectionTitle}>Quick Summary</Text>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Free Boxes</Text>
          <Text style={styles.summaryValue}>{stats?.freeChildBoxes ?? 0}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Packed Boxes</Text>
          <Text style={styles.summaryValue}>{stats?.packedChildBoxes ?? 0}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Active Cartons</Text>
          <Text style={styles.summaryValue}>{stats?.activeMasterCartons ?? 0}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Closed Cartons</Text>
          <Text style={styles.summaryValue}>{stats?.closedMasterCartons ?? 0}</Text>
        </View>
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Today's Dispatches</Text>
          <Text style={[styles.summaryValue, { color: COLORS.accent }]}>{stats?.todayDispatches ?? 0}</Text>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 32 },
  welcome: { fontSize: 15, color: COLORS.textSecondary, marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  statCard: { width: '47%', alignItems: 'center', paddingVertical: 18 },
  iconContainer: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statValue: { fontSize: 24, fontWeight: '800', color: COLORS.text },
  statLabel: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  summaryCard: { marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 14 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
  summaryLabel: { fontSize: 14, color: COLORS.textSecondary },
  summaryValue: { fontSize: 14, fontWeight: '700', color: COLORS.text },
});

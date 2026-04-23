import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { COLORS } from '../../constants';
import { useApiQuery } from '../../hooks/useApi';
import { childBoxService } from '../../services/childBox.service';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';

export default function ChildBoxDetailStub() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data, isLoading } = useApiQuery(
    ['childBox', id ?? ''],
    () => childBoxService.getById(id!),
    { enabled: !!id },
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Child Box' }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        {isLoading ? (
          <View style={styles.centered}>
            <Spinner />
          </View>
        ) : data ? (
          <Card>
            {/* Header: barcode + status */}
            <View style={styles.headerRow}>
              <Text style={styles.barcode} numberOfLines={1}>
                {data.barcode}
              </Text>
              <Badge label={data.status} type="childBox" />
            </View>

            <View style={styles.divider} />

            {/* Detail rows */}
            <DetailRow label="Article" value={data.article_name} />
            <DetailRow label="Article Code" value={data.article_code} />
            <DetailRow label="Colour" value={data.colour} />
            <DetailRow label="Size" value={data.size} />
            <DetailRow label="SKU" value={data.sku} />
            <DetailRow
              label="MRP"
              value={`₹${Number(data.mrp).toFixed(2)}`}
            />
            <DetailRow
              label="Quantity"
              value={String(data.quantity)}
            />
            <DetailRow
              label="Created"
              value={new Date(data.created_at).toLocaleString('en-IN')}
            />

            <Text style={styles.note}>
              Full detail view coming in Phase B.2.
            </Text>
          </Card>
        ) : (
          <Text style={styles.notFound}>Child box not found.</Text>
        )}
      </ScrollView>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 16,
  },
  centered: {
    paddingTop: 60,
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  barcode: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginRight: 8,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  detailLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
    flex: 1,
  },
  detailValue: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '600',
    flex: 2,
    textAlign: 'right',
  },
  note: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 16,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  notFound: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    marginTop: 40,
    fontSize: 15,
  },
});

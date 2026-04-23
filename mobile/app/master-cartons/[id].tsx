import { useLocalSearchParams, Stack } from 'expo-router';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import { COLORS } from '../../constants';
import { useApiQuery } from '../../hooks/useApi';
import { masterCartonService } from '../../services/masterCarton.service';
import { formatDate } from '../../utils';

export default function MasterCartonDetailStub() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading } = useApiQuery(
    ['masterCarton', id ?? ''],
    () => masterCartonService.getById(id!),
    { enabled: !!id },
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Master Carton' }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {isLoading ? (
          <Spinner />
        ) : data ? (
          <Card>
            <View style={styles.headerRow}>
              <Text style={styles.barcode}>{data.carton_barcode}</Text>
              <Badge label={data.status} type="carton" />
            </View>
            <Text style={styles.detail}>
              Child boxes: {data.child_count} / {data.max_capacity}
            </Text>
            {!!data.article_summary && (
              <Text style={styles.detail}>Articles: {data.article_summary}</Text>
            )}
            {!!data.colour_summary && (
              <Text style={styles.detail}>Colours: {data.colour_summary}</Text>
            )}
            {!!data.size_summary && (
              <Text style={styles.detail}>Sizes: {data.size_summary}</Text>
            )}
            {data.mrp_summary != null && (
              <Text style={styles.detail}>
                Total MRP: ₹{Number(data.mrp_summary).toFixed(2)}
              </Text>
            )}
            <Text style={styles.detail}>Created: {formatDate(data.created_at)}</Text>
            {!!data.closed_at && (
              <Text style={styles.detail}>Closed: {formatDate(data.closed_at)}</Text>
            )}
            {!!data.dispatched_at && (
              <Text style={styles.detail}>
                Dispatched: {formatDate(data.dispatched_at)}
              </Text>
            )}
            <Text style={styles.note}>Full detail view coming in Phase B.2.</Text>
          </Card>
        ) : (
          <Text style={styles.notFound}>Master carton not found.</Text>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  barcode: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  detail: { fontSize: 14, color: COLORS.text, paddingVertical: 4 },
  note: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 12,
    fontStyle: 'italic',
  },
  notFound: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    marginTop: 40,
  },
});

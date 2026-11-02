import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams } from '../../navigation/router';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { COLORS, ECOMMERCE_STATUS_COLORS } from '../../constants';
import { ecommerceService } from '../../services/ecommerce.service';
import { useApiQuery } from '../../hooks/useApi';
import { formatDate } from '../../utils';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';

// Read-only history of a pre-redesign e-commerce record. The record-scoped
// create / add-box / scan-carton / close / full-unpack flows no longer exist on
// the backend — new activity lives in the E-commerce Area pool (list screen).
export default function EcommerceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: record, isLoading } = useApiQuery(['ecommerce', id], () => ecommerceService.getById(id));
  const { data: assortment } = useApiQuery(
    ['ecommerce-assortment', id],
    () => ecommerceService.getAssortment(id),
    { enabled: !!record }
  );
  const { data: cartons } = useApiQuery(
    ['ecommerce-cartons', id],
    () => ecommerceService.getCartons(id),
    { enabled: !!record }
  );

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: 'E-commerce record' }} />
        <View style={styles.centered}><Spinner /></View>
      </>
    );
  }

  if (!record) {
    return (
      <>
        <Stack.Screen options={{ title: 'E-commerce record' }} />
        <EmptyState icon="cart-outline" title="Record not found" message="This e-commerce record could not be loaded." />
      </>
    );
  }

  const totalQty = (assortment ?? []).reduce((sum, a) => sum + a.count, 0);
  const boxes = record.child_boxes ?? [];

  return (
    <>
      <Stack.Screen options={{ title: record.ecommerce_barcode }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.notice}>
          <Ionicons name="information-circle-outline" size={18} color="#92400E" />
          <Text style={styles.noticeText}>
            Read-only history of the previous e-commerce record workflow. New activity lives in the E-commerce Area.
          </Text>
        </View>

        <Card style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.name} numberOfLines={2}>{record.name}</Text>
            <Badge label={record.status} color={ECOMMERCE_STATUS_COLORS[record.status]} />
          </View>
          {!!record.marketplace && <Text style={styles.line}>Marketplace: {record.marketplace}</Text>}
          {!!record.order_reference && <Text style={styles.line}>Order ref: {record.order_reference}</Text>}
          {!!record.listing_sku && <Text style={styles.line}>Listing SKU: {record.listing_sku}</Text>}
          {!!record.mapped_date && <Text style={styles.line}>Mapped: {formatDate(record.mapped_date)}</Text>}
          {!!record.notes && <Text style={styles.line}>Notes: {record.notes}</Text>}
          <Text style={styles.meta}>
            Created {formatDate(record.created_at)}
            {record.closed_at ? ` · Closed ${formatDate(record.closed_at)}` : ''}
            {record.dispatched_at ? ` · Dispatched ${formatDate(record.dispatched_at)}` : ''}
          </Text>
          <Text style={styles.count}>{record.child_count} boxes</Text>
        </Card>

        {!!assortment?.length && (
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Assortment ({totalQty} prs)</Text>
            {assortment.map((a) => (
              <View key={`${a.article_name}-${a.colour}-${a.size}`} style={styles.listRow}>
                <Text style={styles.listMain} numberOfLines={1}>{a.article_name} · {a.colour} · {a.size}</Text>
                <Text style={styles.listQty}>{a.count}</Text>
              </View>
            ))}
          </Card>
        )}

        {!!cartons?.length && (
          <Card style={styles.card}>
            <Text style={styles.sectionTitle}>Cartons ({cartons.length})</Text>
            {cartons.map((c) => (
              <View key={c.mapping_id} style={styles.listRow}>
                <Text style={styles.listMain} numberOfLines={1}>{c.carton_barcode}</Text>
                <Text style={styles.listQty}>{c.child_count} boxes</Text>
              </View>
            ))}
          </Card>
        )}

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Child boxes ({boxes.length})</Text>
          {boxes.length === 0 ? (
            <Text style={styles.line}>No child boxes in this record.</Text>
          ) : (
            boxes.map((b, i) => (
              <View key={b.id} style={styles.boxRow}>
                <View style={styles.rowBetween}>
                  <Text style={styles.listMain}>#{i + 1} {b.barcode}</Text>
                  <Badge label={b.status} type="childBox" />
                </View>
                <Text style={styles.line} numberOfLines={1}>
                  {b.article_name} · {b.colour} · Size {b.size} · ₹{Number(b.mrp).toFixed(2)}
                </Text>
                {b.source === 'carton' && !!b.carton_barcode && (
                  <Text style={styles.meta}>Carton {b.carton_barcode}</Text>
                )}
              </View>
            ))
          )}
        </Card>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 12, paddingBottom: 32 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notice: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  noticeText: { flex: 1, fontSize: 12, color: '#92400E' },
  card: { marginBottom: 12 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, fontSize: 16, fontWeight: '700', color: COLORS.text },
  line: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },
  meta: { fontSize: 11, color: COLORS.textLight, marginTop: 4 },
  count: { fontSize: 14, fontWeight: '700', color: COLORS.primary, marginTop: 8 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  listMain: { flex: 1, fontSize: 13, color: COLORS.text, fontWeight: '600' },
  listQty: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  boxRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight },
});

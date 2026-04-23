import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  RefreshControl,
  Platform,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import { COLORS } from '../../constants';
import { useApiQuery } from '../../hooks/useApi';
import { productService } from '../../services/product.service';
import { formatDate } from '../../utils';

// ─── Sub-components ───────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [imageError, setImageError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const productQ = useApiQuery(
    ['product', id ?? ''],
    () => productService.getById(id!),
    { enabled: !!id },
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await productQ.refetch();
    setRefreshing(false);
  }, [productQ]);

  // ── Loading state ───────────────────────────────────────────────────────────

  if (productQ.isLoading && !productQ.data) {
    return (
      <>
        <Stack.Screen options={{ title: 'Product' }} />
        <View style={styles.centeredContainer}>
          <Spinner />
        </View>
      </>
    );
  }

  // ── Not found ───────────────────────────────────────────────────────────────

  if (!productQ.isLoading && !productQ.data) {
    return (
      <>
        <Stack.Screen options={{ title: 'Product' }} />
        <View style={styles.centeredContainer}>
          <EmptyState
            icon="alert-circle-outline"
            title="Product not found"
            message="This product may have been removed."
          />
        </View>
      </>
    );
  }

  const product = productQ.data!;

  // Size display: range if size_from exists, else plain size
  const sizeDisplay =
    product.size_from
      ? `${product.size_from} — ${product.size_to ?? ''}`
      : product.size || '—';

  // Show image only when url is present and image hasn't errored
  const showImage = !!product.image_url && !imageError;

  // ── Full render ─────────────────────────────────────────────────────────────

  return (
    <>
      <Stack.Screen options={{ title: 'Product' }} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        <Card style={styles.card}>
          {/* Product image (skip silently on error or when absent) */}
          {showImage && (
            <Image
              source={{ uri: product.image_url! }}
              style={styles.image}
              resizeMode="cover"
              onError={() => setImageError(true)}
            />
          )}

          {/* Header: name + status badge */}
          <Text style={styles.articleName}>{product.article_name}</Text>

          <View style={styles.headerBadgeRow}>
            <Text style={styles.skuMono} numberOfLines={1}>
              {product.sku}
            </Text>
            {!!product.article_code && (
              <Text style={styles.articleCode}> · {product.article_code}</Text>
            )}
            <View style={styles.badgeSpacer} />
            <Badge
              label={product.is_active ? 'Active' : 'Inactive'}
              color={product.is_active ? COLORS.success : COLORS.textSecondary}
            />
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* MRP — prominent */}
          <View style={styles.mrpRow}>
            <Text style={styles.mrpLabel}>MRP</Text>
            <Text style={styles.mrpValue}>₹{Number(product.mrp).toFixed(2)}</Text>
          </View>

          {/* Specs */}
          <DetailRow label="Colour" value={product.colour || '—'} />
          <DetailRow label="Size" value={sizeDisplay} />
          {!!product.category && (
            <DetailRow label="Category" value={product.category} />
          )}
          {!!product.section && (
            <DetailRow label="Section" value={product.section} />
          )}
          {!!product.location && (
            <DetailRow label="Location" value={product.location} />
          )}
          {!!product.article_group && (
            <DetailRow label="Article group" value={product.article_group} />
          )}
          {!!product.hsn_code && (
            <DetailRow label="HSN code" value={product.hsn_code} />
          )}
          {!!product.description && (
            <DetailRow label="Description" value={product.description} />
          )}

          {/* Divider */}
          <View style={styles.divider} />

          {/* Dates */}
          <DetailRow label="Created" value={formatDate(product.created_at)} />
          <DetailRow label="Updated" value={formatDate(product.updated_at)} />
        </Card>

        {/* Footer note */}
        <Text style={styles.footerNote}>
          Full editing and bulk creation available on the web portal.
        </Text>
      </ScrollView>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },

  card: {
    // card adds its own padding via padded=true default
  },

  // Image
  image: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 10,
    marginBottom: 14,
    backgroundColor: COLORS.borderLight,
  },

  // Header
  articleName: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  headerBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  skuMono: {
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: COLORS.text,
  },
  articleCode: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  badgeSpacer: {
    flex: 1,
    minWidth: 8,
  },

  // Divider
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginVertical: 12,
  },

  // MRP row
  mrpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  mrpLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  mrpValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.primary,
  },

  // Detail rows
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderLight,
  },
  detailLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    flex: 1,
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    flex: 2,
    textAlign: 'right',
  },

  // Footer note
  footerNote: {
    marginTop: 16,
    fontSize: 12,
    color: COLORS.textLight,
    textAlign: 'center',
    fontStyle: 'italic',
    paddingHorizontal: 8,
  },
});

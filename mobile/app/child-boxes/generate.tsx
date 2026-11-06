import { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Stack, router } from '../../navigation/router';
import { COLORS } from '../../constants';
import { childBoxService } from '../../services/childBox.service';
import { productService } from '../../services/product.service';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import { useCan } from '../../hooks/useCan';
import type { ChildBoxWithProduct, BulkCreateMultiSizeRequest } from '../../types';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';

interface Article {
  id: string;
  article_name: string;
  article_code: string | null;
  section: string | null;
}
interface ColourOption {
  colour: string;
  product_id: string;
}

/** Kids sizes (trailing K) first, then ascending numeric — same ordering as the web portal. */
function compareSizes(a: string, b: string): number {
  const x = a.trim();
  const y = b.trim();
  const kidX = /k$/i.test(x);
  const kidY = /k$/i.test(y);
  if (kidX !== kidY) return kidX ? -1 : 1;
  const nx = parseFloat(x);
  const ny = parseFloat(y);
  if (!isNaN(nx) && !isNaN(ny)) return nx - ny;
  return x.localeCompare(y);
}

const digitsOnly = (v: string) => v.replace(/[^0-9]/g, '');

export default function GenerateChildBoxesScreen() {
  const canCreate = useCan('child_boxes:create');
  const insets = useSafeAreaInsets();

  const [article, setArticle] = useState<Article | null>(null);
  const [colourProductId, setColourProductId] = useState('');
  const [pairs, setPairs] = useState('1');
  const [sizeQty, setSizeQty] = useState<Record<string, string>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [generated, setGenerated] = useState<ChildBoxWithProduct[]>([]);

  const { data: articles, isLoading: articlesLoading } = useApiQuery<Article[]>(
    ['product-articles'],
    () => productService.getArticles(),
    { enabled: canCreate },
  );

  const { data: colours, isLoading: coloursLoading } = useApiQuery<ColourOption[]>(
    ['product-colours', article?.id ?? ''],
    () => productService.getColours(article!.id) as unknown as Promise<ColourOption[]>,
    { enabled: !!article },
  );

  const effectiveProductId = colourProductId || article?.id || '';

  const { data: siblings, isLoading: sizesLoading } = useApiQuery(
    ['product-sizes', effectiveProductId],
    () => productService.getSizes(effectiveProductId),
    { enabled: !!effectiveProductId },
  );

  const sizes = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of siblings ?? []) if (!seen.has(p.size)) seen.set(p.size, p.size);
    return Array.from(seen.keys()).sort(compareSizes);
  }, [siblings]);

  const filteredArticles = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = articles ?? [];
    if (!term) return list;
    return list.filter(
      (a) =>
        a.article_name.toLowerCase().includes(term) ||
        (a.article_code ?? '').toLowerCase().includes(term),
    );
  }, [articles, search]);

  const entries = useMemo(
    () =>
      sizes
        .map((size) => ({ size, count: parseInt(sizeQty[size] || '0', 10) || 0 }))
        .filter((e) => e.count > 0),
    [sizes, sizeQty],
  );
  const total = entries.reduce((s, e) => s + e.count, 0);
  const pairsNum = parseInt(pairs || '0', 10) || 0;

  const { mutate: generate, isPending } = useApiMutation(
    (data: BulkCreateMultiSizeRequest) => childBoxService.bulkCreateMultiSize(data),
    {
      invalidateKeys: [['childBoxes'], ['dashboard-stats']],
      onSuccess: (data) => setGenerated(data),
    },
  );

  function selectArticle(a: Article) {
    setArticle(a);
    setColourProductId('');
    setSizeQty({});
    setPickerOpen(false);
    setSearch('');
  }

  function reset() {
    setGenerated([]);
    setArticle(null);
    setColourProductId('');
    setSizeQty({});
    setPairs('1');
  }

  function submit() {
    generate({ product_id: effectiveProductId, quantity: pairsNum, sizes: entries });
  }

  if (!canCreate) {
    return (
      <>
        <Stack.Screen options={{ title: 'Generate Child Boxes' }} />
        <EmptyState icon="lock-closed-outline" title="Not allowed" message="Your role cannot generate child boxes." />
      </>
    );
  }

  if (articlesLoading) return <Spinner fullScreen />;

  // ─── Success ──────────────────────────────────────────────────────────────
  if (generated.length > 0) {
    const bySize = generated.reduce<Record<string, number>>((acc, b) => {
      acc[b.size] = (acc[b.size] ?? 0) + 1;
      return acc;
    }, {});
    const first = generated[0];
    return (
      <>
        <Stack.Screen options={{ title: 'Boxes Generated' }} />
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
          <View style={styles.successIcon}>
            <Ionicons name="checkmark" size={44} color={COLORS.surface} />
          </View>
          <Text style={styles.successTitle}>{generated.length} child boxes created</Text>
          <Text style={styles.successSub}>
            {first.article_name} · {first.colour} · {pairsNum} pair{pairsNum === 1 ? '' : 's'} per box
          </Text>

          <View style={styles.chipRow}>
            {Object.entries(bySize).map(([size, n]) => (
              <View key={size} style={styles.sizeChip}>
                <Text style={styles.sizeChipText}>Size {size} × {n}</Text>
              </View>
            ))}
          </View>

          <Card style={styles.noteCard}>
            <View style={styles.noteRow}>
              <Ionicons name="print-outline" size={20} color={COLORS.info} />
              <Text style={styles.noteText}>
                Print the QR labels for these boxes from the web portal (Child Boxes → Generate), on the
                label printer.
              </Text>
            </View>
          </Card>

          <Button title="View Child Boxes" onPress={() => router.push('/child-boxes')} />
          <View style={{ height: 10 }} />
          <Button title="Generate More" variant="outline" onPress={reset} />
        </ScrollView>
      </>
    );
  }

  // ─── Form ─────────────────────────────────────────────────────────────────
  const canSubmit = !!effectiveProductId && pairsNum >= 1 && total > 0 && !isPending;

  return (
    <>
      <Stack.Screen options={{ title: 'Generate Child Boxes' }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.stepLabel}>1 · Article</Text>
          <TouchableOpacity activeOpacity={0.7} onPress={() => setPickerOpen(true)}>
            <Card style={styles.pickerCard}>
              <View style={{ flex: 1 }}>
                {article ? (
                  <>
                    <Text style={styles.pickerValue} numberOfLines={1}>{article.article_name}</Text>
                    {article.article_code ? (
                      <Text style={styles.pickerSub}>{article.article_code}</Text>
                    ) : null}
                  </>
                ) : (
                  <Text style={styles.pickerPlaceholder}>Select an article…</Text>
                )}
              </View>
              <Ionicons name="chevron-down" size={20} color={COLORS.textSecondary} />
            </Card>
          </TouchableOpacity>

          {article && (
            <>
              <Text style={styles.stepLabel}>2 · Colour</Text>
              {coloursLoading ? (
                <Spinner />
              ) : colours && colours.length > 0 ? (
                <View style={styles.chipRow}>
                  {colours.map((c) => {
                    const active = colourProductId === c.product_id;
                    return (
                      <TouchableOpacity
                        key={c.product_id}
                        activeOpacity={0.7}
                        onPress={() => {
                          setColourProductId(c.product_id);
                          setSizeQty({});
                        }}
                        style={[styles.colourChip, active && styles.colourChipActive]}
                      >
                        <Text style={[styles.colourChipText, active && styles.colourChipTextActive]}>
                          {c.colour}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : (
                <Text style={styles.hint}>No colour variants — using the article as is.</Text>
              )}
            </>
          )}

          {effectiveProductId !== '' && (colourProductId !== '' || !colours || colours.length === 0) && (
            <>
              <Text style={styles.stepLabel}>3 · Pairs per box</Text>
              <TextInput
                style={styles.input}
                value={pairs}
                onChangeText={(v) => setPairs(digitsOnly(v))}
                keyboardType="number-pad"
                maxLength={5}
              />

              <Text style={styles.stepLabel}>4 · Boxes per size</Text>
              {sizesLoading ? (
                <Spinner />
              ) : sizes.length === 0 ? (
                <Text style={styles.hint}>No sizes found for this product.</Text>
              ) : (
                <Card padded={false} style={styles.sizesCard}>
                  {sizes.map((size, i) => (
                    <View key={size} style={[styles.sizeRow, i > 0 && styles.sizeRowBorder]}>
                      <Text style={styles.sizeLabel}>Size {size}</Text>
                      <TextInput
                        style={styles.sizeInput}
                        value={sizeQty[size] ?? ''}
                        onChangeText={(v) => setSizeQty((p) => ({ ...p, [size]: digitsOnly(v) }))}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor={COLORS.textLight}
                        maxLength={4}
                      />
                    </View>
                  ))}
                </Card>
              )}
            </>
          )}
        </ScrollView>

        {/* Sticky summary + action, padded for the system nav bar */}
        <View style={[styles.footer, { paddingBottom: 12 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.footerTotal}>{total}</Text>
            <Text style={styles.footerLabel}>boxes to create</Text>
          </View>
          <View style={{ flex: 1.4 }}>
            <Button
              title={isPending ? 'Generating…' : 'Generate'}
              onPress={submit}
              disabled={!canSubmit}
              loading={isPending}
            />
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Article picker */}
      <Modal visible={pickerOpen} animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={[styles.modal, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setPickerOpen(false)} hitSlop={12}>
              <Ionicons name="close" size={26} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Select article</Text>
            <View style={{ width: 26 }} />
          </View>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={COLORS.textLight} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search article name or code"
              placeholderTextColor={COLORS.textLight}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <FlatList
            data={filteredArticles}
            keyExtractor={(a) => a.id}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={20}
            ListEmptyComponent={<Text style={styles.hint}>No articles match.</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.articleRow} onPress={() => selectArticle(item)}>
                <Text style={styles.articleName} numberOfLines={1}>{item.article_name}</Text>
                <Text style={styles.articleMeta}>
                  {[item.article_code, item.section].filter(Boolean).join(' · ')}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 24 },
  stepLabel: {
    fontSize: 12, fontWeight: '800', color: COLORS.primary, letterSpacing: 0.6,
    textTransform: 'uppercase', marginTop: 18, marginBottom: 8,
  },
  hint: { fontSize: 13, color: COLORS.textSecondary, paddingVertical: 8, textAlign: 'center' },
  pickerCard: { flexDirection: 'row', alignItems: 'center' },
  pickerValue: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  pickerSub: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  pickerPlaceholder: { fontSize: 15, color: COLORS.textLight },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  colourChip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1,
    borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  colourChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  colourChipText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  colourChipTextActive: { color: COLORS.surface },
  input: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: COLORS.text,
  },
  sizesCard: { overflow: 'hidden' },
  sizeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  sizeRowBorder: { borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  sizeLabel: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  sizeInput: {
    width: 84, textAlign: 'center', fontSize: 16, fontWeight: '700', color: COLORS.text,
    backgroundColor: COLORS.background, borderRadius: 10, paddingVertical: 8,
  },
  footer: {
    flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.borderLight,
  },
  footerTotal: { fontSize: 24, fontWeight: '800', color: COLORS.primary },
  footerLabel: { fontSize: 12, color: COLORS.textSecondary },
  modal: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: COLORS.surface,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8, margin: 12, paddingHorizontal: 12,
    backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
  },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 15, color: COLORS.text },
  articleRow: {
    paddingHorizontal: 16, paddingVertical: 13, backgroundColor: COLORS.surface,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  articleName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  articleMeta: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  successIcon: {
    alignSelf: 'center', width: 84, height: 84, borderRadius: 42, backgroundColor: COLORS.success,
    alignItems: 'center', justifyContent: 'center', marginTop: 24, marginBottom: 16,
  },
  successTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  successSub: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', marginTop: 6, marginBottom: 18 },
  sizeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: COLORS.primary + '15' },
  sizeChipText: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  noteCard: { marginVertical: 20 },
  noteRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  noteText: { flex: 1, fontSize: 13, lineHeight: 19, color: COLORS.textSecondary },
});

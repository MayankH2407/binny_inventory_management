import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useInfiniteQuery } from '@tanstack/react-query';

import { COLORS } from '../../constants';
import { parseQRCode } from '../../utils';
import { masterCartonService } from '../../services/masterCarton.service';
import { samplesService } from '../../services/samples.service';
import { ecommerceService } from '../../services/ecommerce.service';
import { customerService } from '../../services/customer.service';
import { dispatchService } from '../../services/dispatch.service';
import { useApiMutation } from '../../hooks/useApi';
import RoleGate from '../../components/RoleGate';
import BarcodeScanner from '../../components/BarcodeScanner';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Input from '../../components/ui/Input';
import {
  buildMasterCartonPayload,
  buildSamplePayload,
  buildEcommercePayload,
  ecItemKey,
  type EcPoolHit,
} from '../../utils/dispatchPayload';
import type {
  Customer,
  MasterCarton,
  SampleRecord,
  SampleItem,
  Foot,
  DispatchRecord,
  DispatchSourceType,
  CreateDispatchRequest,
} from '../../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const CUSTOMER_PAGE_SIZE = 20;

const FOOT_OPTIONS: Foot[] = ['LEFT', 'PAIR', 'RIGHT'];
const FOOT_LABEL: Record<Foot, string> = { LEFT: 'Left', PAIR: 'Pair', RIGHT: 'Right' };

// ─── Denied fallback ──────────────────────────────────────────────────────────

function DeniedView() {
  return (
    <View style={styles.deniedContainer}>
      <EmptyState
        icon="lock-closed-outline"
        title="Not authorized"
        message="You don't have permission to create dispatches."
      />
    </View>
  );
}

// ─── Customer Picker Modal ────────────────────────────────────────────────────

interface CustomerPickerProps {
  visible: boolean;
  onClose: () => void;
  onPick: (customer: Customer) => void;
}

function CustomerPicker({ visible, onClose, onPick }: CustomerPickerProps) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset search when modal opens
  useEffect(() => {
    if (visible) {
      setSearchInput('');
      setSearch('');
    }
  }, [visible]);

  // 300 ms debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(searchInput);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  const query = useInfiniteQuery({
    queryKey: ['customers-picker', { search }],
    queryFn: ({ pageParam }) =>
      customerService.getAll({
        page: pageParam as number,
        limit: CUSTOMER_PAGE_SIZE,
        search: search || undefined,
      }),
    getNextPageParam: (last) =>
      last.page < last.totalPages ? last.page + 1 : undefined,
    initialPageParam: 1,
    enabled: visible,
  });

  const customers: Customer[] = query.data?.pages.flatMap((p) => p.data) ?? [];

  const handleLoadMore = useCallback(() => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      query.fetchNextPage();
    }
  }, [query]);

  const renderCustomerRow = useCallback(
    ({ item }: { item: Customer }) => (
      <TouchableOpacity
        style={styles.pickerRow}
        activeOpacity={0.7}
        onPress={() => {
          onPick(item);
          onClose();
        }}
      >
        <View style={styles.pickerRowInfo}>
          <Text style={styles.pickerFirmName} numberOfLines={1}>
            {item.firm_name}
          </Text>
          {item.address ? (
            <Text style={styles.pickerAddress} numberOfLines={1}>
              {item.address}
            </Text>
          ) : null}
        </View>
        <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
      </TouchableOpacity>
    ),
    [onPick, onClose]
  );

  const keyExtractor = useCallback((item: Customer) => item.id, []);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent={Platform.OS === 'android'}
      onRequestClose={onClose}
    >
      <View style={styles.pickerRoot}>
        {/* Top bar */}
        <View style={styles.pickerTopBar}>
          <Text style={styles.pickerTitle}>Select Customer</Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={26} color={COLORS.text} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.pickerSearchContainer}>
          <Ionicons
            name="search-outline"
            size={18}
            color={COLORS.textSecondary}
            style={styles.pickerSearchIcon}
          />
          <TextInput
            style={styles.pickerSearchInput}
            placeholder="Search customers…"
            placeholderTextColor={COLORS.textLight}
            value={searchInput}
            onChangeText={setSearchInput}
            autoFocus
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>

        {/* List */}
        {query.isLoading ? (
          <View style={styles.pickerCenterState}>
            <Text style={styles.pickerHintText}>Loading…</Text>
          </View>
        ) : (
          <FlatList
            data={customers}
            keyExtractor={keyExtractor}
            renderItem={renderCustomerRow}
            contentContainerStyle={
              customers.length === 0 ? styles.pickerEmptyContainer : styles.pickerListContent
            }
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <EmptyState
                icon="person-outline"
                title="No customers found"
                message={search ? `No results for "${search}".` : 'No customers available.'}
              />
            }
            ItemSeparatorComponent={() => <View style={styles.pickerSeparator} />}
          />
        )}
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

function DispatchCreateScreen() {
  const router = useRouter();

  // ── Source selection ─────────────────────────────────────────────────────────
  const [selectedSource, setSelectedSource] = useState<DispatchSourceType>('master_carton');

  // ── Master carton state ──────────────────────────────────────────────────────
  const [scannedCartons, setScannedCartons] = useState<MasterCarton[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);

  // ── Sample state ─────────────────────────────────────────────────────────────
  // Scan the sample's own barcode, then tick the open items to ship. Anything
  // left unticked simply stays in the sample (partial dispatch by construction).
  const [selectedSample, setSelectedSample] = useState<SampleRecord | null>(null);
  const [selectedMappingIds, setSelectedMappingIds] = useState<Set<string>>(new Set());
  const [footOverrides, setFootOverrides] = useState<Record<string, Foot>>({});
  const [sampleRecipient, setSampleRecipient] = useState('');
  const [samplePurpose, setSamplePurpose] = useState('');
  const [sampleRefDate, setSampleRefDate] = useState('');
  const [sampleScannerOpen, setSampleScannerOpen] = useState(false);
  const [sampleManualInput, setSampleManualInput] = useState('');

  // ── E-commerce state (scan boxes / cartons straight out of the pool) ─────────
  const [ecItems, setEcItems] = useState<EcPoolHit[]>([]);
  const [ecReferenceName, setEcReferenceName] = useState('');
  const [ecMarketplace, setEcMarketplace] = useState('');
  const [ecOrderReference, setEcOrderReference] = useState('');
  const [ecListingSku, setEcListingSku] = useState('');
  const [ecOrderDate, setEcOrderDate] = useState('');
  const [ecommerceScannerOpen, setEcommerceScannerOpen] = useState(false);
  const [ecommerceManualInput, setEcommerceManualInput] = useState('');

  // ── Shared state ─────────────────────────────────────────────────────────────
  const [validating, setValidating] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [destination, setDestination] = useState('');
  const [transportDetails, setTransportDetails] = useState('');
  const [lrNumber, setLrNumber] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [notes, setNotes] = useState('');

  // ── Source switch ─────────────────────────────────────────────────────────────

  const switchSource = (source: DispatchSourceType) => {
    setSelectedSource(source);
    // Clear the other sources' selection state when switching
    if (source !== 'master_carton') setScannedCartons([]);
    if (source !== 'sample') clearSampleSelection();
    if (source !== 'ecommerce') setEcItems([]);
  };

  // ── Mutation ─────────────────────────────────────────────────────────────────

  const dispatchMutation = useApiMutation<DispatchRecord, CreateDispatchRequest>(
    (vars) => dispatchService.create(vars),
    {
      successMessage: 'Dispatch created.',
      invalidateKeys: [
        ['masterCartons'],
        ['dispatches'],
        ['childBoxes'],
        ['inventory'],
        ['inventory-summary'],
        ['inventory-hierarchy'],
        ['dashboard-stats'],
        // Samples / e-commerce pool lists + counters (keys shared with those screens)
        ['samples'],
        ['sample'],
        ['samples-summary'],
        ['ecommerce-pool'],
        ['ecommerce-pool-summary'],
        ['ecommerce-stock-summary'],
      ],
      onSuccess: async () => {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace('/dispatch' as any);
      },
    }
  );

  // ── Master carton scan handler ────────────────────────────────────────────────

  const handleCartonScan = async (raw: string) => {
    const parsed = parseQRCode(raw);
    const code = parsed.type === 'master' ? parsed.id : raw.trim().toUpperCase();

    if (scannedCartons.some((c) => c.carton_barcode === code)) {
      Alert.alert('Already scanned', `${code} is already in the list.`);
      return;
    }

    setValidating(true);
    try {
      const c = await masterCartonService.getByBarcode(code);
      if (c.status !== 'CLOSED') {
        const msg =
          c.status === 'ACTIVE'
            ? 'Close the carton before dispatching.'
            : c.status === 'CREATED'
            ? 'Carton is empty. Add boxes and close it first.'
            : c.status === 'DISPATCHED'
            ? 'This carton has already been dispatched.'
            : 'Only CLOSED cartons can be dispatched.';
        Alert.alert('Not dispatchable', msg);
        return;
      }
      setScannedCartons((prev) => [...prev, c]);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert(
        'Scan failed',
        err?.response?.data?.message ?? err?.message ?? 'Carton not found'
      );
    } finally {
      setValidating(false);
    }
  };

  const handleRemoveCarton = (barcode: string) => {
    setScannedCartons((prev) => prev.filter((c) => c.carton_barcode !== barcode));
  };

  // ── Sample lookup ─────────────────────────────────────────────────────────────

  const sampleItems: SampleItem[] = selectedSample?.items ?? [];
  const sampleScopeIsPartial =
    selectedSample !== null && selectedMappingIds.size < sampleItems.length;

  function clearSampleSelection() {
    setSelectedSample(null);
    setSelectedMappingIds(new Set());
    setFootOverrides({});
    setSampleRecipient('');
    setSamplePurpose('');
    setSampleRefDate('');
  }

  const lookupSample = async (raw: string) => {
    const code = raw.trim().toUpperCase();
    if (!code) return;
    setValidating(true);
    try {
      const record = await samplesService.getByBarcode(code);
      const items = record.items ?? [];
      if (items.length === 0) {
        Alert.alert(
          'Sample is empty',
          record.state === 'DISPATCHED'
            ? 'Everything in this sample has already been dispatched.'
            : 'Add boxes or cartons to this sample before dispatching it.'
        );
        return;
      }
      setSelectedSample(record);
      setSelectedMappingIds(new Set(items.map((i) => i.mapping_id)));
      setFootOverrides({});
      setSampleManualInput('');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert(
        'Lookup failed',
        err?.response?.data?.message ?? err?.message ?? 'Sample not found'
      );
    } finally {
      setValidating(false);
    }
  };

  const handleSampleScan = async (raw: string) => {
    const parsed = parseQRCode(raw);
    const code = parsed.type === 'sample' ? parsed.id : raw.trim().toUpperCase();
    await lookupSample(code);
  };

  const toggleSampleItem = (mappingId: string) => {
    setSelectedMappingIds((prev) => {
      const next = new Set(prev);
      if (next.has(mappingId)) next.delete(mappingId);
      else next.add(mappingId);
      return next;
    });
  };

  // ── E-commerce pool scan ──────────────────────────────────────────────────────
  // Each scan is checked against the E-commerce Area pool; only items actually
  // in the pool can be added. De-duped on TYPE:BARCODE.

  const addEcommerceItem = async (raw: string) => {
    const parsed = parseQRCode(raw);
    const code = (parsed.type === 'child' || parsed.type === 'master' ? parsed.id : raw)
      .trim()
      .toUpperCase();
    if (!code) return;

    setValidating(true);
    try {
      const result = await ecommerceService.lookupPoolItem(code);
      if (!result.in_pool) {
        Alert.alert(
          'Not in the E-commerce Area',
          result.reason || `${result.barcode ?? code} is not available in the E-commerce Area.`
        );
        return;
      }
      if (ecItems.some((i) => ecItemKey(i) === ecItemKey(result))) {
        Alert.alert('Already added', `${result.barcode} is already in the list.`);
        return;
      }
      setEcItems((prev) => [...prev, result]);
      setEcommerceManualInput('');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Alert.alert(
        'Scan failed',
        err?.response?.data?.message ?? err?.message ?? 'No box or carton found for that barcode'
      );
    } finally {
      setValidating(false);
    }
  };

  const removeEcommerceItem = (key: string) => {
    setEcItems((prev) => prev.filter((i) => ecItemKey(i) !== key));
  };

  // ── Submit ────────────────────────────────────────────────────────────────────

  function submit() {
    // A customer is required for master-carton dispatches only; sample and
    // e-commerce dispatches may ship without one (same as the web app).
    if (selectedSource === 'master_carton' && !customer) {
      Alert.alert('Select customer', 'Pick a customer before dispatching.');
      return;
    }

    if (selectedSource === 'master_carton') {
      if (scannedCartons.length === 0) {
        Alert.alert('No cartons', 'Scan at least one carton to dispatch.');
        return;
      }
    } else if (selectedSource === 'sample') {
      if (!selectedSample) {
        Alert.alert('No sample', 'Scan or enter a sample barcode to dispatch.');
        return;
      }
      if (selectedMappingIds.size === 0) {
        Alert.alert('No items selected', 'Tick at least one item to dispatch.');
        return;
      }
    } else if (ecItems.length === 0) {
      Alert.alert('No items', 'Scan at least one box or carton from the E-commerce Area.');
      return;
    }

    const base = {
      customerId: customer?.id,
      destination,
      transportDetails,
      lrNumber,
      vehicleNumber,
      notes,
    };

    let payload: CreateDispatchRequest;
    if (selectedSource === 'master_carton') {
      payload = buildMasterCartonPayload(base, scannedCartons.map((c) => c.id));
    } else if (selectedSource === 'sample') {
      payload = buildSamplePayload(
        base,
        selectedSample!.id,
        sampleItems,
        selectedMappingIds,
        footOverrides,
        { recipientName: sampleRecipient, purpose: samplePurpose, referenceDate: sampleRefDate }
      );
    } else {
      payload = buildEcommercePayload(base, ecItems, {
        referenceName: ecReferenceName,
        marketplace: ecMarketplace,
        orderReference: ecOrderReference,
        listingSku: ecListingSku,
        orderDate: ecOrderDate,
      });
    }

    dispatchMutation.mutate(payload);
  }

  // ── Submit button label + disabled ────────────────────────────────────────────

  const canSubmit =
    selectedSource === 'master_carton'
      ? !!customer && scannedCartons.length > 0
      : selectedSource === 'sample'
      ? selectedSample !== null && selectedMappingIds.size > 0
      : ecItems.length > 0;

  let submitLabel: string;
  if (selectedSource === 'master_carton') {
    const n = scannedCartons.length;
    submitLabel = n === 0 ? 'Dispatch Cartons' : `Dispatch ${n} Carton${n === 1 ? '' : 's'}`;
  } else if (selectedSource === 'sample') {
    submitLabel = !selectedSample
      ? 'Dispatch Sample'
      : sampleScopeIsPartial
      ? `Dispatch ${selectedMappingIds.size} of ${sampleItems.length} Items`
      : `Dispatch Sample — ${selectedSample.sample_barcode}`;
  } else {
    const n = ecItems.length;
    submitLabel = n === 0 ? 'Dispatch E-commerce' : `Dispatch ${n} Item${n === 1 ? '' : 's'}`;
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Dispatch' }} />

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Source Selector ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Dispatch Source</Text>
        </View>

        <View style={styles.segmentedRow}>
          {(
            [
              { id: 'master_carton', label: 'Master Carton' },
              { id: 'sample', label: 'Sample' },
              { id: 'ecommerce', label: 'E-commerce' },
            ] as Array<{ id: DispatchSourceType; label: string }>
          ).map((tab, idx, arr) => {
            const active = selectedSource === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={[
                  styles.segmentBtn,
                  active ? styles.segmentBtnActive : styles.segmentBtnInactive,
                  idx === 0 && styles.segmentBtnFirst,
                  idx === arr.length - 1 && styles.segmentBtnLast,
                ]}
                onPress={() => switchSource(tab.id)}
                activeOpacity={0.75}
              >
                <Text
                  style={[
                    styles.segmentBtnText,
                    active ? styles.segmentBtnTextActive : styles.segmentBtnTextInactive,
                  ]}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Master Carton section ── */}
        {selectedSource === 'master_carton' && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Cartons to Dispatch{' '}
                <Text style={styles.sectionCount}>({scannedCartons.length})</Text>
              </Text>
            </View>

            <Button
              title={validating ? 'Validating…' : 'Scan Master Carton'}
              onPress={() => setScannerOpen(true)}
              icon={<Ionicons name="qr-code-outline" size={18} color={COLORS.surface} />}
              fullWidth
              disabled={validating}
              style={styles.scanBtn}
            />

            <Card style={styles.listCard}>
              {scannedCartons.length === 0 ? (
                <View style={styles.listEmptyHint}>
                  <Text style={styles.listEmptyText}>
                    Scan at least one CLOSED carton to begin.
                  </Text>
                </View>
              ) : (
                <View>
                  {scannedCartons.map((carton, idx) => (
                    <View
                      key={carton.carton_barcode}
                      style={[
                        styles.cartonRow,
                        idx < scannedCartons.length - 1 && styles.cartonRowBorder,
                      ]}
                    >
                      <View style={styles.cartonInfo}>
                        <Text style={styles.cartonBarcode}>{carton.carton_barcode}</Text>
                        <Text style={styles.cartonMeta} numberOfLines={1}>
                          {carton.child_count} box{carton.child_count === 1 ? '' : 'es'}
                          {carton.article_summary ? ` · ${carton.article_summary}` : ''}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.trashBtn}
                        onPress={() => handleRemoveCarton(carton.carton_barcode)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name="trash-outline" size={22} color={COLORS.error} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </Card>
          </>
        )}

        {/* ── Sample section ── */}
        {selectedSource === 'sample' && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Sample to Dispatch</Text>
            </View>

            <Button
              title={validating ? 'Looking up…' : 'Scan Sample'}
              onPress={() => setSampleScannerOpen(true)}
              icon={<Ionicons name="flask-outline" size={18} color={COLORS.surface} />}
              fullWidth
              disabled={validating}
              style={styles.scanBtn}
            />

            <View style={styles.manualRow}>
              <View style={styles.manualInputWrap}>
                <Input
                  label="Or enter sample barcode manually"
                  placeholder="BINNY-SR-..."
                  value={sampleManualInput}
                  onChangeText={setSampleManualInput}
                  autoCapitalize="characters"
                  returnKeyType="search"
                  onSubmitEditing={() => lookupSample(sampleManualInput)}
                />
              </View>
              <TouchableOpacity
                style={[
                  styles.findBtn,
                  (!sampleManualInput.trim() || validating) && styles.findBtnDisabled,
                ]}
                onPress={() => lookupSample(sampleManualInput)}
                disabled={!sampleManualInput.trim() || validating}
                activeOpacity={0.75}
              >
                <Text style={styles.findBtnText}>Find</Text>
              </TouchableOpacity>
            </View>

            <Card style={styles.listCard}>
              {!selectedSample ? (
                <View style={styles.listEmptyHint}>
                  <Text style={styles.listEmptyText}>Scan a sample that has items in it to begin.</Text>
                </View>
              ) : (
                <View>
                  <View style={styles.sourcePreviewRow}>
                    <View style={styles.sourcePreviewInfo}>
                      <Text style={styles.sourcePreviewName}>
                        {selectedSample.name || selectedSample.sample_barcode}
                      </Text>
                      <Text style={styles.sourcePreviewBarcode}>{selectedSample.sample_barcode}</Text>
                      <Text style={styles.sourcePreviewMeta}>
                        {sampleItems.length} item{sampleItems.length === 1 ? '' : 's'} currently in this sample
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.trashBtn}
                      onPress={clearSampleSelection}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="close-circle-outline" size={22} color={COLORS.error} />
                    </TouchableOpacity>
                  </View>

                  {sampleItems.map((item) => {
                    const checked = selectedMappingIds.has(item.mapping_id);
                    const foot = footOverrides[item.mapping_id] ?? item.foot;
                    return (
                      <View key={item.mapping_id} style={styles.sampleItemRow}>
                        <TouchableOpacity
                          style={styles.sampleItemMain}
                          activeOpacity={0.7}
                          onPress={() => toggleSampleItem(item.mapping_id)}
                        >
                          <Ionicons
                            name={checked ? 'checkbox' : 'square-outline'}
                            size={24}
                            color={checked ? COLORS.primary : COLORS.textSecondary}
                          />
                          <View style={styles.cartonInfo}>
                            <Text style={styles.cartonBarcode}>
                              {item.barcode}
                              {item.item_type === 'CARTON' ? '  · Carton' : ''}
                            </Text>
                            <Text style={styles.cartonMeta} numberOfLines={1}>
                              {item.item_type === 'CARTON'
                                ? `${item.box_count} box${item.box_count === 1 ? '' : 'es'}`
                                : '1 box'}
                              {item.article_summary ? ` · ${item.article_summary}` : ''}
                              {item.colour_summary ? ` · ${item.colour_summary}` : ''}
                              {item.size_summary ? ` · ${item.size_summary}` : ''}
                            </Text>
                          </View>
                        </TouchableOpacity>
                        {item.item_type === 'BOX' && checked && (
                          <View style={styles.footRow}>
                            {FOOT_OPTIONS.map((f) => (
                              <TouchableOpacity
                                key={f}
                                style={[styles.footChip, foot === f && styles.footChipActive]}
                                onPress={() =>
                                  setFootOverrides((prev) => ({ ...prev, [item.mapping_id]: f }))
                                }
                                activeOpacity={0.75}
                              >
                                <Text style={[styles.footChipText, foot === f && styles.footChipTextActive]}>
                                  {FOOT_LABEL[f]}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </View>
                    );
                  })}

                  {sampleScopeIsPartial && (
                    <Text style={styles.partialHint}>
                      Partial dispatch — unticked items stay in this sample for a later dispatch.
                    </Text>
                  )}
                </View>
              )}
            </Card>

            {selectedSample && (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Sample Details (optional)</Text>
                </View>
                <Input
                  label="Recipient"
                  placeholder="Who is this sample going to?"
                  value={sampleRecipient}
                  onChangeText={setSampleRecipient}
                  containerStyle={styles.inputGap}
                />
                <Input
                  label="Purpose"
                  placeholder="e.g. Trade show, retailer trial"
                  value={samplePurpose}
                  onChangeText={setSamplePurpose}
                  containerStyle={styles.inputGap}
                />
                <Input
                  label="Reference Date"
                  placeholder="YYYY-MM-DD"
                  value={sampleRefDate}
                  onChangeText={setSampleRefDate}
                  keyboardType="numbers-and-punctuation"
                  containerStyle={styles.inputGap}
                />
              </>
            )}
          </>
        )}

        {/* ── E-commerce section ── */}
        {selectedSource === 'ecommerce' && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                E-commerce Items{' '}
                <Text style={styles.sectionCount}>({ecItems.length})</Text>
              </Text>
            </View>

            <Button
              title={validating ? 'Checking…' : 'Scan Box / Carton'}
              onPress={() => setEcommerceScannerOpen(true)}
              icon={<Ionicons name="cart-outline" size={18} color={COLORS.surface} />}
              fullWidth
              disabled={validating}
              style={styles.scanBtn}
            />

            <View style={styles.manualRow}>
              <View style={styles.manualInputWrap}>
                <Input
                  label="Or enter a box / carton barcode"
                  placeholder="CBxxxxxx / MCxxxxxx"
                  value={ecommerceManualInput}
                  onChangeText={setEcommerceManualInput}
                  autoCapitalize="characters"
                  returnKeyType="search"
                  onSubmitEditing={() => addEcommerceItem(ecommerceManualInput)}
                />
              </View>
              <TouchableOpacity
                style={[
                  styles.findBtn,
                  (!ecommerceManualInput.trim() || validating) && styles.findBtnDisabled,
                ]}
                onPress={() => addEcommerceItem(ecommerceManualInput)}
                disabled={!ecommerceManualInput.trim() || validating}
                activeOpacity={0.75}
              >
                <Text style={styles.findBtnText}>Add</Text>
              </TouchableOpacity>
            </View>

            <Card style={styles.listCard}>
              {ecItems.length === 0 ? (
                <View style={styles.listEmptyHint}>
                  <Text style={styles.listEmptyText}>
                    Scan boxes or cartons that are in the E-commerce Area.
                  </Text>
                </View>
              ) : (
                <View>
                  {ecItems.map((item, idx) => (
                    <View
                      key={ecItemKey(item)}
                      style={[styles.cartonRow, idx < ecItems.length - 1 && styles.cartonRowBorder]}
                    >
                      <View style={styles.cartonInfo}>
                        <Text style={styles.cartonBarcode}>
                          {item.barcode}
                          {item.item_type === 'CARTON' ? '  · Carton' : ''}
                        </Text>
                        <Text style={styles.cartonMeta} numberOfLines={1}>
                          {item.item_type === 'CARTON'
                            ? `${item.box_count} box${item.box_count === 1 ? '' : 'es'}`
                            : '1 box'}
                          {item.article_summary ? ` · ${item.article_summary}` : ''}
                          {item.colour_summary ? ` · ${item.colour_summary}` : ''}
                          {item.size_summary ? ` · ${item.size_summary}` : ''}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.trashBtn}
                        onPress={() => removeEcommerceItem(ecItemKey(item))}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name="trash-outline" size={22} color={COLORS.error} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </Card>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Order Details (optional)</Text>
            </View>
            <Input
              label="Reference Name"
              placeholder="Internal reference"
              value={ecReferenceName}
              onChangeText={setEcReferenceName}
              containerStyle={styles.inputGap}
            />
            <Input
              label="Marketplace"
              placeholder="e.g. Amazon, Flipkart"
              value={ecMarketplace}
              onChangeText={setEcMarketplace}
              containerStyle={styles.inputGap}
            />
            <Input
              label="Order Reference"
              placeholder="Marketplace order no."
              value={ecOrderReference}
              onChangeText={setEcOrderReference}
              containerStyle={styles.inputGap}
            />
            <Input
              label="Listing SKU"
              placeholder="Listing SKU"
              value={ecListingSku}
              onChangeText={setEcListingSku}
              autoCapitalize="characters"
              containerStyle={styles.inputGap}
            />
            <Input
              label="Order Date"
              placeholder="YYYY-MM-DD"
              value={ecOrderDate}
              onChangeText={setEcOrderDate}
              keyboardType="numbers-and-punctuation"
              containerStyle={styles.inputGap}
            />
          </>
        )}

        {/* ── Customer section ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Customer{selectedSource === 'master_carton' ? '' : ' (optional)'}
          </Text>
        </View>

        {!customer ? (
          <Button
            title="Select Customer"
            onPress={() => setCustomerPickerOpen(true)}
            variant="outline"
            icon={<Ionicons name="person-add-outline" size={18} color={COLORS.primary} />}
            fullWidth
            style={styles.customerBtn}
          />
        ) : (
          <Card style={styles.customerCard}>
            <View style={styles.customerCardInner}>
              <View style={styles.customerCardInfo}>
                <Text style={styles.customerFirmName}>{customer.firm_name}</Text>
                {customer.address ? (
                  <Text style={styles.customerAddress} numberOfLines={2}>
                    {customer.address}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity
                onPress={() => setCustomerPickerOpen(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.changeLink}>Change</Text>
              </TouchableOpacity>
            </View>
          </Card>
        )}

        {/* ── Details form (optional) ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Details (optional)</Text>
        </View>

        <Input
          label="Destination"
          placeholder="e.g. Mumbai Warehouse"
          value={destination}
          onChangeText={setDestination}
          returnKeyType="next"
          containerStyle={styles.inputGap}
        />

        <Input
          label="Transport Details"
          placeholder="e.g. DTDC Express"
          value={transportDetails}
          onChangeText={setTransportDetails}
          returnKeyType="next"
          containerStyle={styles.inputGap}
        />

        <Input
          label="LR Number"
          placeholder="Lorry receipt / consignment no."
          value={lrNumber}
          onChangeText={setLrNumber}
          returnKeyType="next"
          autoCapitalize="characters"
          containerStyle={styles.inputGap}
        />

        <Input
          label="Vehicle Number"
          placeholder="e.g. MH12AB1234"
          value={vehicleNumber}
          onChangeText={setVehicleNumber}
          autoCapitalize="characters"
          returnKeyType="next"
          containerStyle={styles.inputGap}
        />

        <Input
          label="Notes"
          placeholder="Any additional notes…"
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          style={styles.notesInput}
          containerStyle={styles.inputGap}
        />

        {/* ── Submit ── */}
        <Button
          title={submitLabel}
          onPress={submit}
          icon={<Ionicons name="send-outline" size={18} color={COLORS.surface} />}
          fullWidth
          disabled={!canSubmit || dispatchMutation.isPending}
          loading={dispatchMutation.isPending}
          style={styles.submitBtn}
        />
      </ScrollView>

      {/* ── Master Carton scanner modal ── */}
      <BarcodeScanner
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleCartonScan}
        expectedType="master"
        title="Scan Master Carton"
      />

      {/* ── Sample scanner modal ── */}
      <BarcodeScanner
        visible={sampleScannerOpen}
        onClose={() => setSampleScannerOpen(false)}
        onScan={handleSampleScan}
        expectedType="sample"
        title="Scan Sample"
      />

      {/* ── E-commerce scanner modal ── */}
      <BarcodeScanner
        visible={ecommerceScannerOpen}
        onClose={() => setEcommerceScannerOpen(false)}
        onScan={addEcommerceItem}
        expectedType="any"
        title="Scan Box / Carton"
      />

      {/* ── Customer picker modal ── */}
      <CustomerPicker
        visible={customerPickerOpen}
        onClose={() => setCustomerPickerOpen(false)}
        onPick={(c) => setCustomer(c)}
      />
    </KeyboardAvoidingView>
  );
}

// ─── Export (role-gated) ──────────────────────────────────────────────────────

export default function DispatchCreateScreenGated() {
  return (
    <RoleGate
      allow={['Admin', 'Supervisor', 'Dispatch Operator']}
      fallback={<DeniedView />}
    >
      <DispatchCreateScreen />
    </RoleGate>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Layout
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },
  deniedContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // Section headers
  sectionHeader: {
    marginBottom: 10,
    marginTop: 6,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCount: {
    fontWeight: '400',
    color: COLORS.textLight,
  },

  // Segmented control
  segmentedRow: {
    flexDirection: 'row',
    marginBottom: 20,
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
  segmentBtnFirst: {
    borderTopLeftRadius: 9,
    borderBottomLeftRadius: 9,
  },
  segmentBtnLast: {
    borderTopRightRadius: 9,
    borderBottomRightRadius: 9,
  },
  segmentBtnActive: {
    backgroundColor: COLORS.primary,
  },
  segmentBtnInactive: {
    backgroundColor: COLORS.surface,
    borderRightWidth: 1,
    borderRightColor: COLORS.primary,
  },
  segmentBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  segmentBtnTextActive: {
    color: COLORS.surface,
  },
  segmentBtnTextInactive: {
    color: COLORS.primary,
  },

  // Scan button
  scanBtn: {
    marginBottom: 12,
  },

  // Manual entry row
  manualRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginBottom: 12,
  },
  manualInputWrap: {
    flex: 1,
  },
  findBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 2,
  },
  sampleItemRow: {
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  sampleItemMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  footRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginLeft: 34,
  },
  footChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  footChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  footChipText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  footChipTextActive: {
    color: COLORS.surface,
  },
  partialHint: {
    marginTop: 8,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  findBtnDisabled: {
    backgroundColor: COLORS.textLight,
  },
  findBtnText: {
    color: COLORS.surface,
    fontWeight: '700',
    fontSize: 14,
  },

  // Scanned carton / source preview list card
  listCard: {
    marginBottom: 20,
  },
  listEmptyHint: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  listEmptyText: {
    fontSize: 13,
    color: COLORS.textLight,
    textAlign: 'center',
  },
  cartonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
  },
  cartonRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  cartonInfo: {
    flex: 1,
    minWidth: 0,
  },
  cartonBarcode: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 2,
  },
  cartonMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  trashBtn: {
    padding: 4,
  },

  // Source preview card (sample / ecommerce)
  sourcePreviewRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 4,
    gap: 10,
  },
  sourcePreviewInfo: {
    flex: 1,
    minWidth: 0,
  },
  sourcePreviewName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  sourcePreviewBarcode: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 4,
  },
  sourcePreviewMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 1,
  },

  // Customer section
  customerBtn: {
    marginBottom: 20,
  },
  customerCard: {
    marginBottom: 20,
  },
  customerCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  customerCardInfo: {
    flex: 1,
    minWidth: 0,
  },
  customerFirmName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  customerAddress: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  changeLink: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },

  // Details form
  inputGap: {
    marginBottom: 12,
  },
  notesInput: {
    minHeight: 80,
    paddingTop: 12,
  },

  // Submit button
  submitBtn: {
    marginTop: 8,
  },

  // ── Customer picker modal ──────────────────────────────────────────────────
  pickerRoot: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  pickerTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? 40 : 56,
    paddingBottom: 14,
    paddingHorizontal: 16,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  pickerSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 12,
    paddingHorizontal: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pickerSearchIcon: {
    marginRight: 8,
  },
  pickerSearchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.text,
  },
  pickerListContent: {
    paddingHorizontal: 12,
    paddingBottom: 32,
  },
  pickerEmptyContainer: {
    flex: 1,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 10,
  },
  pickerRowInfo: {
    flex: 1,
    minWidth: 0,
  },
  pickerFirmName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  pickerAddress: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  pickerSeparator: {
    height: 8,
  },
  pickerCenterState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerHintText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});

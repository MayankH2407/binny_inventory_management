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
import { childBoxService } from '../../services/childBox.service';
import { samplesService } from '../../services/samples.service';
import { customerService } from '../../services/customer.service';
import { masterCartonService } from '../../services/masterCarton.service';
import { useApiMutation } from '../../hooks/useApi';
import RoleGate from '../../components/RoleGate';
import BarcodeScanner from '../../components/BarcodeScanner';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import type { ChildBoxWithProduct, SampleRecord, Customer, MasterCarton } from '../../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const CUSTOMER_PAGE_SIZE = 20;

// ─── Denied fallback ──────────────────────────────────────────────────────────

function DeniedView() {
  return (
    <View style={styles.deniedContainer}>
      <EmptyState
        icon="lock-closed-outline"
        title="Not authorized"
        message="You don't have permission to create samples."
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
    [onPick, onClose],
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

function SampleCreateScreen() {
  const router = useRouter();

  // ── Form state ───────────────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [recipientName, setRecipientName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [sampleDate, setSampleDate] = useState(
    new Date().toISOString().split('T')[0],
  );
  const [notes, setNotes] = useState('');

  // ── Scan state ───────────────────────────────────────────────────────────────
  const [scannedBarcodes, setScannedBarcodes] = useState<string[]>([]);
  const [boxDetails, setBoxDetails] = useState<Record<string, ChildBoxWithProduct>>({});
  const [scannerOpen, setScannerOpen] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [validating, setValidating] = useState(false);

  // ── Master carton scan state ─────────────────────────────────────────────────
  const [scannedCartons, setScannedCartons] = useState<MasterCarton[]>([]);
  const [cartonScannerOpen, setCartonScannerOpen] = useState(false);
  const [manualCartonInput, setManualCartonInput] = useState('');
  const [validatingCarton, setValidatingCarton] = useState(false);

  // ── Mutation ─────────────────────────────────────────────────────────────────
  const createMutation = useApiMutation<SampleRecord, Parameters<typeof samplesService.create>[0]>(
    (vars) => samplesService.create(vars),
    {
      successMessage: 'Sample created successfully.',
      invalidateKeys: [
        ['samples'],
        ['childBoxes'],
        ['inventory-summary'],
        ['inventory-hierarchy'],
        ['dashboard-stats'],
      ],
      onSuccess: (sample) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace(`/samples/${sample.id}` as any);
      },
    },
  );

  // ── Box validation + add ─────────────────────────────────────────────────────
  const addBarcode = async (raw: string) => {
    const parsed = parseQRCode(raw);
    const barcode = parsed.type === 'child' ? parsed.id : raw.trim().toUpperCase();

    if (scannedBarcodes.includes(barcode)) {
      Alert.alert('Already scanned', `${barcode} is already in the list.`);
      return;
    }

    // Optimistically add to list
    setScannedBarcodes((prev) => [...prev, barcode]);
    setValidating(true);

    try {
      const box = await childBoxService.getByBarcode(barcode);
      if (box.status !== 'FREE' && box.status !== 'GENERATED') {
        // Remove from list — invalid status
        setScannedBarcodes((prev) => prev.filter((b) => b !== barcode));
        Alert.alert(
          'Box not available',
          `Box ${barcode} is ${box.status} — only FREE or GENERATED boxes can be added.`,
        );
        return;
      }
      setBoxDetails((prev) => ({ ...prev, [barcode]: box }));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      setScannedBarcodes((prev) => prev.filter((b) => b !== barcode));
      const msg = err?.response?.data?.message ?? err?.message ?? 'Box not found';
      Alert.alert('Scan failed', msg);
    } finally {
      setValidating(false);
    }
  };

  const handleScan = (raw: string) => {
    setScannerOpen(false);
    addBarcode(raw);
  };

  const handleManualAdd = () => {
    const trimmed = manualInput.trim();
    if (!trimmed) return;
    setManualInput('');
    addBarcode(trimmed);
  };

  const handleRemove = (barcode: string) => {
    setScannedBarcodes((prev) => prev.filter((b) => b !== barcode));
    setBoxDetails((prev) => {
      const next = { ...prev };
      delete next[barcode];
      return next;
    });
  };

  const handleClearAll = () => {
    Alert.alert('Clear All', 'Remove all scanned boxes?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          setScannedBarcodes([]);
          setBoxDetails({});
        },
      },
    ]);
  };

  // ── Master carton validation + add ───────────────────────────────────────────
  const addCarton = async (raw: string) => {
    const parsed = parseQRCode(raw);
    const barcode = parsed.type === 'master' ? parsed.id : raw.trim().toUpperCase();

    if (scannedCartons.some((c) => c.carton_barcode === barcode)) {
      Alert.alert('Already scanned', `Carton ${barcode} is already in the list.`);
      return;
    }

    setValidatingCarton(true);
    try {
      const carton = await masterCartonService.getByBarcode(barcode);
      if (carton.status === 'DISPATCHED') {
        Alert.alert('Carton unavailable', 'This carton has already been dispatched.');
        return;
      }
      if (carton.status === 'CREATED' || carton.child_count === 0) {
        Alert.alert('Carton unavailable', 'This carton is empty. Pack boxes first.');
        return;
      }
      setScannedCartons((prev) => [...prev, carton]);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Master carton not found';
      Alert.alert('Scan failed', msg);
    } finally {
      setValidatingCarton(false);
    }
  };

  const handleScanCarton = (raw: string) => {
    setCartonScannerOpen(false);
    addCarton(raw);
  };

  const handleManualAddCarton = () => {
    const trimmed = manualCartonInput.trim();
    if (!trimmed) return;
    setManualCartonInput('');
    addCarton(trimmed);
  };

  const handleRemoveCarton = (cartonId: string) => {
    setScannedCartons((prev) => prev.filter((c) => c.id !== cartonId));
  };

  const totalCartonBoxes = scannedCartons.reduce((sum, c) => sum + c.child_count, 0);

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    if (!name.trim()) {
      Alert.alert('Validation', 'Sample name is required.');
      return;
    }
    if (scannedBarcodes.length === 0 && scannedCartons.length === 0) {
      Alert.alert('Validation', 'Scan at least one child box or master carton before creating the sample.');
      return;
    }

    createMutation.mutate({
      name: name.trim(),
      customer_id: selectedCustomer?.id ?? null,
      recipient_name: recipientName.trim() || null,
      purpose: purpose.trim() || null,
      sample_date: sampleDate.trim() || null,
      notes: notes.trim() || null,
      child_box_barcodes: scannedBarcodes,
      carton_barcodes: scannedCartons.map((c) => c.carton_barcode),
    });
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Create Sample' }} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* ── Form fields ──────────────────────────────────────────────────── */}
        <Card style={styles.formCard}>
          {/* Sample Name */}
          <Text style={styles.fieldLabel}>Sample Name *</Text>
          <TextInput
            style={styles.textInput}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Spring Exhibition 2026"
            placeholderTextColor={COLORS.textLight}
            autoCorrect={false}
          />

          {/* Customer */}
          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Customer (optional)</Text>
          {selectedCustomer ? (
            <View style={styles.customerCard}>
              <View style={styles.customerCardInfo}>
                <Text style={styles.customerFirmName} numberOfLines={1}>
                  {selectedCustomer.firm_name}
                </Text>
                {selectedCustomer.address ? (
                  <Text style={styles.customerAddress} numberOfLines={1}>
                    {selectedCustomer.address}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity
                onPress={() => setSelectedCustomer(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.changeLink}>Change</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.selectCustomerBtn}
              onPress={() => setCustomerPickerOpen(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="person-add-outline" size={18} color={COLORS.primary} />
              <Text style={styles.selectCustomerText}>Select Customer</Text>
            </TouchableOpacity>
          )}

          {/* Recipient Name */}
          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Recipient Name (optional)</Text>
          <TextInput
            style={styles.textInput}
            value={recipientName}
            onChangeText={setRecipientName}
            placeholder="Free-text recipient — used when no customer is selected."
            placeholderTextColor={COLORS.textLight}
            autoCorrect={false}
          />

          {/* Purpose */}
          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Purpose (optional)</Text>
          <TextInput
            style={[styles.textInput, styles.multilineInput]}
            value={purpose}
            onChangeText={setPurpose}
            placeholder="e.g. Dealer exhibition, internal QC"
            placeholderTextColor={COLORS.textLight}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          {/* Sample Date */}
          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Sample Date (optional)</Text>
          <TextInput
            style={styles.textInput}
            value={sampleDate}
            onChangeText={setSampleDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={COLORS.textLight}
            autoCorrect={false}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
          />

          {/* Notes */}
          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Notes (optional)</Text>
          <TextInput
            style={[styles.textInput, styles.multilineInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Any additional notes…"
            placeholderTextColor={COLORS.textLight}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </Card>

        {/* ── Scan section ─────────────────────────────────────────────────── */}
        <Card style={styles.scanCard}>
          {/* Header row */}
          <View style={styles.scanHeader}>
            <Text style={styles.sectionTitle}>
              Scanned Items ({scannedBarcodes.length} boxes)
            </Text>
            {scannedBarcodes.length > 0 && (
              <TouchableOpacity onPress={handleClearAll}>
                <Text style={styles.clearAllText}>Clear All</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Scanner button */}
          <Button
            title={validating ? 'Validating…' : 'Scan Child Box'}
            onPress={() => setScannerOpen(true)}
            icon={<Ionicons name="qr-code-outline" size={18} color={COLORS.surface} />}
            fullWidth
            disabled={validating}
            style={styles.scanBtn}
          />

          {/* Manual entry */}
          <View style={styles.manualRow}>
            <TextInput
              style={styles.manualInput}
              value={manualInput}
              onChangeText={setManualInput}
              placeholder="Enter barcode manually…"
              placeholderTextColor={COLORS.textLight}
              autoCorrect={false}
              autoCapitalize="characters"
              returnKeyType="done"
              onSubmitEditing={handleManualAdd}
            />
            <TouchableOpacity
              style={styles.addBtn}
              onPress={handleManualAdd}
              activeOpacity={0.75}
              disabled={!manualInput.trim()}
            >
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
          </View>

          {/* Scanned items list */}
          {scannedBarcodes.length === 0 ? (
            <EmptyState
              icon="cube-outline"
              title="No boxes scanned yet"
              message="Tap Scan Child Box or enter a barcode manually."
            />
          ) : (
            <View style={styles.scannedList}>
              {scannedBarcodes.map((barcode, idx) => {
                const detail = boxDetails[barcode];
                return (
                  <View
                    key={barcode}
                    style={[styles.scannedRow, idx < scannedBarcodes.length - 1 && styles.scannedRowBorder]}
                  >
                    <Text style={styles.scannedIndex}>{idx + 1}.</Text>
                    <View style={styles.scannedInfo}>
                      <Text style={styles.scannedBarcode} numberOfLines={1}>
                        {barcode}
                      </Text>
                      {detail ? (
                        <Text style={styles.scannedMeta} numberOfLines={1}>
                          {detail.article_name} · {detail.colour} · {detail.size} · ₹{Number(detail.mrp).toFixed(2)}
                        </Text>
                      ) : (
                        <Text style={styles.scannedLoading}>Loading…</Text>
                      )}
                    </View>
                    <TouchableOpacity
                      style={styles.trashBtn}
                      onPress={() => handleRemove(barcode)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="trash-outline" size={20} color={COLORS.error} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
        </Card>

        {/* ── Scan Master Carton section ──────────────────────────────────── */}
        <Card style={styles.scanCard}>
          <View style={styles.scanHeader}>
            <Text style={styles.sectionTitle}>
              Scanned Cartons ({scannedCartons.length}{scannedCartons.length > 0 ? `, ${totalCartonBoxes} boxes` : ''})
            </Text>
          </View>

          <Text style={styles.cartonHint}>
            Scan a whole master carton to add all of its packed boxes at once. The carton stays intact.
          </Text>

          <Button
            title={validatingCarton ? 'Validating…' : 'Scan Master Carton'}
            onPress={() => setCartonScannerOpen(true)}
            icon={<Ionicons name="cube-outline" size={18} color={COLORS.surface} />}
            fullWidth
            disabled={validatingCarton}
            style={styles.scanBtn}
          />

          <View style={styles.manualRow}>
            <TextInput
              style={styles.manualInput}
              value={manualCartonInput}
              onChangeText={setManualCartonInput}
              placeholder="Enter carton barcode manually…"
              placeholderTextColor={COLORS.textLight}
              autoCorrect={false}
              autoCapitalize="characters"
              returnKeyType="done"
              onSubmitEditing={handleManualAddCarton}
            />
            <TouchableOpacity
              style={styles.addBtn}
              onPress={handleManualAddCarton}
              activeOpacity={0.75}
              disabled={!manualCartonInput.trim()}
            >
              <Text style={styles.addBtnText}>Add</Text>
            </TouchableOpacity>
          </View>

          {scannedCartons.length > 0 && (
            <View style={styles.scannedList}>
              {scannedCartons.map((carton, idx) => (
                <View
                  key={carton.id}
                  style={[styles.scannedRow, idx < scannedCartons.length - 1 && styles.scannedRowBorder]}
                >
                  <Badge label="CARTON" type="carton" />
                  <View style={styles.scannedInfo}>
                    <Text style={styles.scannedBarcode} numberOfLines={1}>
                      {carton.carton_barcode}
                    </Text>
                    <Text style={styles.scannedMeta} numberOfLines={1}>
                      {[carton.article_summary, carton.colour_summary, carton.size_summary]
                        .filter(Boolean)
                        .join(' · ') || `${carton.child_count} boxes`}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.trashBtn}
                    onPress={() => handleRemoveCarton(carton.id)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="trash-outline" size={20} color={COLORS.error} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </Card>

        {/* ── Submit ───────────────────────────────────────────────────────── */}
        <Button
          title={`Create Sample (${scannedBarcodes.length} boxes${scannedCartons.length > 0 ? ` + ${scannedCartons.length} carton${scannedCartons.length !== 1 ? 's' : ''}` : ''})`}
          onPress={handleSubmit}
          icon={<Ionicons name="checkmark-circle-outline" size={18} color={COLORS.surface} />}
          fullWidth
          disabled={(scannedBarcodes.length === 0 && scannedCartons.length === 0) || !name.trim() || createMutation.isPending}
          loading={createMutation.isPending}
          style={styles.submitBtn}
        />
      </ScrollView>

      {/* Scanner modal */}
      <BarcodeScanner
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
        expectedType="child"
        title="Scan Child Box"
      />

      {/* Master carton scanner modal */}
      <BarcodeScanner
        visible={cartonScannerOpen}
        onClose={() => setCartonScannerOpen(false)}
        onScan={handleScanCarton}
        expectedType="master"
        title="Scan a master carton"
      />

      {/* Customer picker modal */}
      <CustomerPicker
        visible={customerPickerOpen}
        onClose={() => setCustomerPickerOpen(false)}
        onPick={(c) => setSelectedCustomer(c)}
      />
    </KeyboardAvoidingView>
  );
}

// ─── Export (role-gated) ──────────────────────────────────────────────────────

export default function SamplesCreateScreen() {
  return (
    <RoleGate allow={['Admin', 'Supervisor']} fallback={<DeniedView />}>
      <SampleCreateScreen />
    </RoleGate>
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
    paddingBottom: 40,
  },
  deniedContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // Form card
  formCard: {
    marginBottom: 16,
    padding: 16,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  fieldLabelSpaced: {
    marginTop: 14,
  },
  textInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.surface,
  },
  multilineInput: {
    minHeight: 76,
    paddingTop: 10,
  },

  // Customer field
  customerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: COLORS.background,
    gap: 10,
  },
  customerCardInfo: {
    flex: 1,
    minWidth: 0,
  },
  customerFirmName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  customerAddress: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  changeLink: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  selectCustomerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    alignSelf: 'flex-start',
  },
  selectCustomerText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },

  // Scan card
  scanCard: {
    marginBottom: 20,
    padding: 16,
  },
  scanHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  clearAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.error,
  },
  cartonHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  scanBtn: {
    marginBottom: 12,
  },

  // Manual entry
  manualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  manualInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 13,
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    backgroundColor: COLORS.surface,
  },
  addBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 10 : 9,
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.surface,
  },

  // Scanned list
  scannedList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.borderLight,
  },
  scannedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  scannedRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderLight,
  },
  scannedIndex: {
    fontSize: 12,
    color: COLORS.textLight,
    width: 22,
    textAlign: 'right',
  },
  scannedInfo: {
    flex: 1,
    minWidth: 0,
  },
  scannedBarcode: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 2,
  },
  scannedMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  scannedLoading: {
    fontSize: 12,
    color: COLORS.textLight,
    fontStyle: 'italic',
  },
  trashBtn: {
    padding: 4,
  },

  // Submit
  submitBtn: {},

  // Customer picker modal
  pickerRoot: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  pickerTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderLight,
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
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.background,
    paddingHorizontal: 12,
  },
  pickerSearchIcon: {
    marginRight: 8,
  },
  pickerSearchInput: {
    flex: 1,
    height: 42,
    fontSize: 14,
    color: COLORS.text,
  },
  pickerCenterState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerHintText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  pickerListContent: {
    paddingBottom: 24,
  },
  pickerEmptyContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 40,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  pickerRowInfo: {
    flex: 1,
    minWidth: 0,
  },
  pickerFirmName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  pickerAddress: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  pickerSeparator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.borderLight,
    marginHorizontal: 16,
  },
});

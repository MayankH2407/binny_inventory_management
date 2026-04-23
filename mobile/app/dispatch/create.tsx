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
import { customerService } from '../../services/customer.service';
import { dispatchService } from '../../services/dispatch.service';
import { useApiMutation } from '../../hooks/useApi';
import RoleGate from '../../components/RoleGate';
import BarcodeScanner from '../../components/BarcodeScanner';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import Input from '../../components/ui/Input';
import type { Customer, MasterCarton, DispatchRecord, CreateDispatchRequest } from '../../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const CUSTOMER_PAGE_SIZE = 20;

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

  // ── State ────────────────────────────────────────────────────────────────────
  const [scannedCartons, setScannedCartons] = useState<MasterCarton[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [validating, setValidating] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [destination, setDestination] = useState('');
  const [transportDetails, setTransportDetails] = useState('');
  const [lrNumber, setLrNumber] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [notes, setNotes] = useState('');

  // ── Mutation ─────────────────────────────────────────────────────────────────

  const dispatchMutation = useApiMutation<DispatchRecord, CreateDispatchRequest>(
    (vars) => dispatchService.create(vars),
    {
      successMessage: 'Dispatch created.',
      invalidateKeys: [
        ['masterCartons'],
        ['dispatches'],
        ['childBoxes'],
        ['inventory-summary'],
        ['inventory-hierarchy'],
        ['dashboard-stats'],
      ],
      onSuccess: async () => {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace('/dispatch' as any);
      },
    }
  );

  // ── Scan handler ─────────────────────────────────────────────────────────────

  const handleScan = async (raw: string) => {
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

  // ── Remove handler ────────────────────────────────────────────────────────────

  const handleRemove = (barcode: string) => {
    setScannedCartons((prev) => prev.filter((c) => c.carton_barcode !== barcode));
  };

  // ── Submit ────────────────────────────────────────────────────────────────────

  function submit() {
    if (scannedCartons.length === 0) {
      Alert.alert('No cartons', 'Scan at least one carton to dispatch.');
      return;
    }
    if (!customer) {
      Alert.alert('Select customer', 'Pick a customer before dispatching.');
      return;
    }
    const payload: CreateDispatchRequest = {
      master_carton_ids: scannedCartons.map((c) => c.id),
      customer_id: customer.id,
      destination: destination.trim() || undefined,
      transport_details: transportDetails.trim() || undefined,
      lr_number: lrNumber.trim() || undefined,
      vehicle_number: vehicleNumber.trim() || undefined,
      notes: notes.trim() || undefined,
    };
    dispatchMutation.mutate(payload);
  }

  // ── Submit button label ───────────────────────────────────────────────────────

  const n = scannedCartons.length;
  const submitLabel =
    n === 0
      ? 'Dispatch Cartons'
      : `Dispatch ${n} Carton${n === 1 ? '' : 's'}`;

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
        {/* ── Cartons section ── */}
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
                    onPress={() => handleRemove(carton.carton_barcode)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="trash-outline" size={22} color={COLORS.error} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </Card>

        {/* ── Customer section ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Customer</Text>
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
          disabled={scannedCartons.length === 0 || !customer || dispatchMutation.isPending}
          loading={dispatchMutation.isPending}
          style={styles.submitBtn}
        />
      </ScrollView>

      {/* ── Scanner modal ── */}
      <BarcodeScanner
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
        expectedType="master"
        title="Scan Master Carton"
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

  // Scan button
  scanBtn: {
    marginBottom: 12,
  },

  // Scanned carton list card
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

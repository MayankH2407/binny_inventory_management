import { useState, useCallback } from 'react';
import {
  View,
  Text,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  FlatList,
  Platform,
  Alert,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { COLORS } from '../../constants';
import { customerService } from '../../services/customer.service';
import type { Customer, CreateCustomerRequest } from '../../types';
import { useApiMutation, useApiQuery } from '../../hooks/useApi';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import RoleGate from '../../components/RoleGate';

// ─── Denied fallback ──────────────────────────────────────────────────────────

function DeniedView() {
  return (
    <View style={styles.deniedContainer}>
      <EmptyState
        icon="lock-closed-outline"
        title="Not authorized"
        message="You don't have permission to create customers."
      />
    </View>
  );
}

// ─── Primary Dealer Picker Modal ──────────────────────────────────────────────

interface DealerPickerProps {
  visible: boolean;
  onClose: () => void;
  onPick: (dealer: Customer) => void;
  dealers: Customer[];
  loading: boolean;
}

function DealerPickerModal({ visible, onClose, onPick, dealers, loading }: DealerPickerProps) {
  const [filterText, setFilterText] = useState('');

  const filtered = filterText
    ? dealers.filter((d) =>
        d.firm_name.toLowerCase().includes(filterText.toLowerCase())
      )
    : dealers;

  const renderRow = useCallback(
    ({ item }: { item: Customer }) => (
      <TouchableOpacity
        style={styles.pickerRow}
        activeOpacity={0.7}
        onPress={() => {
          onPick(item);
          onClose();
          setFilterText('');
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
          <Text style={styles.pickerTitle}>Select Primary Dealer</Text>
          <TouchableOpacity
            onPress={() => { onClose(); setFilterText(''); }}
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
            placeholder="Filter dealers…"
            placeholderTextColor={COLORS.textLight}
            value={filterText}
            onChangeText={setFilterText}
            autoFocus
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>

        {/* List */}
        {loading ? (
          <View style={styles.pickerCenterState}>
            <Text style={styles.pickerHintText}>Loading…</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={renderRow}
            contentContainerStyle={
              filtered.length === 0 ? styles.pickerEmptyContainer : styles.pickerListContent
            }
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <EmptyState
                icon="person-outline"
                title="No primary dealers found"
                message={
                  filterText
                    ? `No results for "${filterText}".`
                    : 'No primary dealers available.'
                }
              />
            }
            ItemSeparatorComponent={() => <View style={styles.pickerSeparator} />}
          />
        )}
      </View>
    </Modal>
  );
}

// ─── Main create form ─────────────────────────────────────────────────────────

function NewCustomerScreen() {
  const [customerType, setCustomerType] = useState<'Primary Dealer' | 'Sub Dealer'>(
    'Primary Dealer'
  );
  const [firmName, setFirmName] = useState('');
  const [address, setAddress] = useState('');
  const [deliveryLocation, setDeliveryLocation] = useState('');
  const [gstin, setGstin] = useState('');
  const [privateMarka, setPrivateMarka] = useState('');
  const [gr, setGr] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactMobile, setContactMobile] = useState('');
  const [primaryDealerId, setPrimaryDealerId] = useState<string | null>(null);
  const [primaryDealerName, setPrimaryDealerName] = useState('');
  const [dealerPickerOpen, setDealerPickerOpen] = useState(false);

  // Validation errors
  const [firmNameError, setFirmNameError] = useState('');
  const [dealerError, setDealerError] = useState('');

  // Primary dealers query (cached 60 s)
  const dealersQuery = useApiQuery(
    ['primary-dealers'],
    () => customerService.getPrimaryDealers(),
    { staleTime: 60_000 }
  );

  // Create mutation
  const createMutation = useApiMutation<Customer, CreateCustomerRequest>(
    (vars) => customerService.create(vars),
    {
      successMessage: 'Customer created.',
      invalidateKeys: [['customers']],
      onSuccess: async (c) => {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace(`/customers/${c.id}` as any);
      },
    }
  );

  const handlePickDealer = (dealer: Customer) => {
    setPrimaryDealerId(dealer.id);
    setPrimaryDealerName(dealer.firm_name);
    setDealerError('');
  };

  const isSubDealer = customerType === 'Sub Dealer';
  const canSubmit =
    firmName.trim().length > 0 &&
    (!isSubDealer || !!primaryDealerId) &&
    !createMutation.isPending;

  const handleSubmit = () => {
    let valid = true;
    if (!firmName.trim()) {
      setFirmNameError('Firm name is required.');
      valid = false;
    } else {
      setFirmNameError('');
    }
    if (isSubDealer && !primaryDealerId) {
      setDealerError('Primary dealer is required for Sub Dealers.');
      valid = false;
    } else {
      setDealerError('');
    }
    if (!valid) return;

    const payload: CreateCustomerRequest = {
      firm_name: firmName.trim(),
      address: address.trim() || null,
      delivery_location: deliveryLocation.trim() || null,
      gstin: gstin.trim() || null,
      private_marka: privateMarka.trim() || null,
      gr: gr.trim() || null,
      contact_person_name: contactName.trim() || null,
      contact_person_mobile: contactMobile.trim() || null,
      customer_type: customerType,
      primary_dealer_id: isSubDealer ? primaryDealerId : null,
    };
    createMutation.mutate(payload);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'New Customer' }} />
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Customer type toggle ── */}
          <Text style={styles.sectionLabel}>Customer Type</Text>
          <View style={styles.typeToggleRow}>
            {(['Primary Dealer', 'Sub Dealer'] as const).map((t) => {
              const active = customerType === t;
              return (
                <TouchableOpacity
                  key={t}
                  style={[styles.typePill, active ? styles.typePillActive : styles.typePillInactive]}
                  onPress={() => {
                    setCustomerType(t);
                    // Clear dealer selection when switching away from Sub Dealer
                    if (t !== 'Sub Dealer') {
                      setPrimaryDealerId(null);
                      setPrimaryDealerName('');
                      setDealerError('');
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.typePillText,
                      active ? styles.typePillTextActive : styles.typePillTextInactive,
                    ]}
                  >
                    {t}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Primary dealer picker (Sub Dealer only) ── */}
          {isSubDealer && (
            <View style={styles.dealerPickerSection}>
              <Text style={styles.sectionLabel}>
                Primary Dealer <Text style={styles.required}>*</Text>
              </Text>
              <TouchableOpacity
                style={[styles.dealerPickerBtn, dealerError ? styles.dealerPickerBtnError : null]}
                onPress={() => setDealerPickerOpen(true)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.dealerPickerText,
                    !primaryDealerId && styles.dealerPickerPlaceholder,
                  ]}
                  numberOfLines={1}
                >
                  {primaryDealerId ? primaryDealerName : 'Tap to select primary dealer…'}
                </Text>
                <Ionicons name="chevron-down" size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>
              {!!dealerError && <Text style={styles.fieldError}>{dealerError}</Text>}
            </View>
          )}

          {/* ── Core fields ── */}
          <Input
            label="Firm name *"
            placeholder="e.g. Binny Footwear"
            value={firmName}
            onChangeText={(v) => { setFirmName(v); if (v.trim()) setFirmNameError(''); }}
            returnKeyType="next"
            error={firmNameError}
          />

          <Input
            label="Address"
            placeholder="Street, city…"
            value={address}
            onChangeText={setAddress}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            style={styles.multilineInput}
          />

          <Input
            label="Delivery location"
            placeholder="e.g. Delhi Warehouse"
            value={deliveryLocation}
            onChangeText={setDeliveryLocation}
            returnKeyType="next"
          />

          <Input
            label="GSTIN"
            placeholder="15-character GST number"
            value={gstin}
            onChangeText={setGstin}
            autoCapitalize="characters"
            maxLength={15}
            returnKeyType="next"
          />

          <Input
            label="Private marka"
            placeholder="Private marka / brand"
            value={privateMarka}
            onChangeText={setPrivateMarka}
            returnKeyType="next"
          />

          <Input
            label="GR number"
            placeholder="Goods receipt number"
            value={gr}
            onChangeText={setGr}
            returnKeyType="next"
          />

          <Input
            label="Contact person name"
            placeholder="e.g. Ramesh Kumar"
            value={contactName}
            onChangeText={setContactName}
            returnKeyType="next"
          />

          <Input
            label="Contact person mobile"
            placeholder="10-digit mobile number"
            value={contactMobile}
            onChangeText={setContactMobile}
            keyboardType="phone-pad"
            returnKeyType="done"
          />

          {/* ── Submit ── */}
          <Button
            title="Create Customer"
            onPress={handleSubmit}
            fullWidth
            disabled={!canSubmit}
            loading={createMutation.isPending}
            style={styles.submitBtn}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      <DealerPickerModal
        visible={dealerPickerOpen}
        onClose={() => setDealerPickerOpen(false)}
        onPick={handlePickDealer}
        dealers={dealersQuery.data ?? []}
        loading={dealersQuery.isLoading}
      />
    </>
  );
}

// ─── Export (role-gated) ──────────────────────────────────────────────────────

export default function NewCustomerScreenGated() {
  return (
    <RoleGate allow={['Admin', 'Supervisor']} fallback={<DeniedView />}>
      <NewCustomerScreen />
    </RoleGate>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  kav: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  deniedContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },

  // Section label
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
    marginTop: 4,
  },
  required: {
    color: COLORS.error,
  },

  // Type toggle
  typeToggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  typePill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 20,
    alignItems: 'center',
  },
  typePillActive: {
    backgroundColor: COLORS.primary,
  },
  typePillInactive: {
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  typePillText: {
    fontSize: 14,
    fontWeight: '600',
  },
  typePillTextActive: {
    color: COLORS.surface,
  },
  typePillTextInactive: {
    color: COLORS.textSecondary,
  },

  // Primary dealer picker button
  dealerPickerSection: {
    marginBottom: 16,
  },
  dealerPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: COLORS.surface,
  },
  dealerPickerBtnError: {
    borderColor: COLORS.error,
  },
  dealerPickerText: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
  },
  dealerPickerPlaceholder: {
    color: COLORS.textLight,
  },
  fieldError: {
    fontSize: 12,
    color: COLORS.error,
    marginTop: 4,
  },

  // Multiline input
  multilineInput: {
    minHeight: 80,
    paddingTop: 12,
  },

  // Submit
  submitBtn: {
    marginTop: 8,
  },

  // ── Dealer picker modal ────────────────────────────────────────────────────
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

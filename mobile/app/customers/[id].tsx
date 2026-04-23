import { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants';
import { customerService } from '../../services/customer.service';
import type { Customer, CreateCustomerRequest } from '../../types';
import { useApiQuery, useApiMutation } from '../../hooks/useApi';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import Spinner from '../../components/ui/Spinner';
import RoleGate from '../../components/RoleGate';

// ─── Denied fallback ──────────────────────────────────────────────────────────

function DeniedView() {
  return (
    <View style={styles.deniedContainer}>
      <EmptyState
        icon="lock-closed-outline"
        title="Not authorized"
        message="You don't have permission to view customers."
      />
    </View>
  );
}

// ─── SummaryRow ───────────────────────────────────────────────────────────────

function SummaryRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
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
        <View style={styles.pickerTopBar}>
          <Text style={styles.pickerTitle}>Select Primary Dealer</Text>
          <TouchableOpacity
            onPress={() => { onClose(); setFilterText(''); }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={26} color={COLORS.text} />
          </TouchableOpacity>
        </View>

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

// ─── Main screen ──────────────────────────────────────────────────────────────

function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [isEditing, setIsEditing] = useState(false);
  const [dealerPickerOpen, setDealerPickerOpen] = useState(false);

  // Form state (mirrors CreateCustomerRequest fields)
  const [customerType, setCustomerType] = useState<'Primary Dealer' | 'Sub Dealer'>('Primary Dealer');
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

  // Validation errors
  const [firmNameError, setFirmNameError] = useState('');
  const [dealerError, setDealerError] = useState('');

  // Customer data query
  const customerQuery = useApiQuery(
    ['customer', id ?? ''],
    () => customerService.getById(id!),
    { enabled: !!id }
  );
  const customer = customerQuery.data;

  // Primary dealers query (for edit mode picker)
  const dealersQuery = useApiQuery(
    ['primary-dealers'],
    () => customerService.getPrimaryDealers(),
    { staleTime: 60_000 }
  );

  // Sync form when customer data loads
  useEffect(() => {
    if (customer) {
      setCustomerType(customer.customer_type);
      setFirmName(customer.firm_name);
      setAddress(customer.address ?? '');
      setDeliveryLocation(customer.delivery_location ?? '');
      setGstin(customer.gstin ?? '');
      setPrivateMarka(customer.private_marka ?? '');
      setGr(customer.gr ?? '');
      setContactName(customer.contact_person_name ?? '');
      setContactMobile(customer.contact_person_mobile ?? '');
      setPrimaryDealerId(customer.primary_dealer_id ?? null);
      setPrimaryDealerName(customer.primary_dealer_name ?? '');
    }
  }, [customer]);

  // Update mutation
  const updateMutation = useApiMutation<Customer, Partial<CreateCustomerRequest>>(
    (vars) => customerService.update(id!, vars),
    {
      successMessage: 'Customer updated.',
      invalidateKeys: [['customers'], ['customer', id ?? '']],
      onSuccess: () => setIsEditing(false),
    }
  );

  const handleCancelEdit = () => {
    // Reset form to original customer data
    if (customer) {
      setCustomerType(customer.customer_type);
      setFirmName(customer.firm_name);
      setAddress(customer.address ?? '');
      setDeliveryLocation(customer.delivery_location ?? '');
      setGstin(customer.gstin ?? '');
      setPrivateMarka(customer.private_marka ?? '');
      setGr(customer.gr ?? '');
      setContactName(customer.contact_person_name ?? '');
      setContactMobile(customer.contact_person_mobile ?? '');
      setPrimaryDealerId(customer.primary_dealer_id ?? null);
      setPrimaryDealerName(customer.primary_dealer_name ?? '');
    }
    setFirmNameError('');
    setDealerError('');
    setIsEditing(false);
  };

  const handlePickDealer = (dealer: Customer) => {
    setPrimaryDealerId(dealer.id);
    setPrimaryDealerName(dealer.firm_name);
    setDealerError('');
  };

  const isSubDealer = customerType === 'Sub Dealer';

  const handleSave = () => {
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

    const payload: Partial<CreateCustomerRequest> = {
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
    updateMutation.mutate(payload);
  };

  // ── Loading / error states ───────────────────────────────────────────────

  if (customerQuery.isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Customer' }} />
        <View style={styles.centered}>
          <Spinner />
        </View>
      </>
    );
  }

  if (!customer) {
    return (
      <>
        <Stack.Screen options={{ title: 'Customer' }} />
        <View style={styles.centered}>
          <EmptyState
            icon="person-outline"
            title="Customer not found"
            message="This customer may have been deleted."
          />
        </View>
      </>
    );
  }

  const isPrimary = customer.customer_type === 'Primary Dealer';
  const badgeColor = isPrimary ? COLORS.info : COLORS.textSecondary;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <Stack.Screen
        options={{
          title: isEditing ? 'Edit Customer' : (customer.firm_name ?? 'Customer'),
        }}
      />
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Edit / Save / Cancel action buttons ── */}
          <Card style={styles.actionCard}>
            {!isEditing ? (
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => setIsEditing(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="create-outline" size={18} color={COLORS.primary} />
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.editActionsRow}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={handleCancelEdit}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.saveBtn,
                    (!firmName.trim() || (isSubDealer && !primaryDealerId) || updateMutation.isPending)
                      ? styles.saveBtnDisabled
                      : null,
                  ]}
                  onPress={handleSave}
                  disabled={
                    !firmName.trim() ||
                    (isSubDealer && !primaryDealerId) ||
                    updateMutation.isPending
                  }
                  activeOpacity={0.7}
                >
                  {updateMutation.isPending ? (
                    <Text style={styles.saveBtnText}>Saving…</Text>
                  ) : (
                    <Text style={styles.saveBtnText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </Card>

          {/* ── View mode ── */}
          {!isEditing && (
            <Card style={styles.detailCard}>
              {/* Header row: firm name + type badge */}
              <View style={styles.detailHeader}>
                <Text style={styles.detailFirmName}>{customer.firm_name}</Text>
                <Badge label={customer.customer_type} color={badgeColor} />
              </View>

              {!customer.is_active && (
                <View style={styles.inactiveRow}>
                  <Text style={styles.inactiveBadge}>Inactive</Text>
                </View>
              )}

              <View style={styles.divider} />

              <SummaryRow label="Address" value={customer.address} />
              <SummaryRow label="Delivery location" value={customer.delivery_location} />
              <SummaryRow label="GSTIN" value={customer.gstin} />
              <SummaryRow label="Private marka" value={customer.private_marka} />
              <SummaryRow label="GR number" value={customer.gr} />
              <SummaryRow label="Contact person" value={customer.contact_person_name} />
              <SummaryRow label="Mobile" value={customer.contact_person_mobile} />
              {customer.customer_type === 'Sub Dealer' && (
                <SummaryRow
                  label="Primary dealer"
                  value={customer.primary_dealer_name ?? customer.primary_dealer_id}
                />
              )}
            </Card>
          )}

          {/* ── Edit mode ── */}
          {isEditing && (
            <>
              {/* Type toggle */}
              <Text style={styles.sectionLabel}>Customer Type</Text>
              <View style={styles.typeToggleRow}>
                {(['Primary Dealer', 'Sub Dealer'] as const).map((t) => {
                  const active = customerType === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[
                        styles.typePill,
                        active ? styles.typePillActive : styles.typePillInactive,
                      ]}
                      onPress={() => {
                        setCustomerType(t);
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

              {/* Primary dealer picker (Sub Dealer only) */}
              {isSubDealer && (
                <View style={styles.dealerPickerSection}>
                  <Text style={styles.sectionLabel}>
                    Primary Dealer <Text style={styles.required}>*</Text>
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.dealerPickerBtn,
                      dealerError ? styles.dealerPickerBtnError : null,
                    ]}
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
                      {primaryDealerId
                        ? primaryDealerName
                        : 'Tap to select primary dealer…'}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color={COLORS.textSecondary} />
                  </TouchableOpacity>
                  {!!dealerError && <Text style={styles.fieldError}>{dealerError}</Text>}
                </View>
              )}

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
            </>
          )}
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

export default function CustomerDetailScreenGated() {
  return (
    <RoleGate allow={['Admin', 'Supervisor']} fallback={<DeniedView />}>
      <CustomerDetailScreen />
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
  centered: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 16,
    paddingBottom: 48,
  },

  // Action bar card
  actionCard: {
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  editBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.primary,
  },
  editActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  saveBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.surface,
  },

  // Detail card (view mode)
  detailCard: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  detailFirmName: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginRight: 10,
  },
  inactiveRow: {
    marginBottom: 8,
    alignSelf: 'flex-end',
  },
  inactiveBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.error,
    backgroundColor: COLORS.error + '18',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    overflow: 'hidden',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.borderLight,
    marginVertical: 12,
  },

  // SummaryRow
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 12,
  },
  summaryLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    flexShrink: 0,
    minWidth: 110,
  },
  summaryValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'right',
  },

  // Edit mode section
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

  // Dealer picker button
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
  multilineInput: {
    minHeight: 80,
    paddingTop: 12,
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

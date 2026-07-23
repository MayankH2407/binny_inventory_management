import { useState, useCallback } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
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

import { COLORS } from '../../constants';
import { parseQRCode } from '../../utils';
import { childBoxService } from '../../services/childBox.service';
import { ecommerceService } from '../../services/ecommerce.service';
import { masterCartonService } from '../../services/masterCarton.service';
import { useApiMutation } from '../../hooks/useApi';
import RoleGate from '../../components/RoleGate';
import BarcodeScanner from '../../components/BarcodeScanner';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import type { ChildBoxWithProduct, EcommerceRecord, MasterCarton } from '../../types';

// ─── Denied fallback ──────────────────────────────────────────────────────────

function DeniedView() {
  return (
    <View style={styles.deniedContainer}>
      <EmptyState
        icon="lock-closed-outline"
        title="Not authorized"
        message="You don't have permission to create e-commerce records."
      />
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

function EcommerceCreateScreen() {
  const router = useRouter();

  // ── Form state ───────────────────────────────────────────────────────────────
  const [name, setName] = useState('');
  const [marketplace, setMarketplace] = useState('');
  const [orderReference, setOrderReference] = useState('');
  const [listingSku, setListingSku] = useState('');
  const [mappedDate, setMappedDate] = useState(
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
  const createMutation = useApiMutation<EcommerceRecord, Parameters<typeof ecommerceService.create>[0]>(
    (vars) => ecommerceService.create(vars),
    {
      successMessage: 'E-commerce record created successfully.',
      invalidateKeys: [
        ['ecommerce'],
        ['childBoxes'],
        ['inventory-summary'],
        ['inventory-hierarchy'],
        ['dashboard-stats'],
      ],
      onSuccess: (created) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace(`/ecommerce/${created.id}` as any);
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
      Alert.alert('Validation', 'Name is required.');
      return;
    }
    if (scannedBarcodes.length === 0 && scannedCartons.length === 0) {
      Alert.alert('Validation', 'Scan at least one child box or master carton before creating the record.');
      return;
    }

    createMutation.mutate({
      name: name.trim(),
      marketplace: marketplace.trim() || null,
      order_reference: orderReference.trim() || null,
      listing_sku: listingSku.trim() || null,
      mapped_date: mappedDate || null,
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
      <Stack.Screen options={{ title: 'Create E-commerce Record' }} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* ── Form fields ──────────────────────────────────────────────────── */}
        <Card style={styles.formCard}>
          {/* Name */}
          <Text style={styles.fieldLabel}>Name *</Text>
          <TextInput
            style={styles.textInput}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Amazon Spring Sale 2026"
            placeholderTextColor={COLORS.textLight}
            autoCorrect={false}
          />

          {/* Marketplace */}
          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Marketplace (optional)</Text>
          <TextInput
            style={styles.textInput}
            value={marketplace}
            onChangeText={setMarketplace}
            placeholder="e.g. Amazon, Flipkart, Meesho"
            placeholderTextColor={COLORS.textLight}
            autoCorrect={false}
            autoCapitalize="words"
          />

          {/* Order Reference */}
          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Order Reference (optional)</Text>
          <TextInput
            style={styles.textInput}
            value={orderReference}
            onChangeText={setOrderReference}
            placeholder="e.g. ORD-12345"
            placeholderTextColor={COLORS.textLight}
            autoCorrect={false}
            autoCapitalize="none"
          />

          {/* Listing SKU */}
          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Listing SKU (optional)</Text>
          <TextInput
            style={styles.textInput}
            value={listingSku}
            onChangeText={setListingSku}
            placeholder="e.g. BNY-AMZ-001"
            placeholderTextColor={COLORS.textLight}
            autoCorrect={false}
            autoCapitalize="characters"
          />

          {/* Mapped Date */}
          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Mapped Date (optional)</Text>
          <TextInput
            style={styles.textInput}
            value={mappedDate}
            onChangeText={setMappedDate}
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
          title={`Create Record (${scannedBarcodes.length} boxes${scannedCartons.length > 0 ? ` + ${scannedCartons.length} carton${scannedCartons.length !== 1 ? 's' : ''}` : ''})`}
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
    </KeyboardAvoidingView>
  );
}

// ─── Export (role-gated) ──────────────────────────────────────────────────────

export default function EcommerceCreateScreenExport() {
  return (
    <RoleGate allow={['Admin', 'Supervisor']} fallback={<DeniedView />}>
      <EcommerceCreateScreen />
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
});

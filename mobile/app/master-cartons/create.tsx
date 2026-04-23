import { useState } from 'react';
import {
  Alert,
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
import { masterCartonService } from '../../services/masterCarton.service';
import { useApiMutation } from '../../hooks/useApi';
import RoleGate from '../../components/RoleGate';
import BarcodeScanner from '../../components/BarcodeScanner';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import EmptyState from '../../components/ui/EmptyState';
import type { ChildBoxWithProduct, MasterCarton, CreateMasterCartonRequest } from '../../types';

// ─── Denied fallback ──────────────────────────────────────────────────────────

function DeniedView() {
  return (
    <View style={styles.deniedContainer}>
      <EmptyState
        icon="lock-closed-outline"
        title="Not authorized"
        message="You don't have permission to pack cartons."
      />
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

function PackCartonScreen() {
  const router = useRouter();

  const [maxCapacity, setMaxCapacity] = useState(12);
  const [scanned, setScanned] = useState<ChildBoxWithProduct[]>([]);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [validating, setValidating] = useState(false);
  const [capacityText, setCapacityText] = useState('12');

  // ── Mutation ────────────────────────────────────────────────────────────────

  const createMutation = useApiMutation<MasterCarton, CreateMasterCartonRequest>(
    (vars) => masterCartonService.create(vars),
    {
      successMessage: 'Carton created',
      invalidateKeys: [
        ['masterCartons'],
        ['childBoxes'],
        ['inventory-summary'],
        ['inventory-hierarchy'],
        ['dashboard-stats'],
      ],
      onSuccess: (carton) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace(`/master-cartons/${carton.id}` as any);
      },
    }
  );

  // ── Capacity stepper ────────────────────────────────────────────────────────

  const minCapacity = Math.max(1, scanned.length);

  const adjustCapacity = (delta: number) => {
    const next = Math.min(99, Math.max(minCapacity, maxCapacity + delta));
    setMaxCapacity(next);
    setCapacityText(String(next));
  };

  const handleCapacityBlur = () => {
    const parsed = parseInt(capacityText, 10);
    if (isNaN(parsed)) {
      setMaxCapacity(minCapacity);
      setCapacityText(String(minCapacity));
    } else {
      const clamped = Math.min(99, Math.max(minCapacity, parsed));
      setMaxCapacity(clamped);
      setCapacityText(String(clamped));
    }
  };

  // ── Scan handler ────────────────────────────────────────────────────────────

  const handleScan = async (barcode: string) => {
    const parsed = parseQRCode(barcode);
    const code = parsed.type === 'child' ? parsed.id : barcode.trim().toUpperCase();

    if (scanned.some((b) => b.barcode === code)) {
      Alert.alert('Already scanned', `${code} is already in the list.`);
      return;
    }

    if (scanned.length >= maxCapacity) {
      Alert.alert(
        'Capacity reached',
        `Carton capacity is ${maxCapacity}. Increase it or create the carton first.`
      );
      return;
    }

    setValidating(true);
    try {
      const box = await childBoxService.getByBarcode(code);
      if (box.status !== 'FREE') {
        Alert.alert(
          'Box not available',
          `This box is ${box.status}. Only FREE boxes can be packed.`
        );
        return;
      }
      setScanned((prev) => [...prev, box]);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Box not found';
      Alert.alert('Scan failed', msg);
    } finally {
      setValidating(false);
    }
  };

  // ── Remove handler ──────────────────────────────────────────────────────────

  const handleRemove = (barcode: string) => {
    setScanned((prev) => prev.filter((b) => b.barcode !== barcode));
  };

  // ── Progress bar ────────────────────────────────────────────────────────────

  const progressRatio = maxCapacity > 0 ? Math.min(scanned.length / maxCapacity, 1) : 0;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Pack Carton' }} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Capacity card */}
        <Card style={styles.capacityCard}>
          <Text style={styles.capacityLabel}>Capacity</Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => adjustCapacity(-1)}
              activeOpacity={0.7}
            >
              <Ionicons name="remove" size={20} color={COLORS.primary} />
            </TouchableOpacity>
            <TextInput
              style={styles.capacityInput}
              keyboardType="number-pad"
              value={capacityText}
              onChangeText={setCapacityText}
              onBlur={handleCapacityBlur}
              selectTextOnFocus
            />
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => adjustCapacity(1)}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={20} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
        </Card>

        {/* Counter + progress */}
        <View style={styles.counterRow}>
          <Text style={styles.counterText}>
            {scanned.length} of {maxCapacity} scanned
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressRatio * 100}%` }]} />
        </View>

        {/* Scan button */}
        <Button
          title={validating ? 'Validating…' : 'Scan Child Box'}
          onPress={() => setScannerOpen(true)}
          icon={<Ionicons name="qr-code-outline" size={18} color={COLORS.surface} />}
          fullWidth
          disabled={scanned.length >= maxCapacity || validating}
          style={styles.scanBtn}
        />

        {/* Scanned boxes list */}
        <Card style={styles.listCard}>
          {scanned.length === 0 ? (
            <EmptyState
              icon="cube-outline"
              title="No boxes scanned yet"
              message="Tap Scan Child Box to begin."
            />
          ) : (
            <View>
              {scanned.map((box, idx) => (
                <View
                  key={box.barcode}
                  style={[styles.boxRow, idx < scanned.length - 1 && styles.boxRowBorder]}
                >
                  <View style={styles.boxInfo}>
                    <Text style={styles.boxBarcode}>{box.barcode}</Text>
                    <Text style={styles.boxMeta} numberOfLines={1}>
                      {box.article_name} · {box.colour} · {box.size}
                    </Text>
                    <Text style={styles.boxSku}>
                      {box.sku} · ₹{Number(box.mrp).toFixed(2)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.trashBtn}
                    onPress={() => handleRemove(box.barcode)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="trash-outline" size={22} color={COLORS.error} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </Card>

        {/* Submit button — bottom of scroll content */}
        <Button
          title={`Create Carton${scanned.length > 0 ? ` (${scanned.length})` : ''}`}
          onPress={() =>
            createMutation.mutate({
              max_capacity: maxCapacity,
              child_box_barcodes: scanned.map((b) => b.barcode),
            })
          }
          icon={<Ionicons name="checkmark-circle-outline" size={18} color={COLORS.surface} />}
          fullWidth
          disabled={scanned.length === 0 || createMutation.isPending}
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
    </KeyboardAvoidingView>
  );
}

// ─── Export (role-gated) ──────────────────────────────────────────────────────

export default function MasterCartonsCreateScreen() {
  return (
    <RoleGate
      allow={['Admin', 'Supervisor', 'Warehouse Operator']}
      fallback={<DeniedView />}
    >
      <PackCartonScreen />
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
    paddingBottom: 40,
  },
  deniedContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  // Capacity card
  capacityCard: {
    marginBottom: 14,
  },
  capacityLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  stepperBtn: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  capacityInput: {
    width: 72,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
  },

  // Counter + progress
  counterRow: {
    marginBottom: 6,
  },
  counterText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  progressTrack: {
    width: '100%',
    height: 4,
    backgroundColor: COLORS.borderLight,
    borderRadius: 2,
    marginBottom: 14,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    backgroundColor: COLORS.primary,
    borderRadius: 2,
  },

  // Scan button
  scanBtn: {
    marginBottom: 16,
  },

  // Scanned list card
  listCard: {
    marginBottom: 20,
    minHeight: 120,
  },
  boxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 10,
  },
  boxRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  boxInfo: {
    flex: 1,
    minWidth: 0,
  },
  boxBarcode: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 2,
  },
  boxMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 1,
  },
  boxSku: {
    fontSize: 11,
    color: COLORS.textLight,
  },
  trashBtn: {
    padding: 4,
  },

  // Submit button
  submitBtn: {
    // rendered inside ScrollView content — no absolute positioning needed
  },
});

import { useState, useEffect } from 'react';
import {
  Alert,
  BackHandler,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { COLORS } from '../constants';
import { masterCartonService } from '../services/masterCarton.service';
import type { MasterCarton, ChildBoxWithProduct } from '../types';
import { useApiMutation } from '../hooks/useApi';
import { parseQRCode } from '../utils';

import BarcodeScanner from '../components/BarcodeScanner';
import RoleGate from '../components/RoleGate';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import EmptyState from '../components/ui/EmptyState';

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4;

// ─── Denied fallback ──────────────────────────────────────────────────────────

function DeniedView() {
  return (
    <EmptyState
      icon="lock-closed-outline"
      title="Not authorized"
      message="You do not have permission to repack cartons."
    />
  );
}

// ─── Stepper ─────────────────────────────────────────────────────────────────

const STEP_LABELS: Record<Step, string> = {
  1: 'Source',
  2: 'Select',
  3: 'Destination',
  4: 'Confirm',
};

interface StepperProps {
  current: Step;
  onPressStep: (s: Step) => void;
}

function Stepper({ current, onPressStep }: StepperProps) {
  const steps: Step[] = [1, 2, 3, 4];
  return (
    <View style={stepperStyles.wrapper}>
      {steps.map((s, idx) => {
        const isPast = s < current;
        const isCurrent = s === current;
        return (
          <View key={s} style={stepperStyles.stepWrapper}>
            {/* Connector line before each step except first */}
            {idx > 0 && (
              <View
                style={[
                  stepperStyles.connector,
                  isPast || isCurrent ? stepperStyles.connectorActive : stepperStyles.connectorInactive,
                ]}
              />
            )}
            <TouchableOpacity
              onPress={() => isPast && onPressStep(s)}
              activeOpacity={isPast ? 0.7 : 1}
              style={[
                stepperStyles.dot,
                isCurrent && stepperStyles.dotCurrent,
                isPast && stepperStyles.dotPast,
                !isCurrent && !isPast && stepperStyles.dotFuture,
              ]}
            >
              {isPast ? (
                <Ionicons name="checkmark" size={13} color={COLORS.surface} />
              ) : (
                <Text style={[stepperStyles.dotLabel, isCurrent && stepperStyles.dotLabelCurrent]}>
                  {s}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        );
      })}
      {/* Labels row */}
      <View style={stepperStyles.labelsRow}>
        {steps.map((s) => (
          <Text
            key={s}
            style={[
              stepperStyles.label,
              s === current && stepperStyles.labelCurrent,
              s < current && stepperStyles.labelPast,
            ]}
            numberOfLines={1}
          >
            {STEP_LABELS[s]}
          </Text>
        ))}
      </View>
    </View>
  );
}

const stepperStyles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 4,
    backgroundColor: COLORS.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    position: 'relative',
  },
  stepWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  connector: {
    position: 'absolute',
    left: 0,
    right: '50%',
    height: 2,
    top: 13,
    zIndex: 0,
  },
  connectorActive: {
    backgroundColor: COLORS.primary,
  },
  connectorInactive: {
    backgroundColor: COLORS.border,
  },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  dotCurrent: {
    backgroundColor: COLORS.primary,
  },
  dotPast: {
    backgroundColor: COLORS.primary,
  },
  dotFuture: {
    backgroundColor: COLORS.surface,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  dotLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
  },
  dotLabelCurrent: {
    color: COLORS.surface,
  },
  labelsRow: {
    position: 'absolute',
    bottom: -18,
    left: 0,
    right: 0,
    flexDirection: 'row',
  },
  label: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    color: COLORS.textLight,
    fontWeight: '500',
  },
  labelCurrent: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  labelPast: {
    color: COLORS.textSecondary,
  },
});

// ─── CartonInfoCard ───────────────────────────────────────────────────────────

function CartonInfoCard({ carton, compact = false }: { carton: MasterCarton; compact?: boolean }) {
  return (
    <Card style={compact ? styles.infoCardCompact : styles.infoCard}>
      <View style={styles.cardHeaderRow}>
        <Text style={[styles.barcodeText, compact && styles.barcodeTextSm]} numberOfLines={1}>
          {carton.carton_barcode}
        </Text>
        <Badge label={carton.status} type="carton" />
      </View>
      {!compact && (
        <>
          <SummaryRow label="Boxes" value={String(carton.child_count)} />
          <SummaryRow label="Capacity" value={String(carton.max_capacity)} />
          {!!carton.article_summary && (
            <SummaryRow label="Article" value={carton.article_summary} />
          )}
        </>
      )}
      {compact && (
        <Text style={styles.compactMeta}>
          {carton.child_count} / {carton.max_capacity} boxes
        </Text>
      )}
    </Card>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

// ─── BoxRow ───────────────────────────────────────────────────────────────────

interface BoxRowProps {
  box: ChildBoxWithProduct;
  selected: boolean;
  onToggle: () => void;
  isLast: boolean;
}

function BoxRow({ box, selected, onToggle, isLast }: BoxRowProps) {
  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.7}
      style={[
        styles.boxRow,
        selected && styles.boxRowSelected,
        !isLast && styles.boxRowBorder,
      ]}
    >
      <Ionicons
        name={selected ? 'checkbox' : 'square-outline'}
        size={22}
        color={selected ? COLORS.primary : COLORS.textLight}
        style={styles.checkboxIcon}
      />
      <View style={styles.boxInfo}>
        <Text style={styles.boxBarcode}>{box.barcode}</Text>
        <Text style={styles.boxMeta} numberOfLines={1}>
          {box.article_name} · {box.colour} · {box.size}
        </Text>
        <Text style={styles.boxSku}>
          {box.sku} · ₹{Number(box.mrp).toFixed(2)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

function RepackFlow() {
  const [step, setStep] = useState<Step>(1);
  const [sourceCarton, setSourceCarton] = useState<MasterCarton | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set()); // barcodes
  const [destCarton, setDestCarton] = useState<MasterCarton | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerTarget, setScannerTarget] = useState<'source' | 'dest'>('source');
  const [loading, setLoading] = useState(false);
  const [expandBarcodes, setExpandBarcodes] = useState(false);

  // ── Android hardware back ─────────────────────────────────────────────────

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const hasProgress =
      sourceCarton !== null || selected.size > 0 || destCarton !== null;
    if (!hasProgress) return;

    const handler = () => {
      Alert.alert(
        'Cancel repack?',
        'You have unsaved progress. Cancel and go back?',
        [
          { text: 'Stay', style: 'cancel', onPress: () => {} },
          {
            text: 'Cancel repack',
            style: 'destructive',
            onPress: () => {
              resetAll();
            },
          },
        ],
      );
      return true; // consume the event
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', handler);
    return () => sub.remove();
  }, [sourceCarton, selected, destCarton]);

  // ── State helpers ─────────────────────────────────────────────────────────

  function resetAll() {
    setSourceCarton(null);
    setSelected(new Set());
    setDestCarton(null);
    setStep(1);
    setExpandBarcodes(false);
  }

  function goToStep(s: Step) {
    // Navigating backward clears forward state
    if (s < step) {
      if (s <= 1) {
        setSourceCarton(null);
        setSelected(new Set());
        setDestCarton(null);
      } else if (s <= 2) {
        setDestCarton(null);
        setSelected(new Set());
      } else if (s <= 3) {
        setDestCarton(null);
      }
    }
    setStep(s);
  }

  // ── Mutation ─────────────────────────────────────────────────────────────

  const repackMutation = useApiMutation<
    void,
    { source_carton_id: string; destination_carton_id: string; child_box_barcodes: string[] }
  >(
    (vars) => masterCartonService.repack(vars),
    {
      successMessage: 'Boxes moved successfully.',
      invalidateKeys: [
        ['masterCartons'],
        ['masterCarton'],
        ['childBoxes'],
        ['inventory-summary'],
        ['inventory-hierarchy'],
        ['dashboard-stats'],
      ],
      onSuccess: async () => {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        resetAll();
      },
    },
  );

  // ── Scan handler ──────────────────────────────────────────────────────────

  const handleScan = async (raw: string) => {
    const parsed = parseQRCode(raw);
    const code = parsed.type === 'master' ? parsed.id : raw.trim().toUpperCase();

    if (scannerTarget === 'source') {
      setLoading(true);
      try {
        // getByBarcode may return stub without child_boxes; always follow up with getById
        const stub = await masterCartonService.getByBarcode(code);

        // Status validation
        if (stub.status === 'DISPATCHED') {
          Alert.alert('Cannot repack', 'Cannot repack a dispatched carton.');
          return;
        }
        if (stub.status === 'CREATED' || stub.child_count === 0) {
          Alert.alert('Cannot repack', 'Source carton is empty.');
          return;
        }

        // Fetch full carton to populate child_boxes
        const full = await masterCartonService.getById(stub.id);
        const boxes = full.child_boxes ?? [];
        if (boxes.length === 0) {
          Alert.alert('Cannot repack', 'Source carton has no child boxes.');
          return;
        }

        setSourceCarton(full);
        setSelected(new Set());
        setDestCarton(null);
        setStep(2);
      } catch (err: unknown) {
        const e = err as { response?: { data?: { message?: string } }; message?: string };
        const msg = e?.response?.data?.message ?? e?.message ?? 'Carton not found';
        Alert.alert('Scan failed', msg);
      } finally {
        setLoading(false);
      }
    } else {
      // dest target
      if (!sourceCarton) return;
      setLoading(true);
      try {
        const c = await masterCartonService.getByBarcode(code);

        if (c.id === sourceCarton.id) {
          Alert.alert('Invalid destination', 'Source and destination cannot be the same carton.');
          return;
        }
        if (c.status === 'CLOSED') {
          Alert.alert(
            'Destination closed',
            'Destination carton is closed. Reopen or choose another.',
          );
          return;
        }
        if (c.status === 'DISPATCHED') {
          Alert.alert('Invalid destination', 'Destination carton has been dispatched.');
          return;
        }

        const space = c.max_capacity - c.child_count;
        if (selected.size > space) {
          Alert.alert(
            'Not enough space',
            `Destination has space for ${space} more box${space !== 1 ? 'es' : ''}; you selected ${selected.size}. Reduce selection or pick another carton.`,
          );
          return;
        }

        setDestCarton(c);
        setStep(4);
      } catch (err: unknown) {
        const e = err as { response?: { data?: { message?: string } }; message?: string };
        const msg = e?.response?.data?.message ?? e?.message ?? 'Carton not found';
        Alert.alert('Scan failed', msg);
      } finally {
        setLoading(false);
      }
    }
  };

  // ── Commit handler ────────────────────────────────────────────────────────

  function confirmCommit() {
    if (!sourceCarton || !destCarton) return;
    const n = selected.size;
    Alert.alert(
      'Confirm repack',
      `Move ${n} box${n !== 1 ? 'es' : ''} from ${sourceCarton.carton_barcode} to ${destCarton.carton_barcode}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Move boxes',
          style: 'destructive',
          onPress: () => {
            repackMutation.mutate({
              source_carton_id: sourceCarton.id,
              destination_carton_id: destCarton.id,
              child_box_barcodes: Array.from(selected),
            });
          },
        },
      ],
    );
  }

  // ── Select all / clear ────────────────────────────────────────────────────

  const boxes: ChildBoxWithProduct[] = sourceCarton?.child_boxes ?? [];
  const allSelected = boxes.length > 0 && selected.size === boxes.length;

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(boxes.map((b) => b.barcode)));
    }
  }

  function toggleBox(barcode: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(barcode)) {
        next.delete(barcode);
      } else {
        next.add(barcode);
      }
      return next;
    });
  }

  // ── Render steps ──────────────────────────────────────────────────────────

  function renderStep1() {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.stepContent}
        keyboardShouldPersistTaps="handled"
      >
        <Card style={styles.scanCard}>
          <Button
            title="Scan Source Carton"
            onPress={() => {
              setScannerTarget('source');
              setScannerOpen(true);
            }}
            icon={<Ionicons name="qr-code-outline" size={20} color={COLORS.surface} />}
            fullWidth
          />
          <Text style={styles.scanHint}>
            Scan an ACTIVE or CLOSED master carton to select boxes from.
          </Text>
        </Card>
        {loading && (
          <View style={styles.spinnerRow}>
            <Spinner size="small" />
          </View>
        )}
      </ScrollView>
    );
  }

  function renderStep2() {
    if (!sourceCarton) return null;
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.stepContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Source summary (compact) */}
        <CartonInfoCard carton={sourceCarton} compact />

        {/* Select all / clear */}
        <View style={styles.selectControlRow}>
          <Text style={styles.selectionCount}>
            {selected.size} of {boxes.length} selected
          </Text>
          <TouchableOpacity onPress={toggleSelectAll} activeOpacity={0.7}>
            <Text style={styles.selectToggleText}>
              {allSelected ? 'Clear all' : 'Select all'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Box list */}
        <Card padded={false} style={styles.listCard}>
          {boxes.length === 0 ? (
            <EmptyState icon="cube-outline" title="No boxes" message="Source carton is empty." />
          ) : (
            boxes.map((box, idx) => (
              <BoxRow
                key={box.id}
                box={box}
                selected={selected.has(box.barcode)}
                onToggle={() => toggleBox(box.barcode)}
                isLast={idx === boxes.length - 1}
              />
            ))
          )}
        </Card>

        {/* Footer buttons */}
        <View style={styles.footerRow}>
          <Button
            title="Back"
            variant="outline"
            onPress={() => goToStep(1)}
            style={styles.backBtn}
          />
          <Button
            title={`Continue (${selected.size})`}
            onPress={() => setStep(3)}
            disabled={selected.size === 0}
            style={styles.continueBtn}
          />
        </View>
      </ScrollView>
    );
  }

  function renderStep3() {
    if (!sourceCarton) return null;
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.stepContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Mini progress banner */}
        <View style={styles.progressBanner}>
          <Ionicons name="cube-outline" size={16} color={COLORS.primary} />
          <Text style={styles.progressBannerText}>
            {selected.size} box{selected.size !== 1 ? 'es' : ''} selected from{' '}
            <Text style={styles.mono}>{sourceCarton.carton_barcode}</Text>
          </Text>
        </View>

        <Card style={styles.scanCard}>
          <Button
            title="Scan Destination Carton"
            onPress={() => {
              setScannerTarget('dest');
              setScannerOpen(true);
            }}
            icon={<Ionicons name="qr-code-outline" size={20} color={COLORS.surface} />}
            fullWidth
          />
          <Text style={styles.scanHint}>
            Scan a CREATED or ACTIVE master carton to receive the selected boxes.
          </Text>
        </Card>

        {loading && (
          <View style={styles.spinnerRow}>
            <Spinner size="small" />
          </View>
        )}

        <Button
          title="Back"
          variant="outline"
          onPress={() => goToStep(2)}
          fullWidth
          style={styles.backBtnFull}
        />
      </ScrollView>
    );
  }

  function renderStep4() {
    if (!sourceCarton || !destCarton) return null;
    const selectedBarcodes = Array.from(selected);
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.stepContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Summary card */}
        <Card style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Repack Summary</Text>

          <View style={styles.transferRow}>
            <View style={styles.transferSide}>
              <Text style={styles.transferLabel}>FROM</Text>
              <Text style={styles.transferBarcode} numberOfLines={2}>
                {sourceCarton.carton_barcode}
              </Text>
              <Badge label={sourceCarton.status} type="carton" />
            </View>
            <Ionicons name="arrow-forward" size={24} color={COLORS.primary} style={styles.arrowIcon} />
            <View style={styles.transferSide}>
              <Text style={styles.transferLabel}>TO</Text>
              <Text style={styles.transferBarcode} numberOfLines={2}>
                {destCarton.carton_barcode}
              </Text>
              <Badge label={destCarton.status} type="carton" />
            </View>
          </View>

          <View style={styles.movingRow}>
            <Ionicons name="cube-outline" size={18} color={COLORS.primary} />
            <Text style={styles.movingText}>
              Moving{' '}
              <Text style={styles.movingCount}>{selected.size}</Text>{' '}
              box{selected.size !== 1 ? 'es' : ''}
            </Text>
          </View>
        </Card>

        {/* Expandable barcode list */}
        <TouchableOpacity
          style={styles.expandRow}
          onPress={() => setExpandBarcodes((v) => !v)}
          activeOpacity={0.7}
        >
          <Text style={styles.expandText}>
            {expandBarcodes ? 'Hide' : 'Show'} selected barcodes
          </Text>
          <Ionicons
            name={expandBarcodes ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={COLORS.primary}
          />
        </TouchableOpacity>

        {expandBarcodes && (
          <Card padded={false} style={styles.barcodeListCard}>
            {selectedBarcodes.map((bc, idx) => (
              <View
                key={bc}
                style={[
                  styles.barcodeListItem,
                  idx < selectedBarcodes.length - 1 && styles.barcodeListItemBorder,
                ]}
              >
                <Text style={styles.barcodeListText}>{bc}</Text>
              </View>
            ))}
          </Card>
        )}

        {/* Footer buttons */}
        <View style={styles.footerRow}>
          <Button
            title="Back"
            variant="outline"
            onPress={() => goToStep(3)}
            style={styles.backBtn}
          />
          <Button
            title="Commit Repack"
            variant="danger"
            onPress={confirmCommit}
            disabled={repackMutation.isPending}
            loading={repackMutation.isPending}
            icon={
              !repackMutation.isPending ? (
                <Ionicons name="swap-horizontal-outline" size={18} color={COLORS.surface} />
              ) : undefined
            }
            style={styles.continueBtn}
          />
        </View>
      </ScrollView>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <>
      <Stack.Screen options={{ title: 'Repack' }} />

      <View style={styles.root}>
        {/* Stepper */}
        <Stepper current={step} onPressStep={goToStep} />

        {/* Step content */}
        <View style={styles.stepArea}>
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
          {step === 4 && renderStep4()}
        </View>
      </View>

      {/* Scanner modal */}
      <BarcodeScanner
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
        expectedType="master"
        title={scannerTarget === 'source' ? 'Scan Source Carton' : 'Scan Destination Carton'}
      />
    </>
  );
}

// ─── Export (role-gated) ──────────────────────────────────────────────────────

export default function RepackScreen() {
  return (
    <RoleGate
      allow={['Admin', 'Supervisor', 'Warehouse Operator']}
      fallback={<DeniedView />}
    >
      <RepackFlow />
    </RoleGate>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  stepArea: {
    flex: 1,
    marginTop: 28, // room for stepper labels row below the dots
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  stepContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 12,
  },

  // Scan card
  scanCard: {
    gap: 10,
  },
  scanHint: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    marginTop: 4,
  },

  // Spinner
  spinnerRow: {
    alignItems: 'center',
    paddingVertical: 8,
  },

  // Carton info card
  infoCard: {
    gap: 8,
  },
  infoCardCompact: {
    paddingVertical: 12,
    gap: 4,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  barcodeText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginRight: 10,
  },
  barcodeTextSm: {
    fontSize: 13,
  },
  compactMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 3,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.borderLight,
  },
  summaryLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    flex: 1,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    flex: 2,
    textAlign: 'right',
  },

  // Select all row
  selectControlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  selectionCount: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  selectToggleText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '600',
  },

  // Box list card
  listCard: {
    overflow: 'hidden',
  },
  boxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
    backgroundColor: COLORS.surface,
  },
  boxRowSelected: {
    backgroundColor: COLORS.primary + '0A',
  },
  boxRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderLight,
  },
  checkboxIcon: {
    flexShrink: 0,
  },
  boxInfo: {
    flex: 1,
    minWidth: 0,
  },
  boxBarcode: {
    fontSize: 12,
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

  // Footer buttons row
  footerRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  backBtn: {
    flex: 1,
  },
  continueBtn: {
    flex: 2,
  },
  backBtnFull: {
    marginTop: 4,
  },

  // Progress banner (Step 3)
  progressBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.primary + '12',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.primary + '25',
  },
  progressBannerText: {
    fontSize: 13,
    color: COLORS.text,
    flex: 1,
  },
  mono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontWeight: '700',
  },

  // Step 4: summary card
  summaryCard: {
    gap: 14,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  transferRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  transferSide: {
    flex: 1,
    gap: 4,
  },
  transferLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  transferBarcode: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  arrowIcon: {
    flexShrink: 0,
  },
  movingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.borderLight,
  },
  movingText: {
    fontSize: 14,
    color: COLORS.text,
  },
  movingCount: {
    fontWeight: '700',
    color: COLORS.primary,
  },

  // Expandable barcode list
  expandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  expandText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '600',
  },
  barcodeListCard: {
    overflow: 'hidden',
  },
  barcodeListItem: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  barcodeListItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.borderLight,
  },
  barcodeListText: {
    fontSize: 12,
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});

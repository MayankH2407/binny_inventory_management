import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack } from '../navigation/router';
import Ionicons from 'react-native-vector-icons/Ionicons';
import * as Haptics from '../utils/haptics';
import { useQueryClient } from '@tanstack/react-query';

import { COLORS } from '../constants';
import { masterCartonService } from '../services/masterCarton.service';
import type { MasterCarton } from '../types';
import { parseQRCode } from '../utils';

import BarcodeScanner from '../components/BarcodeScanner';
import RoleGate from '../components/RoleGate';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import EmptyState from '../components/ui/EmptyState';

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'scan-carton' | 'box-scan';

interface ScanEntry {
  barcode: string;
  status: 'pending' | 'packed' | 'noop' | 'failed';
  message?: string;
}

const apiMessage = (err: unknown, fallback: string): string => {
  const e = err as { response?: { data?: { message?: string } }; message?: string };
  return e?.response?.data?.message ?? e?.message ?? fallback;
};

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

// ─── Repack flow ──────────────────────────────────────────────────────────────
// Mirrors the web's Unpack & Repack page (Repack tab): scan a carton → if it holds
// boxes, unpack it first → scan the boxes you want in it, one by one, through
// pack-by-barcode (serialized queue, idempotent) → optionally close the carton.
// The old source→destination transfer (/master-cartons/repack) was removed from
// the backend; plain Unpack stays on its own screen (/unpack).

function RepackFlow() {
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState<Phase>('scan-carton');
  const [carton, setCarton] = useState<MasterCarton | null>(null);
  const [manualCarton, setManualCarton] = useState('');
  const [manualBox, setManualBox] = useState('');
  const [looking, setLooking] = useState(false);
  const [freeing, setFreeing] = useState(false);
  const [closing, setClosing] = useState(false);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [keepScanning, setKeepScanning] = useState(true);
  const [scanLog, setScanLog] = useState<ScanEntry[]>([]);
  const [packedCount, setPackedCount] = useState(0);

  // Scans are processed strictly one at a time (a rapid burst must never fire
  // parallel pack calls — that was the old box-skipping bug).
  const queueRef = useRef<string[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const processingRef = useRef(false);
  const cartonIdRef = useRef<string | null>(null);

  const refreshLists = useCallback(() => {
    ['masterCartons', 'master-cartons', 'childBoxes', 'child-boxes', 'inventory', 'dashboard'].forEach((k) =>
      queryClient.invalidateQueries({ queryKey: [k] })
    );
  }, [queryClient]);

  const resetAll = useCallback(() => {
    setPhase('scan-carton');
    setCarton(null);
    cartonIdRef.current = null;
    setScanLog([]);
    setPackedCount(0);
    setManualCarton('');
    setManualBox('');
    setScannerOpen(false);
    queueRef.current = [];
    seenRef.current = new Set();
  }, []);

  const enterBoxScanMode = (c: MasterCarton) => {
    setCarton(c);
    cartonIdRef.current = c.id;
    setScanLog([]);
    setPackedCount(0);
    queueRef.current = [];
    seenRef.current = new Set();
    setPhase('box-scan');
  };

  // ── Carton lookup ───────────────────────────────────────────────────────────

  const handleCartonScan = async (raw: string) => {
    const parsed = parseQRCode(raw);
    const code = parsed.type === 'master' ? parsed.id : raw.trim().toUpperCase();
    if (!code) return;
    setLooking(true);
    try {
      const found = await masterCartonService.getByBarcode(code);
      if (found.status === 'DISPATCHED') {
        Alert.alert('Cannot repack', `Carton ${found.carton_barcode} has already been dispatched.`);
        return;
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if ((found.child_count ?? 0) > 0) {
        confirmUnpackFirst(found);
      } else {
        enterBoxScanMode(found);
      }
    } catch (err) {
      Alert.alert('Scan failed', apiMessage(err, 'Master carton not found'));
    } finally {
      setLooking(false);
    }
  };

  const confirmUnpackFirst = (c: MasterCarton) => {
    const n = c.child_count ?? 0;
    Alert.alert(
      'Unpack & repack',
      `Carton ${c.carton_barcode} currently holds ${n} box${n !== 1 ? 'es' : ''}. ` +
        'Unpack them (all go back to FREE) and start repacking?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unpack & Start', style: 'destructive', onPress: () => void unpackThenScan(c) },
      ]
    );
  };

  const unpackThenScan = async (c: MasterCarton) => {
    setFreeing(true);
    try {
      await masterCartonService.fullUnpack(c.id);
      refreshLists();
      enterBoxScanMode({ ...c, child_count: 0 });
    } catch (err) {
      Alert.alert('Could not unpack', apiMessage(err, 'Failed to empty the carton'));
    } finally {
      setFreeing(false);
    }
  };

  // ── Box scan queue ──────────────────────────────────────────────────────────

  const markEntry = useCallback((barcode: string, patch: Partial<ScanEntry>) => {
    setScanLog((prev) => {
      for (let i = prev.length - 1; i >= 0; i--) {
        if (prev[i].barcode === barcode && prev[i].status === 'pending') {
          const next = [...prev];
          next[i] = { ...next[i], ...patch };
          return next;
        }
      }
      return prev;
    });
  }, []);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    let packedAny = false;
    try {
      while (queueRef.current.length > 0) {
        const barcode = queueRef.current.shift()!;
        const targetId = cartonIdRef.current;
        if (!targetId) {
          markEntry(barcode, { status: 'failed', message: 'No carton selected' });
          seenRef.current.delete(barcode);
          continue;
        }
        try {
          const res = await masterCartonService.packByBarcode({ barcode, master_carton_id: targetId });
          if (res?.alreadyPacked) {
            markEntry(barcode, { status: 'noop', message: 'Already in this carton' });
          } else {
            markEntry(barcode, { status: 'packed' });
            setPackedCount((n) => n + 1);
            packedAny = true;
          }
        } catch (err) {
          markEntry(barcode, { status: 'failed', message: apiMessage(err, 'Failed to pack') });
          seenRef.current.delete(barcode);
        }
      }
    } finally {
      processingRef.current = false;
      if (packedAny) refreshLists();
    }
  }, [markEntry, refreshLists]);

  const handleBoxScan = useCallback(
    (raw: string) => {
      const parsed = parseQRCode(raw);
      const barcode = (parsed.type === 'child' ? parsed.id : raw).trim().toUpperCase();
      if (!barcode) return;
      if (seenRef.current.has(barcode)) {
        Alert.alert('Already scanned', `${barcode} was already scanned in this session.`);
        return;
      }
      seenRef.current.add(barcode);
      setScanLog((prev) => [{ barcode, status: 'pending' }, ...prev]);
      queueRef.current.push(barcode);
      void processQueue();
    },
    [processQueue]
  );

  const handleCameraBoxScan = (raw: string) => {
    handleBoxScan(raw);
    // The camera is single-shot (it closes after every scan) — optionally reopen
    // it so a whole carton can be scanned without tapping the camera each time.
    if (keepScanning) setTimeout(() => setScannerOpen(true), 400);
  };

  const handleManualBox = () => {
    const v = manualBox.trim();
    if (!v) return;
    handleBoxScan(v);
    setManualBox('');
  };

  const retryScan = (barcode: string) => {
    setScanLog((prev) => prev.filter((e) => !(e.barcode === barcode && e.status === 'failed')));
    handleBoxScan(barcode);
  };

  // ── Close carton ────────────────────────────────────────────────────────────

  const confirmClose = () => {
    if (!carton) return;
    Alert.alert(
      'Close carton',
      `Close ${carton.carton_barcode} with ${packedCount} box${packedCount !== 1 ? 'es' : ''}? ` +
        'A closed carton is ready for dispatch.',
      [
        { text: 'Not yet', style: 'cancel' },
        { text: 'Close carton', onPress: () => void closeCarton() },
      ]
    );
  };

  const closeCarton = async () => {
    if (!carton) return;
    setClosing(true);
    try {
      await masterCartonService.closeCarton(carton.id);
      refreshLists();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Carton closed', `${carton.carton_barcode} is closed.`);
      resetAll();
    } catch (err) {
      Alert.alert('Could not close carton', apiMessage(err, 'Failed to close carton'));
    } finally {
      setClosing(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const maxCapacity = carton?.max_capacity ?? 0;
  const capacityFull = maxCapacity > 0 && packedCount >= maxCapacity;
  const capacityWarning = maxCapacity > 0 && packedCount >= maxCapacity * 0.8;
  const pendingCount = scanLog.filter((e) => e.status === 'pending').length;

  if (phase === 'scan-carton') {
    return (
      <>
        <Stack.Screen options={{ title: 'Repack' }} />
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Card>
            <Text style={styles.heading}>Scan the carton to repack</Text>
            <Text style={styles.hint}>
              An empty carton goes straight to box scanning. A carton that holds boxes is unpacked first
              (its boxes go back to FREE), then you scan whichever boxes you want back in.
            </Text>
            <Button
              title="Scan Carton"
              onPress={() => setScannerOpen(true)}
              icon={<Ionicons name="scan-outline" size={18} color="#fff" />}
              loading={looking || freeing}
            />
            <View style={styles.spacer} />
            <Input
              label="Or enter carton barcode"
              value={manualCarton}
              onChangeText={setManualCarton}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="e.g. MC4CQH3N"
              onSubmitEditing={() => handleCartonScan(manualCarton)}
              returnKeyType="search"
            />
            <Button
              title="Find Carton"
              variant="outline"
              onPress={() => handleCartonScan(manualCarton)}
              disabled={!manualCarton.trim() || looking || freeing}
            />
          </Card>
          <Text style={styles.footnote}>
            To only empty a carton without repacking, use Unpack from the menu.
          </Text>
        </ScrollView>
        <BarcodeScanner
          visible={scannerOpen}
          onClose={() => setScannerOpen(false)}
          onScan={handleCartonScan}
          title="Scan Master Carton"
          expectedType="master"
        />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Repack' }} />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Card>
          <View style={styles.rowBetween}>
            <View>
              <Text style={styles.label}>Repacking carton</Text>
              <Text style={styles.mono}>{carton?.carton_barcode}</Text>
            </View>
            <View style={styles.alignEnd}>
              <Text style={styles.label}>Packed</Text>
              <Text
                style={[
                  styles.count,
                  capacityFull ? { color: COLORS.error } : capacityWarning ? { color: COLORS.warning } : { color: COLORS.success },
                ]}
              >
                {maxCapacity > 0 ? `${packedCount} / ${maxCapacity}` : packedCount}
              </Text>
            </View>
          </View>
          {capacityFull && <Badge label="Carton full" color={COLORS.error} />}
          {capacityWarning && !capacityFull && <Badge label="Nearing capacity" color={COLORS.warning} />}
        </Card>

        <Card>
          <Text style={styles.heading}>Scan boxes into this carton</Text>
          <Button
            title="Scan Box"
            onPress={() => setScannerOpen(true)}
            icon={<Ionicons name="scan-outline" size={18} color="#fff" />}
          />
          <View style={styles.rowBetween}>
            <Text style={styles.hint}>Keep camera open for the next box</Text>
            <Switch value={keepScanning} onValueChange={setKeepScanning} />
          </View>
          <Input
            label="Or enter box barcode"
            value={manualBox}
            onChangeText={setManualBox}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="e.g. CBHK0Q9J"
            onSubmitEditing={handleManualBox}
            returnKeyType="done"
            blurOnSubmit={false}
          />
          <Button title="Add Box" variant="outline" onPress={handleManualBox} disabled={!manualBox.trim()} />
          {pendingCount > 0 && <Text style={styles.hint}>Packing {pendingCount} scan(s)…</Text>}
        </Card>

        <Card>
          <View style={styles.rowBetween}>
            <Text style={styles.heading}>Scans ({scanLog.length})</Text>
          </View>
          {scanLog.length === 0 ? (
            <Text style={styles.hint}>Scanned boxes will appear here.</Text>
          ) : (
            scanLog.map((e, i) => (
              <View key={`${e.barcode}-${i}`} style={styles.logRow}>
                <View style={styles.flex1}>
                  <Text style={styles.mono}>{e.barcode}</Text>
                  {!!e.message && (
                    <Text style={[styles.logMsg, e.status === 'failed' && { color: COLORS.error }]}>{e.message}</Text>
                  )}
                </View>
                {e.status === 'pending' && <Badge label="Packing…" color={COLORS.info} />}
                {e.status === 'packed' && <Badge label="Packed" color={COLORS.success} />}
                {e.status === 'noop' && <Badge label="Already in" color={COLORS.textSecondary} />}
                {e.status === 'failed' && (
                  <TouchableOpacity onPress={() => retryScan(e.barcode)}>
                    <Badge label="Retry" color={COLORS.error} />
                  </TouchableOpacity>
                )}
              </View>
            ))
          )}
        </Card>

        <View style={styles.actions}>
          <RoleGate allow={['Admin', 'Supervisor']}>
            <Button
              title="Close Carton"
              onPress={confirmClose}
              loading={closing}
              disabled={packedCount === 0 || pendingCount > 0}
            />
            <View style={styles.spacer} />
          </RoleGate>
          <Button
            title={packedCount > 0 ? 'Done (leave open)' : 'Cancel'}
            variant="outline"
            onPress={() => {
              if (pendingCount > 0) {
                Alert.alert('Still packing', 'Wait for the current scans to finish.');
                return;
              }
              resetAll();
            }}
          />
        </View>
      </ScrollView>
      <BarcodeScanner
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleCameraBoxScan}
        title="Scan Box"
        expectedType="child"
      />
    </>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function RepackScreen() {
  return (
    <RoleGate allow={['Admin', 'Supervisor', 'Warehouse Operator']} fallback={<DeniedView />}>
      <RepackFlow />
    </RoleGate>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 40, gap: 12 },
  heading: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  hint: { fontSize: 13, color: COLORS.textSecondary, marginBottom: 10 },
  footnote: { fontSize: 12, color: COLORS.textLight, textAlign: 'center', marginTop: 4 },
  label: { fontSize: 12, color: COLORS.textSecondary },
  mono: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  count: { fontSize: 22, fontWeight: '700' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 6 },
  alignEnd: { alignItems: 'flex-end' },
  flex1: { flex: 1, marginRight: 8 },
  spacer: { height: 10 },
  actions: { marginTop: 4 },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  logMsg: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
});

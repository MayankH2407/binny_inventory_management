import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants';
import { parseQRCode } from '../utils';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BarcodeScannerProps {
  visible: boolean;
  onClose: () => void;
  onScan: (data: string) => void;
  title?: string;
  expectedType?: 'child' | 'master' | 'any';
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BarcodeScanner({
  visible,
  onClose,
  onScan,
  title = 'Scan QR Code',
  expectedType = 'any',
}: BarcodeScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();

  // Single-shot guard — reset each time the modal opens
  const scannedRef = useRef(false);

  // Toast state
  const [toastMessage, setToastMessage] = useState('');
  const toastOpacity = useRef(new Animated.Value(0)).current;

  // Reset guard when modal becomes visible
  useEffect(() => {
    if (visible) {
      scannedRef.current = false;
    }
  }, [visible]);

  // ── Toast helper ──────────────────────────────────────────────────────────

  const showToast = (message: string) => {
    setToastMessage(message);
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1600),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToastMessage(''));
  };

  // ── Barcode handler ───────────────────────────────────────────────────────

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scannedRef.current) return;
    scannedRef.current = true;

    const parsed = parseQRCode(data);

    if (expectedType !== 'any' && parsed.type !== expectedType) {
      const expected = expectedType === 'child' ? 'child box' : 'master carton';
      showToast(`Expected a ${expected} QR`);
      // Allow next scan after cooldown
      setTimeout(() => {
        scannedRef.current = false;
      }, 1500);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onScan(data);
    onClose();
  };

  // ── Overlay layout ────────────────────────────────────────────────────────

  const { width, height } = Dimensions.get('window');
  const frameSize = Math.round(Math.min(width, height) * 0.7);
  const frameTop = Math.round((height - frameSize) / 2);
  const frameLeft = Math.round((width - frameSize) / 2);

  // ── Render: permission not yet determined ─────────────────────────────────

  const renderPermissionRequest = () => (
    <View style={styles.permissionContainer}>
      <Ionicons name="camera-outline" size={64} color={COLORS.primary} />
      <Text style={styles.permissionTitle}>Camera Access Required</Text>
      <Text style={styles.permissionDesc}>
        Allow camera access to scan QR codes
      </Text>
      <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
        <Text style={styles.permissionButtonText}>Grant Camera Access</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.permissionClose} onPress={onClose}>
        <Text style={styles.permissionCloseText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Render: permission permanently denied ─────────────────────────────────

  const renderPermissionDenied = () => (
    <View style={styles.permissionContainer}>
      <Ionicons name="close-circle-outline" size={64} color={COLORS.error} />
      <Text style={styles.permissionTitle}>Camera Access Denied</Text>
      <Text style={styles.permissionDesc}>
        Camera access denied. Enable it from system settings.
      </Text>
      <TouchableOpacity style={styles.permissionButton} onPress={onClose}>
        <Text style={styles.permissionButtonText}>Close</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Render: camera scanner ────────────────────────────────────────────────

  const renderScanner = () => (
    <View style={styles.cameraContainer}>
      {/* Full-screen camera */}
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={handleBarcodeScanned}
      />

      {/* Dark overlay — top strip */}
      <View style={[styles.overlayStrip, { height: frameTop }]} />

      {/* Middle row: left strip + frame border + right strip */}
      <View style={[styles.overlayRow, { top: frameTop, height: frameSize }]}>
        <View style={[styles.overlayStrip, { width: frameLeft, height: frameSize }]} />
        {/* Transparent frame window (just the border) */}
        <View
          style={[
            styles.frameWindow,
            { width: frameSize, height: frameSize },
          ]}
        />
        <View style={[styles.overlayStrip, { width: frameLeft, height: frameSize }]} />
      </View>

      {/* Dark overlay — bottom strip */}
      <View style={[styles.overlayStrip, { position: 'absolute', top: frameTop + frameSize, bottom: 0, left: 0, right: 0 }]} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>{title}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="close" size={28} color={COLORS.surface} />
        </TouchableOpacity>
      </View>

      {/* Bottom hint */}
      <View style={styles.hintContainer}>
        <Text style={styles.hintText}>Point camera at the QR code</Text>
      </View>

      {/* Toast / rejection banner */}
      {toastMessage !== '' && (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </Animated.View>
      )}
    </View>
  );

  // ── Render body based on permission state ─────────────────────────────────

  const renderBody = () => {
    if (!permission || !permission.granted) {
      if (!permission || permission.status === 'undetermined') {
        return renderPermissionRequest();
      }
      return renderPermissionDenied();
    }
    return renderScanner();
  };

  // ── Modal wrapper ─────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent={Platform.OS === 'android'}
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        {renderBody()}
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    backgroundColor: '#000',
  },

  // ── Camera / overlay ──────────────────────────────────────────────────────
  cameraContainer: {
    flex: 1,
  },
  overlayStrip: {
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  overlayRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
  },
  frameWindow: {
    borderWidth: 2,
    borderColor: COLORS.accent,
    backgroundColor: 'transparent',
  },

  // ── Top bar ───────────────────────────────────────────────────────────────
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? 36 : 52,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.surface,
  },

  // ── Bottom hint ───────────────────────────────────────────────────────────
  hintContainer: {
    position: 'absolute',
    bottom: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  hintText: {
    fontSize: 14,
    color: COLORS.surface,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // ── Toast ─────────────────────────────────────────────────────────────────
  toast: {
    position: 'absolute',
    bottom: 110,
    alignSelf: 'center',
    backgroundColor: COLORS.error,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  toastText: {
    color: COLORS.surface,
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Permission screens ────────────────────────────────────────────────────
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.background,
    padding: 32,
    gap: 16,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
  },
  permissionDesc: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  permissionButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 10,
    marginTop: 8,
  },
  permissionButtonText: {
    color: COLORS.surface,
    fontSize: 15,
    fontWeight: '600',
  },
  permissionClose: {
    paddingVertical: 10,
    paddingHorizontal: 32,
  },
  permissionCloseText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
});

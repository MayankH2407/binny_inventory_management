'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Lazy-loaded type reference — the actual import happens at runtime
type Html5QrcodeType = import('html5-qrcode').Html5Qrcode;

interface UseQRScannerOptions {
  onScanSuccess: (decodedText: string) => void;
  onScanError?: (error: string) => void;
  fps?: number;
  qrbox?: { width: number; height: number };
  preferredCamera?: 'environment' | 'user';
}

/**
 * Dynamically imports html5-qrcode only when needed (saves ~200KB from initial bundle).
 */
async function getHtml5QrCode() {
  const { Html5Qrcode } = await import('html5-qrcode');
  return Html5Qrcode;
}

export function useQRScanner({
  onScanSuccess,
  onScanError,
  fps = 10,
  qrbox = { width: 250, height: 250 },
  preferredCamera = 'environment',
}: UseQRScannerOptions) {
  const scannerRef = useRef<Html5QrcodeType | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  const scannerElementId = 'qr-reader';

  const getCameras = useCallback(async () => {
    try {
      const Html5Qrcode = await getHtml5QrCode();
      const devices = await Html5Qrcode.getCameras();
      setCameras(devices);
      if (devices.length > 0) {
        const backCamera = devices.find(
          (d) =>
            d.label.toLowerCase().includes('back') ||
            d.label.toLowerCase().includes('rear') ||
            d.label.toLowerCase().includes('environment')
        );
        setActiveCameraId(
          preferredCamera === 'environment' && backCamera ? backCamera.id : devices[0].id
        );
        setHasPermission(true);
      }
    } catch {
      setHasPermission(false);
    }
  }, [preferredCamera]);

  const startScanning = useCallback(async () => {
    if (!activeCameraId || isScanning) return;

    try {
      const Html5Qrcode = await getHtml5QrCode();
      const scanner = new Html5Qrcode(scannerElementId);
      scannerRef.current = scanner;

      await scanner.start(
        activeCameraId,
        {
          fps,
          qrbox,
        },
        (decodedText) => {
          onScanSuccess(decodedText);
        },
        (errorMessage) => {
          if (onScanError) {
            onScanError(errorMessage);
          }
        }
      );

      setIsScanning(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start scanner';
      if (onScanError) onScanError(message);
    }
  }, [activeCameraId, isScanning, fps, qrbox, onScanSuccess, onScanError]);

  const stopScanning = useCallback(async () => {
    if (scannerRef.current && isScanning) {
      try {
        await scannerRef.current.stop();
        scannerRef.current.clear();
      } catch {
        // Scanner may already be stopped
      }
      scannerRef.current = null;
      setIsScanning(false);
    }
  }, [isScanning]);

  const switchCamera = useCallback(
    async (cameraId: string) => {
      await stopScanning();
      setActiveCameraId(cameraId);
    },
    [stopScanning]
  );

  useEffect(() => {
    getCameras();
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
    };
  }, [getCameras]);

  return {
    isScanning,
    hasPermission,
    cameras,
    activeCameraId,
    scannerElementId,
    startScanning,
    stopScanning,
    switchCamera,
    getCameras,
  };
}

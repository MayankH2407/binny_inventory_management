'use client';

import { useCallback, useEffect, useState } from 'react';
import { Camera, CameraOff, SwitchCamera, X, Maximize2, Minimize2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useQRScanner } from '@/hooks/useQRScanner';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useScanFeedback } from '@/hooks/useScanFeedback';
import { cn } from '@/lib/utils';

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanError?: (error: string) => void;
  className?: string;
  autoStart?: boolean;
  fullScreen?: boolean;
  onToggleFullScreen?: () => void;
  pendingOfflineCount?: number;
}

export default function QRScanner({
  onScanSuccess,
  onScanError,
  className,
  autoStart = false,
  fullScreen = false,
  onToggleFullScreen,
  pendingOfflineCount = 0,
}: QRScannerProps) {
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const { requestWakeLock, releaseWakeLock } = useWakeLock();
  const { triggerSuccess, triggerError } = useScanFeedback();

  const handleScanSuccess = useCallback(
    (decodedText: string) => {
      if (decodedText === lastScanned) {
        triggerError();
        return;
      }
      setLastScanned(decodedText);
      triggerSuccess();
      onScanSuccess(decodedText);
      setTimeout(() => setLastScanned(null), 2000);
    },
    [lastScanned, onScanSuccess, triggerSuccess, triggerError]
  );

  const {
    isScanning,
    hasPermission,
    cameras,
    activeCameraId,
    scannerElementId,
    startScanning,
    stopScanning,
    switchCamera,
  } = useQRScanner({
    onScanSuccess: handleScanSuccess,
    onScanError,
    fps: 10,
    qrbox: { width: 250, height: 250 },
    preferredCamera: 'environment',
  });

  // Wake lock: keep screen on while scanning
  useEffect(() => {
    if (isScanning) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }
  }, [isScanning, requestWakeLock, releaseWakeLock]);

  useEffect(() => {
    if (autoStart && hasPermission && activeCameraId && !isScanning) {
      startScanning();
    }
  }, [autoStart, hasPermission, activeCameraId, isScanning, startScanning]);

  if (hasPermission === false) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-4 p-8 bg-gray-50 rounded-xl border border-brand-border',
          className
        )}
      >
        <CameraOff className="h-12 w-12 text-brand-text-muted" />
        <div className="text-center">
          <p className="font-medium text-brand-text-dark">Camera Access Required</p>
          <p className="text-sm text-brand-text-muted mt-1">
            Please allow camera access in your browser settings to scan QR codes.
          </p>
        </div>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  const scannerContent = (
    <>
      <div className={cn('relative overflow-hidden', fullScreen ? 'flex-1' : 'rounded-xl bg-black')}>
        <div
          id={scannerElementId}
          className={cn('w-full', fullScreen ? 'h-full' : 'aspect-square max-h-[400px]')}
        />

        {isScanning && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-64 h-64 relative">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-binny-red rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-binny-red rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-binny-red rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-binny-red rounded-br-lg" />
                <div className="absolute top-0 left-0 right-0 h-0.5 bg-binny-red/80 animate-pulse" style={{ animation: 'scanLine 2s ease-in-out infinite' }} />
              </div>
            </div>
          </div>
        )}

        {lastScanned && (
          <div className="absolute bottom-4 inset-x-4 bg-brand-success/90 text-white text-sm font-medium py-2 px-4 rounded-lg text-center">
            Scanned: {lastScanned}
          </div>
        )}

        {/* Full-screen overlay controls */}
        {fullScreen && (
          <>
            <button
              onClick={onToggleFullScreen}
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            {pendingOfflineCount > 0 && (
              <div className="absolute top-4 left-4 z-10 px-3 py-1.5 rounded-full bg-amber-500 text-white text-xs font-semibold">
                {pendingOfflineCount} pending sync
              </div>
            )}
          </>
        )}
      </div>

      <div className={cn('flex items-center justify-center gap-3', fullScreen && 'py-4 bg-black')}>
        {!isScanning ? (
          <Button
            onClick={startScanning}
            leftIcon={<Camera className="h-4 w-4" />}
            disabled={!activeCameraId}
          >
            Start Scanning
          </Button>
        ) : (
          <Button
            onClick={stopScanning}
            variant="secondary"
            leftIcon={<CameraOff className="h-4 w-4" />}
          >
            Stop Scanning
          </Button>
        )}

        {cameras.length > 1 && (
          <Button
            variant="outline"
            size="md"
            onClick={() => {
              const currentIndex = cameras.findIndex((c) => c.id === activeCameraId);
              const nextIndex = (currentIndex + 1) % cameras.length;
              switchCamera(cameras[nextIndex].id);
            }}
            leftIcon={<SwitchCamera className="h-4 w-4" />}
          >
            Switch
          </Button>
        )}

        {!fullScreen && onToggleFullScreen && (
          <Button
            variant="ghost"
            size="md"
            onClick={onToggleFullScreen}
            leftIcon={<Maximize2 className="h-4 w-4" />}
          >
            Full Screen
          </Button>
        )}
      </div>
    </>
  );

  // Full-screen mode: fixed overlay covering everything
  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        {scannerContent}
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      {scannerContent}
    </div>
  );
}

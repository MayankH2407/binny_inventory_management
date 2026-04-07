'use client';

import { WifiOff, Wifi } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

export default function NetworkStatusBar() {
  const { isOnline, wasOffline } = useNetworkStatus();

  if (isOnline && !wasOffline) return null;

  if (!isOnline) {
    return (
      <div
        className="flex items-center justify-center gap-2 h-8 text-xs font-medium text-white animate-slide-up shrink-0"
        style={{ backgroundColor: '#D97706', zIndex: 50 }}
      >
        <WifiOff className="h-3.5 w-3.5" />
        <span>You are offline — scans will be saved locally</span>
      </div>
    );
  }

  // wasOffline && isOnline — show "back online" briefly
  return (
    <div
      className="flex items-center justify-center gap-2 h-8 text-xs font-medium text-white animate-slide-up shrink-0"
      style={{ backgroundColor: '#16A34A', zIndex: 50 }}
    >
      <Wifi className="h-3.5 w-3.5" />
      <span>Back online — syncing...</span>
    </div>
  );
}

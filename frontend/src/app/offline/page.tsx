'use client';

import { WifiOff } from 'lucide-react';
import Button from '@/components/ui/Button';

export default function OfflinePage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #2D2A6E 0%, #1E1A5F 40%, #0F0D3A 100%)' }}
    >
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          <div
            className="h-1.5"
            style={{ background: 'linear-gradient(90deg, #E31E24 0%, #2D2A6E 100%)' }}
          />
          <div className="p-8 text-center">
            <div
              className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
              style={{ backgroundColor: '#F5F4FF' }}
            >
              <WifiOff className="w-8 h-8" style={{ color: '#2D2A6E' }} />
            </div>
            <h1 className="text-xl font-bold text-brand-text-dark mb-2">You&apos;re Offline</h1>
            <p className="text-sm text-brand-text-muted mb-6">
              Please check your internet connection and try again.
            </p>
            <Button
              fullWidth
              size="lg"
              onClick={() => window.location.reload()}
            >
              Retry Connection
            </Button>
          </div>
        </div>
        <p className="text-center text-xs text-white/40 mt-6">
          Binny Inventory &mdash; Powered by Basiq360
        </p>
      </div>
    </div>
  );
}

'use client';

import { X, Download } from 'lucide-react';
import { useInstallPrompt } from '@/hooks/useInstallPrompt';
import Button from './Button';

export default function InstallPromptBanner() {
  const { canInstall, promptInstall, dismissInstall } = useInstallPrompt();

  if (!canInstall) return null;

  return (
    <div
      className="fixed bottom-16 lg:bottom-0 left-0 right-0 z-40 animate-slide-up"
    >
      <div
        className="mx-3 mb-3 rounded-xl p-4 flex items-center gap-3 shadow-elevated text-white"
        style={{ background: 'linear-gradient(135deg, #2D2A6E 0%, #3D3A8E 100%)' }}
      >
        <img
          src={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/monogram.png`}
          alt="Binny"
          className="w-10 h-10 brightness-0 invert shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Install Binny Inventory</p>
          <p className="text-xs text-white/70">Get faster access from your home screen</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={promptInstall}
          leftIcon={<Download className="h-3.5 w-3.5" />}
        >
          Install
        </Button>
        <button
          onClick={dismissInstall}
          className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

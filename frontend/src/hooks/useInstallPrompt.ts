'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'binny_install_dismissed';

export function useInstallPrompt() {
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if already dismissed
    if (localStorage.getItem(DISMISS_KEY) === 'true') {
      setIsDismissed(true);
      return;
    }

    // Check if already installed as standalone
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPrompt.current = e as BeforeInstallPromptEvent;

      // Only show on mobile/touch devices
      const isMobile = 'ontouchstart' in window || window.matchMedia('(max-width: 768px)').matches;
      if (isMobile) {
        setCanInstall(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt.current) return;
    await deferredPrompt.current.prompt();
    const { outcome } = await deferredPrompt.current.userChoice;
    if (outcome === 'accepted') {
      setCanInstall(false);
    }
    deferredPrompt.current = null;
  }, []);

  const dismissInstall = useCallback(() => {
    localStorage.setItem(DISMISS_KEY, 'true');
    setIsDismissed(true);
    setCanInstall(false);
  }, []);

  return { canInstall: canInstall && !isDismissed, promptInstall, dismissInstall, isDismissed };
}
